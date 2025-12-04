export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/utils/supabase/server'
import { getUserIdFromRequest } from '@/utils/supabase/server'
import { AlpacaWrapper } from '@/lib/alpaca-client'

// POST - Fix buy/sell prices for existing trades by fetching actual execution prices from Alpaca
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createServerClient(req, {})
    const { userId, isDemo } = await getUserIdFromRequest(req)
    
    const body = await req.json()
    const { symbol } = body // Optional: fix specific symbol, or fix all if not provided

    console.log(`[FIX-PRICES] Starting price fix for user ${userId}, symbol: ${symbol || 'ALL'}`)

    // Get API keys
    const { data: apiKeys, error: keysError } = await supabase
      .from('api_keys')
      .select('alpaca_api_key, alpaca_api_secret')
      .eq('user_id', userId)
      .eq('account_type', isDemo ? 'paper' : 'live')
      .single()

    if (keysError || !apiKeys) {
      return NextResponse.json({ 
        success: false, 
        error: 'API keys not found' 
      }, { status: 404 })
    }

    // Initialize Alpaca client
    const alpacaClient = new AlpacaWrapper(
      apiKeys.alpaca_api_key,
      apiKeys.alpaca_api_secret,
      isDemo ? 'paper' : 'live'
    )
    await alpacaClient.initialize()

    // Fetch trades that need fixing
    let query = supabase
      .from('trade_logs')
      .select('id, symbol, alpaca_order_id, buy_price, sell_price, action, status, qty')
      .eq('user_id', userId)
      .not('alpaca_order_id', 'is', null)

    if (symbol) {
      query = query.eq('symbol', symbol.toUpperCase())
    }

    const { data: trades, error: tradesError } = await query

    if (tradesError) {
      console.error('[FIX-PRICES] Error fetching trades:', tradesError)
      return NextResponse.json({ 
        success: false, 
        error: 'Failed to fetch trades' 
      }, { status: 500 })
    }

    if (!trades || trades.length === 0) {
      return NextResponse.json({ 
        success: true, 
        message: 'No trades found to fix',
        fixed: 0
      })
    }

    console.log(`[FIX-PRICES] Found ${trades.length} trades to check`)

    let fixedCount = 0
    let errorCount = 0
    const results: any[] = []

    for (const trade of trades) {
      try {
        if (!trade.alpaca_order_id) continue

        // Get order from Alpaca
        const order = await alpacaClient.getOrder(trade.alpaca_order_id)
        
        if (!order) {
          console.warn(`[FIX-PRICES] Order ${trade.alpaca_order_id} not found in Alpaca`)
          errorCount++
          continue
        }

        const filledPrice = order.filled_avg_price ? parseFloat(order.filled_avg_price) : null

        if (!filledPrice || filledPrice <= 0) {
          console.warn(`[FIX-PRICES] Order ${trade.alpaca_order_id} has no filled price`)
          continue
        }

        // Check if price needs updating
        const currentPrice = trade.action === 'buy' ? trade.buy_price : trade.sell_price
        const priceDiff = Math.abs(filledPrice - (currentPrice || 0))

        if (priceDiff > 0.01) { // Only update if difference is significant (>1 cent)
          console.log(`[FIX-PRICES] ${trade.symbol} ${trade.action}: Updating ${trade.action}_price from $${currentPrice} to $${filledPrice.toFixed(4)}`)

          if (trade.action === 'buy' && trade.status === 'open') {
            // Update buy price for open trades
            const { error: updateError } = await supabase
              .from('trade_logs')
              .update({
                buy_price: filledPrice,
                price: filledPrice,
                total_value: trade.qty * filledPrice,
                updated_at: new Date().toISOString()
              })
              .eq('id', trade.id)

            if (updateError) {
              console.error(`[FIX-PRICES] Error updating buy price for trade ${trade.id}:`, updateError)
              errorCount++
            } else {
              fixedCount++
              results.push({
                trade_id: trade.id,
                symbol: trade.symbol,
                action: trade.action,
                old_price: currentPrice,
                new_price: filledPrice,
                status: 'updated'
              })
            }
          } else if (trade.action === 'buy' && trade.status === 'closed') {
            // For closed trades, we need to recalculate profit/loss
            // First update buy_price
            const { data: tradeData } = await supabase
              .from('trade_logs')
              .select('sell_price, qty')
              .eq('id', trade.id)
              .single()

            if (tradeData && tradeData.sell_price) {
              const newPl = (tradeData.sell_price - filledPrice) * tradeData.qty
              const newPlPercent = filledPrice > 0 ? ((tradeData.sell_price - filledPrice) / filledPrice) * 100 : 0

              const { error: updateError } = await supabase
                .from('trade_logs')
                .update({
                  buy_price: filledPrice,
                  price: filledPrice,
                  total_value: trade.qty * filledPrice,
                  profit_loss: newPl,
                  profit_loss_percent: newPlPercent,
                  updated_at: new Date().toISOString()
                })
                .eq('id', trade.id)

              if (updateError) {
                console.error(`[FIX-PRICES] Error updating closed buy trade ${trade.id}:`, updateError)
                errorCount++
              } else {
                fixedCount++
                results.push({
                  trade_id: trade.id,
                  symbol: trade.symbol,
                  action: trade.action,
                  old_price: currentPrice,
                  new_price: filledPrice,
                  old_pl: (tradeData.sell_price - currentPrice) * tradeData.qty,
                  new_pl: newPl,
                  status: 'updated'
                })
              }
            }
          } else if (trade.action === 'sell' && trade.status === 'closed') {
            // For sell orders, update sell_price and recalculate P&L
            const { data: tradeData } = await supabase
              .from('trade_logs')
              .select('buy_price, qty')
              .eq('id', trade.id)
              .single()

            if (tradeData && tradeData.buy_price) {
              const newPl = (filledPrice - tradeData.buy_price) * tradeData.qty
              const newPlPercent = tradeData.buy_price > 0 ? ((filledPrice - tradeData.buy_price) / tradeData.buy_price) * 100 : 0

              const { error: updateError } = await supabase
                .from('trade_logs')
                .update({
                  sell_price: filledPrice,
                  price: filledPrice,
                  profit_loss: newPl,
                  profit_loss_percent: newPlPercent,
                  updated_at: new Date().toISOString()
                })
                .eq('id', trade.id)

              if (updateError) {
                console.error(`[FIX-PRICES] Error updating sell price for trade ${trade.id}:`, updateError)
                errorCount++
              } else {
                fixedCount++
                results.push({
                  trade_id: trade.id,
                  symbol: trade.symbol,
                  action: trade.action,
                  old_price: currentPrice,
                  new_price: filledPrice,
                  old_pl: (currentPrice - tradeData.buy_price) * tradeData.qty,
                  new_pl: newPl,
                  status: 'updated'
                })
              }
            }
          }

          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 100))
        } else {
          console.log(`[FIX-PRICES] ${trade.symbol} ${trade.action}: Price already correct (${filledPrice.toFixed(4)})`)
        }
      } catch (error) {
        console.error(`[FIX-PRICES] Error processing trade ${trade.id}:`, error)
        errorCount++
      }
    }

    return NextResponse.json({
      success: true,
      message: `Fixed ${fixedCount} trades, ${errorCount} errors`,
      fixed: fixedCount,
      errors: errorCount,
      results
    })

  } catch (error: any) {
    console.error('[FIX-PRICES] Error:', error)
    return NextResponse.json({ 
      success: false, 
      error: error.message || 'Unknown error' 
    }, { status: 500 })
  }
}

