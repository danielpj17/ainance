export const runtime = 'nodejs'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, getUserIdFromRequest, getAlpacaKeysForUser } from '@/utils/supabase/server'
import { createAlpacaClient } from '@/lib/alpaca-client'
import crypto from 'crypto'
import { Order } from '@/lib/alpaca-client'

export interface TradeLog {
  id: bigint
  symbol: string
  trade_pair_id: string
  action: string
  qty: number
  price: number
  total_value: number
  timestamp: string
  status: string
  buy_timestamp?: string
  buy_price?: number
  buy_decision_metrics?: any
  sell_timestamp?: string
  sell_price?: number
  sell_decision_metrics?: any
  profit_loss?: number
  profit_loss_percent?: number
  holding_duration?: string
  strategy: string
  account_type: string
  alpaca_order_id?: string
  order_status?: string
  created_at: string
  updated_at: string
}

export interface CurrentTrade {
  id: bigint
  symbol: string
  qty: number
  buy_price: number
  buy_timestamp: string
  current_price: number
  current_value: number
  unrealized_pl: number
  unrealized_pl_percent: number
  holding_duration: string
  buy_decision_metrics: any
  strategy: string
  account_type: string
  trade_pair_id: string
  transaction_ids?: string[]
  transaction_count?: number
}

export interface CompletedTrade {
  id: bigint
  symbol: string
  qty: number
  buy_price: number
  buy_timestamp: string
  sell_price: number
  sell_timestamp: string
  profit_loss: number
  profit_loss_percent: number
  holding_duration: string
  buy_decision_metrics: any
  sell_decision_metrics: any
  strategy: string
  account_type: string
  trade_pair_id: string
  transaction_ids?: string[]
  transaction_count?: number
}

export interface TradeStatistics {
  total_trades: number
  open_trades: number
  closed_trades: number
  winning_trades: number
  losing_trades: number
  total_profit_loss: number
  avg_profit_loss: number
  win_rate: number
  avg_holding_duration: string
  best_trade: number
  worst_trade: number
}

// POST - Create or update trade log, or fix prices
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createServerClient(req, {})
    const { userId, isDemo } = await getUserIdFromRequest(req)
    
    const body = await req.json().catch(() => ({}))
    const { action, symbol, qty, price, decision_metrics, strategy, account_type, alpaca_order_id, order_status, trade_pair_id } = body

    // Handle fix-prices action
    if (action === 'fix-prices') {

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
    const alpacaClient = createAlpacaClient({
      apiKey: apiKeys.alpaca_api_key,
      secretKey: apiKeys.alpaca_api_secret,
      baseUrl: isDemo ? 'https://paper-api.alpaca.markets' : 'https://api.alpaca.markets',
      paper: isDemo
    })
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
    }

    // Handle buy/sell actions (existing POST logic)
    if (!action || !symbol || !qty || !price || !strategy || !account_type) {
      return NextResponse.json({ 
        success: false, 
        error: 'Missing required fields' 
      }, { status: 400 })
    }

    if (action === 'buy') {
      // Create new trade log for buy
      const { data: tradeLog, error: insertError } = await supabase
        .from('trade_logs')
        .insert({
          user_id: userId,
          symbol,
          trade_pair_id: trade_pair_id || undefined, // Let DB generate if not provided
          action: 'buy',
          qty: parseFloat(qty),
          price: parseFloat(price),
          total_value: parseFloat(qty) * parseFloat(price),
          timestamp: new Date().toISOString(),
          status: 'open',
          buy_timestamp: new Date().toISOString(),
          buy_price: parseFloat(price),
          buy_decision_metrics: decision_metrics,
          strategy,
          account_type,
          alpaca_order_id,
          order_status
        })
        .select()
        .single()

      if (insertError) {
        console.error('Error creating trade log:', insertError)
        return NextResponse.json({ 
          success: false, 
          error: 'Failed to create trade log' 
        }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        data: tradeLog
      })

    } else if (action === 'sell') {
      // Update existing trade log for sell
      const { error: closeError } = await supabase.rpc('close_trade_position', {
        user_uuid: userId,
        symbol_param: symbol,
        sell_qty: parseFloat(qty),
        sell_price_param: parseFloat(price),
        sell_metrics: decision_metrics
      })

      if (closeError) {
        console.error('Error closing trade position:', closeError)
        return NextResponse.json({ 
          success: false, 
          error: 'Failed to close trade position' 
        }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        message: 'Trade position closed successfully'
      })

              } else {
      return NextResponse.json({ 
        success: false, 
        error: 'Invalid action. Must be "fix-prices", "buy", or "sell"' 
      }, { status: 400 })
    }

  } catch (error: any) {
    console.error('Error in POST /api/trade-logs:', error)
    return NextResponse.json({ 
      success: false, 
      error: error.message || 'Internal server error' 
    }, { status: 500 })
  }
}

// GET - Fetch trade logs directly from Alpaca
export async function GET(req: NextRequest): Promise<NextResponse> {
  console.log('[TRADE-LOGS] GET HANDLER CALLED - Fetching from Alpaca')
  try {
    const supabase = await createServerClient(req, {})
    
    // Get user ID from request (checks Authorization header)
    const { userId, isDemo } = await getUserIdFromRequest(req)
    console.log('[TRADE-LOGS] User detected:', { userId, isDemo })

    const { searchParams } = new URL(req.url)
    const view = searchParams.get('view') // 'current', 'completed', 'all', 'statistics', 'transactions'
    const limit = parseInt(searchParams.get('limit') || '500') // Increased limit for Alpaca orders
    const offset = parseInt(searchParams.get('offset') || '0')
    console.log('[TRADE-LOGS] Request params: view=' + view + ', limit=' + limit + ', offset=' + offset)

    let currentTrades: CurrentTrade[] = []
    let completedTrades: CompletedTrade[] = []
    let statistics: TradeStatistics | null = null

    // Statistics will be calculated from Alpaca data after fetching trades

    // Fetch current positions from Supabase only (no Alpaca calls)
    if (view === 'current' || view === 'all' || !view) {
      console.log('[TRADE-LOGS] Fetching current positions from Supabase')
      console.log(`[TRADE-LOGS] User ID: ${userId}`)
      
      // Fetch for both paper and live accounts
      const accountTypes: ('paper' | 'live')[] = ['paper', 'live']
      
      for (const accountType of accountTypes) {
        try {
          // First, let's check if there are ANY trades for this user/account
          const { data: allTradesCheck, error: checkError } = await supabase
            .from('trade_logs')
            .select('id, symbol, action, status, account_type')
            .eq('user_id', userId)
            .eq('account_type', accountType)
            .limit(10)
          
          console.log(`[TRADE-LOGS] Total trades in Supabase for ${accountType}: ${allTradesCheck?.length || 0}`)
          if (allTradesCheck && allTradesCheck.length > 0) {
            console.log(`[TRADE-LOGS] Sample trades:`, allTradesCheck.map(t => ({ symbol: t.symbol, action: t.action, status: t.status })))
          }
          
          // Fetch ALL trades first to see what we have
          const { data: allTradesForAccount, error: allTradesError } = await supabase
            .from('trade_logs')
            .select('id, symbol, action, status, account_type, user_id')
            .eq('user_id', userId)
            .eq('account_type', accountType)
          
          console.log(`[TRADE-LOGS] All trades for ${accountType}: ${allTradesForAccount?.length || 0}`)
          
          // Now fetch open trades from Supabase
          const { data: supabaseTrades, error: supabaseError } = await supabase
            .from('trade_logs')
            .select('*')
            .eq('user_id', userId)
            .eq('account_type', accountType)
            .eq('action', 'buy')
            .eq('status', 'open')
            .order('timestamp', { ascending: false })
          
          if (supabaseError) {
            console.error(`[TRADE-LOGS] Error fetching from Supabase for ${accountType}:`, supabaseError)
            continue
          }
          
          console.log(`[TRADE-LOGS] Found ${supabaseTrades?.length || 0} open trades in Supabase for ${accountType} account`)
          
          if (supabaseTrades && supabaseTrades.length > 0) {
            // Helper function to group trades by similar price and timestamp
            function groupSimilarTrades(trades: any[]): any[][] {
              if (trades.length === 0) return []
              
              // Sort by timestamp
              const sorted = [...trades].sort((a, b) => 
                new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
              )
              
              const groups: any[][] = []
              
              for (const trade of sorted) {
                const tradePrice = parseFloat(trade.price || trade.buy_price || '0')
                const tradeTime = new Date(trade.timestamp).getTime()
                
                // Find a group where this trade fits (similar price and within 10 minutes)
                let foundGroup = false
                for (const group of groups) {
                  const groupPrice = parseFloat(group[0].price || group[0].buy_price || '0')
                  const groupTime = new Date(group[0].timestamp).getTime()
                  
                  // Check if price is within 0.5% and time is within 10 minutes
                  const priceDiff = Math.abs(tradePrice - groupPrice) / groupPrice
                  const timeDiff = Math.abs(tradeTime - groupTime) / (1000 * 60) // minutes
                  
                  if (priceDiff <= 0.005 && timeDiff <= 10) {
                    group.push(trade)
                    foundGroup = true
                    break
                  }
                }
                
                if (!foundGroup) {
                  groups.push([trade])
                }
              }
              
              return groups
            }
            
            // Group by symbol first
            const tradesBySymbol = new Map<string, any[]>()
            for (const trade of supabaseTrades) {
              const symbol = trade.symbol.toUpperCase()
              if (!tradesBySymbol.has(symbol)) {
                tradesBySymbol.set(symbol, [])
              }
              tradesBySymbol.get(symbol)!.push(trade)
            }
            
            // Aggregate each symbol's trades (grouped by similar price/time)
            for (const [symbol, allTradesForSymbol] of tradesBySymbol) {
              // Group similar trades together
              const tradeGroups = groupSimilarTrades(allTradesForSymbol)
              
              // Process each group as a single trade entry
              for (const trades of tradeGroups) {
                // Aggregate quantities and calculate weighted average buy price
                const totalQty = trades.reduce((sum, t) => sum + parseFloat(t.qty || '0'), 0)
                const totalValue = trades.reduce((sum, t) => sum + parseFloat(t.total_value || '0'), 0)
                const avgBuyPrice = totalQty > 0 ? totalValue / totalQty : 0
                
                // Get most recent buy timestamp and decision metrics
                const mostRecentTrade = trades.sort((a, b) => 
                  new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
                )[0]
                
                // For current price, use buy price as fallback (can be enhanced later with separate price fetch)
                const currentPrice = avgBuyPrice
                const marketValue = totalQty * currentPrice
                const unrealizedPl = marketValue - totalValue
                const unrealizedPlPercent = totalValue > 0 ? ((unrealizedPl / totalValue) * 100) : 0
                
                // Calculate holding duration from oldest buy
                const oldestTrade = trades.sort((a, b) => 
                  new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
                )[0]
                const buyTime = new Date(oldestTrade.buy_timestamp || oldestTrade.timestamp).getTime()
                const now = Date.now()
                const duration = now - buyTime
                const totalSeconds = Math.floor(duration / 1000)
                const days = Math.floor(totalSeconds / 86400)
                const hours = Math.floor((totalSeconds % 86400) / 3600)
                const minutes = Math.floor((totalSeconds % 3600) / 60)
                const seconds = totalSeconds % 60
                const holdingDuration = days > 0 
                  ? `${days} day${days > 1 ? 's' : ''} ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
                  : `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
                
                // Store transaction IDs for this grouped trade
                const transactionIds = trades.map(t => t.id.toString())
                    
                    currentTrades.push({
                  id: BigInt(mostRecentTrade.id),
                  symbol,
                  qty: totalQty,
                  buy_price: avgBuyPrice,
                  buy_timestamp: mostRecentTrade.buy_timestamp || mostRecentTrade.timestamp,
                  current_price: currentPrice,
                  current_value: marketValue,
                  unrealized_pl: unrealizedPl,
                  unrealized_pl_percent: unrealizedPlPercent,
                  holding_duration: holdingDuration,
                  buy_decision_metrics: mostRecentTrade.buy_decision_metrics || {
                        confidence: 0,
                    reasoning: 'Position from Supabase'
                  },
                  strategy: mostRecentTrade.strategy || 'cash',
                  account_type: accountType,
                  trade_pair_id: mostRecentTrade.trade_pair_id,
                  transaction_ids: transactionIds, // Store IDs of individual transactions
                  transaction_count: trades.length // Number of transactions in this group
                })
              }
            }
          }
        } catch (error: any) {
          console.error(`[TRADE-LOGS] Error fetching current trades for ${accountType}:`, error?.message || error)
        }
      }
      
      // Sort by most recent and limit to 10 for initial display
      currentTrades.sort((a, b) => 
        new Date(b.buy_timestamp).getTime() - new Date(a.buy_timestamp).getTime()
      )
      
      console.log(`[TRADE-LOGS] Total current trades (aggregated): ${currentTrades.length}`)
    }

    // Helper function to sync Alpaca order to Supabase
    async function syncOrderToSupabase(order: Order, accountType: string, supabase: any, userId: string) {
      try {
        if (!order.id) {
          console.warn(`[SYNC] Order missing ID, skipping: ${order.symbol}`)
          return
        }

        const orderId = order.id
        const symbol = order.symbol.toUpperCase()
        const side = order.side.toLowerCase() // 'buy' or 'sell'
        const filledQty = parseFloat(order.filled_qty || '0')
        const filledPrice = parseFloat(order.filled_avg_price || '0')
        const orderStatus = order.status
        const filledAt = order.filled_at || order.created_at
        const timestamp = filledAt || order.created_at || new Date().toISOString()

        if (filledQty <= 0 || filledPrice <= 0) {
          console.warn(`[SYNC] Order ${orderId} has invalid qty or price, skipping`)
          return
        }

        // Check if order already exists in Supabase
        const { data: existingOrder } = await supabase
          .from('trade_logs')
          .select('id, trade_pair_id')
          .eq('user_id', userId)
          .eq('alpaca_order_id', orderId)
          .single()

        const orderData: any = {
          user_id: userId,
          symbol,
          action: side,
          qty: filledQty,
          price: filledPrice,
          total_value: filledQty * filledPrice,
          timestamp,
          status: side === 'buy' ? 'open' : 'closed', // Buy orders are open until sold
          order_status: orderStatus,
          alpaca_order_id: orderId,
          account_type: accountType,
          strategy: 'cash', // Default, can be updated from decision metrics
          updated_at: new Date().toISOString()
        }

        // Add buy/sell specific fields
        if (side === 'buy') {
          orderData.buy_timestamp = timestamp
          orderData.buy_price = filledPrice
        } else {
          orderData.sell_timestamp = timestamp
          orderData.sell_price = filledPrice
        }

        if (existingOrder) {
          // Update existing order with latest data from Alpaca
          const { error: updateError } = await supabase
            .from('trade_logs')
            .update({
              ...orderData,
              trade_pair_id: existingOrder.trade_pair_id // Preserve existing trade_pair_id
            })
            .eq('id', existingOrder.id)

          if (updateError) {
            console.error(`[SYNC] Error updating order ${orderId}:`, updateError)
              } else {
            console.log(`[SYNC] Updated order ${orderId} for ${symbol} ${side}`)
              }
            } else {
          // Insert new order
          // For buy orders, generate new trade_pair_id. For sell orders, try to match with existing buy
          let tradePairId = crypto.randomUUID()
          
          if (side === 'sell') {
            // Try to find matching buy order for this symbol (FIFO)
            const { data: buyOrder } = await supabase
              .from('trade_logs')
              .select('trade_pair_id, buy_price, qty')
              .eq('user_id', userId)
              .eq('symbol', symbol)
              .eq('action', 'buy')
              .eq('status', 'open')
              .eq('account_type', accountType)
              .order('timestamp', { ascending: true })
              .limit(1)
              .single()

            if (buyOrder) {
              tradePairId = buyOrder.trade_pair_id
              
              // Calculate P&L
              const buyPrice = parseFloat(buyOrder.buy_price || '0')
              const buyQty = parseFloat(buyOrder.qty || '0')
              const sellQty = filledQty
              const tradeQty = Math.min(buyQty, sellQty)
              const pl = (filledPrice - buyPrice) * tradeQty
              const plPercent = buyPrice > 0 ? ((filledPrice - buyPrice) / buyPrice) * 100 : 0
              
              // Calculate holding duration
              const { data: buyOrderFull } = await supabase
                .from('trade_logs')
                .select('buy_timestamp')
                .eq('trade_pair_id', tradePairId)
                .eq('action', 'buy')
                .eq('user_id', userId)
                .single()
              
              let holdingDuration = '0:0:0'
              if (buyOrderFull?.buy_timestamp) {
                const buyTime = new Date(buyOrderFull.buy_timestamp).getTime()
                const sellTime = new Date(timestamp).getTime()
                const duration = sellTime - buyTime
                const totalSeconds = Math.floor(duration / 1000)
                const days = Math.floor(totalSeconds / 86400)
                const hours = Math.floor((totalSeconds % 86400) / 3600)
                const minutes = Math.floor((totalSeconds % 3600) / 60)
                const seconds = totalSeconds % 60
                holdingDuration = days > 0 
                  ? `${days} day${days > 1 ? 's' : ''} ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
                  : `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
              }
              
              // Add P&L to order data
              orderData.profit_loss = pl
              orderData.profit_loss_percent = plPercent
              orderData.holding_duration = holdingDuration
              
              // Mark the buy order as closed
              await supabase
                .from('trade_logs')
                .update({ 
                  status: 'closed',
                  sell_timestamp: timestamp,
                  sell_price: filledPrice,
                  profit_loss: pl,
                  profit_loss_percent: plPercent,
                  holding_duration: holdingDuration
                })
                .eq('trade_pair_id', tradePairId)
                .eq('action', 'buy')
                .eq('user_id', userId)
            }
          }

          const { error: insertError } = await supabase
            .from('trade_logs')
            .insert({
              ...orderData,
              trade_pair_id: tradePairId
            })

          if (insertError) {
            console.error(`[SYNC] Error inserting order ${orderId}:`, insertError)
      } else {
            console.log(`[SYNC] Inserted new order ${orderId} for ${symbol} ${side}`)
          }
        }
      } catch (error: any) {
        console.error(`[SYNC] Error syncing order ${order.id}:`, error?.message || error)
      }
    }

    // Fetch completed trades from Supabase only (no Alpaca calls)
    if (view === 'completed' || view === 'all' || !view) {
      console.log('[TRADE-LOGS] Fetching completed trades from Supabase')
      
      const accountTypes: ('paper' | 'live')[] = ['paper', 'live']
      
      for (const accountType of accountTypes) {
        try {
          // First check for any closed trades
          const { data: closedCheck } = await supabase
            .from('trade_logs')
            .select('id, symbol, action, status, sell_price, sell_timestamp')
            .eq('user_id', userId)
            .eq('account_type', accountType)
            .eq('status', 'closed')
            .limit(10)
          
          console.log(`[TRADE-LOGS] Closed trades check for ${accountType}: ${closedCheck?.length || 0}`)
          if (closedCheck && closedCheck.length > 0) {
            console.log(`[TRADE-LOGS] Sample closed trades:`, closedCheck.map(t => ({ 
              symbol: t.symbol, 
              action: t.action, 
              status: t.status,
              has_sell_price: !!t.sell_price,
              has_sell_timestamp: !!t.sell_timestamp
            })))
          }
          
          // Fetch completed trades from Supabase
          // First try buy records that have been closed (via RPC function)
          const { data: buyTradesClosed, error: buyError1 } = await supabase
            .from('trade_logs')
            .select('*')
            .eq('user_id', userId)
            .eq('account_type', accountType)
            .eq('action', 'buy')
            .eq('status', 'closed')
            .not('sell_price', 'is', null)
            .not('sell_timestamp', 'is', null)
          
          // Also check for sell records that might need to be matched
        const { data: sellTrades, error: sellError } = await supabase
            .from('trade_logs')
          .select('*')
          .eq('user_id', userId)
            .eq('account_type', accountType)
          .eq('action', 'sell')
            .order('timestamp', { ascending: false })
          
          console.log(`[TRADE-LOGS] Closed buy records: ${buyTradesClosed?.length || 0}, Sell records: ${sellTrades?.length || 0}`)
          
          // Combine both approaches - use closed buy records, and match sell records with open buy records
          let buyTrades: any[] = buyTradesClosed || []
          
          // If we have sell records, try to match them with buy records
          if (sellTrades && sellTrades.length > 0) {
            for (const sellTrade of sellTrades) {
              // Find matching buy record for this sell
              const { data: matchingBuy } = await supabase
                .from('trade_logs')
          .select('*')
          .eq('user_id', userId)
                .eq('account_type', accountType)
                .eq('symbol', sellTrade.symbol)
                .eq('action', 'buy')
                .eq('trade_pair_id', sellTrade.trade_pair_id)
                .order('timestamp', { ascending: true })
                .limit(1)
                .single()
              
              if (matchingBuy && !buyTrades.find(t => t.id === matchingBuy.id)) {
                // Create a completed trade from the matched buy/sell pair
                const completedTrade = {
                  ...matchingBuy,
                  status: 'closed',
                  sell_price: parseFloat(sellTrade.price || '0'),
                  sell_timestamp: sellTrade.timestamp,
                  sell_decision_metrics: sellTrade.sell_decision_metrics,
                  profit_loss: (parseFloat(sellTrade.price || '0') - parseFloat(matchingBuy.buy_price || '0')) * parseFloat(matchingBuy.qty || '0'),
                  profit_loss_percent: parseFloat(matchingBuy.buy_price || '0') > 0 
                    ? ((parseFloat(sellTrade.price || '0') - parseFloat(matchingBuy.buy_price || '0')) / parseFloat(matchingBuy.buy_price || '0')) * 100 
                    : 0
                }
                buyTrades.push(completedTrade)
              }
            }
          }
          
          // Sort by sell timestamp
          buyTrades.sort((a, b) => {
            const timeA = new Date(a.sell_timestamp || a.timestamp).getTime()
            const timeB = new Date(b.sell_timestamp || b.timestamp).getTime()
            return timeB - timeA
          })
          
          const buyError = buyError1 || sellError
          
          if (buyError) {
            console.error(`[TRADE-LOGS] Error fetching completed trades from Supabase for ${accountType}:`, buyError)
            continue
          }
          
          console.log(`[TRADE-LOGS] Found ${buyTrades?.length || 0} completed trades in Supabase for ${accountType} account`)
          
          if (buyTrades && buyTrades.length > 0) {
            // Helper function to group completed trades by similar buy/sell price and timestamp
            function groupSimilarCompletedTrades(trades: any[]): any[][] {
        if (trades.length === 0) return []
        
        // Sort by sell timestamp
        const sorted = [...trades].sort((a, b) => 
          new Date(a.sell_timestamp).getTime() - new Date(b.sell_timestamp).getTime()
        )
        
        const groups: any[][] = []
        
        for (const trade of sorted) {
          const buyPrice = parseFloat(trade.buy_price || '0')
          const sellPrice = parseFloat(trade.sell_price || '0')
          const buyTime = new Date(trade.buy_timestamp).getTime()
          const sellTime = new Date(trade.sell_timestamp).getTime()
          
          // Find a group where this trade fits (similar prices and within 10 minutes)
          let foundGroup = false
          for (const group of groups) {
            const groupBuyPrice = parseFloat(group[0].buy_price || '0')
            const groupSellPrice = parseFloat(group[0].sell_price || '0')
            const groupBuyTime = new Date(group[0].buy_timestamp).getTime()
            const groupSellTime = new Date(group[0].sell_timestamp).getTime()
            
            // Check if prices are within 0.5% and times are within 10 minutes
            const buyPriceDiff = Math.abs(buyPrice - groupBuyPrice) / groupBuyPrice
            const sellPriceDiff = Math.abs(sellPrice - groupSellPrice) / groupSellPrice
            const buyTimeDiff = Math.abs(buyTime - groupBuyTime) / (1000 * 60) // minutes
            const sellTimeDiff = Math.abs(sellTime - groupSellTime) / (1000 * 60) // minutes
            
            if (buyPriceDiff <= 0.005 && sellPriceDiff <= 0.005 && buyTimeDiff <= 10 && sellTimeDiff <= 10) {
              group.push(trade)
              foundGroup = true
              break
            }
          }
          
          if (!foundGroup) {
            groups.push([trade])
          }
        }
        
              return groups
            }
            
            // Group by symbol first
            const completedBySymbol = new Map<string, any[]>()
            for (const trade of buyTrades) {
              const symbol = trade.symbol.toUpperCase()
              if (!completedBySymbol.has(symbol)) {
                completedBySymbol.set(symbol, [])
              }
              completedBySymbol.get(symbol)!.push(trade)
            }
            
            // Aggregate each symbol's completed trades (grouped by similar price/time)
            for (const [symbol, allTradesForSymbol] of completedBySymbol) {
              // Group similar trades together
              const tradeGroups = groupSimilarCompletedTrades(allTradesForSymbol)
              
              // Process each group as a single trade entry
              for (const trades of tradeGroups) {
                // Sort by most recent sell
                trades.sort((a, b) => 
                  new Date(b.sell_timestamp).getTime() - new Date(a.sell_timestamp).getTime()
                )
                
                // Aggregate quantities and P&L
                const totalQty = trades.reduce((sum, t) => sum + parseFloat(t.qty || '0'), 0)
                const totalPl = trades.reduce((sum, t) => sum + parseFloat(t.profit_loss || '0'), 0)
                const totalPlPercent = trades.reduce((sum, t) => {
                  const pl = parseFloat(t.profit_loss_percent || '0')
                  return sum + pl
                }, 0) / trades.length
                
                // Use most recent trade for timestamps and metrics
                const mostRecent = trades[0]
                
                // Store transaction IDs for this grouped trade
                const transactionIds = trades.map(t => t.id.toString())
                
                completedTrades.push({
                  id: BigInt(mostRecent.id),
                  symbol,
                  qty: totalQty,
                  buy_price: trades.reduce((sum, t) => {
                    const qty = parseFloat(t.qty || '0')
                    const price = parseFloat(t.buy_price || '0')
                    return sum + (price * qty)
                  }, 0) / totalQty, // Weighted avg
                  buy_timestamp: trades.sort((a, b) => 
                    new Date(a.buy_timestamp || a.timestamp).getTime() - new Date(b.buy_timestamp || b.timestamp).getTime()
                  )[0].buy_timestamp || trades[0].timestamp, // Oldest buy
                  sell_price: parseFloat(mostRecent.sell_price || '0'),
                  sell_timestamp: mostRecent.sell_timestamp,
                  profit_loss: totalPl,
                  profit_loss_percent: totalPlPercent,
                  holding_duration: mostRecent.holding_duration || '0:0:0',
                  buy_decision_metrics: mostRecent.buy_decision_metrics || { confidence: 0, reasoning: 'Trade from Supabase' },
                  sell_decision_metrics: mostRecent.sell_decision_metrics || { confidence: 0, reasoning: 'Trade from Supabase' },
                  strategy: mostRecent.strategy || 'cash',
                  account_type: accountType,
                  trade_pair_id: mostRecent.trade_pair_id,
                  transaction_ids: transactionIds,
                  transaction_count: trades.length
                } as any)
              }
            }
          }
        } catch (error: any) {
          console.error(`[TRADE-LOGS] Error fetching completed trades for ${accountType}:`, error?.message || error)
        }
      }
      
      // Sort by most recent sell and limit to 10 for initial display
      completedTrades.sort((a, b) => 
        new Date(b.sell_timestamp).getTime() - new Date(a.sell_timestamp).getTime()
      )
      
      console.log(`[TRADE-LOGS] Total completed trades (aggregated): ${completedTrades.length}`)
    }

    // Handle request for individual transactions for a symbol
    const symbolParam = searchParams.get('symbol')
    if (symbolParam && view === 'transactions') {
      console.log(`[TRADE-LOGS] Fetching all transactions for symbol: ${symbolParam} from Alpaca`)
      
      const accountTypes: ('paper' | 'live')[] = ['paper', 'live']
      const allTransactions: any[] = []
      
      // Fetch all orders for this symbol from Alpaca
      for (const accountType of accountTypes) {
        try {
          const alpacaKeys = await getAlpacaKeysForUser(userId, isDemo, accountType)
          
          if (!alpacaKeys.apiKey || !alpacaKeys.secretKey) {
            continue
          }

          const alpacaClient = createAlpacaClient({
            apiKey: alpacaKeys.apiKey,
            secretKey: alpacaKeys.secretKey,
            baseUrl: alpacaKeys.paper ? 'https://paper-api.alpaca.markets' : 'https://api.alpaca.markets',
            paper: alpacaKeys.paper
          })

          await alpacaClient.initialize()
          
          // Get all orders for this symbol
          const orders = await alpacaClient.getOrderHistory(500)
          const symbolOrders = orders
            .filter(order => order.symbol.toUpperCase() === symbolParam.toUpperCase())
            .filter(order => order.status === 'filled' || order.status === 'partially_filled')
            .map(order => ({
              id: order.id,
              symbol: order.symbol,
              side: order.side,
              qty: parseFloat(order.filled_qty),
              price: parseFloat(order.filled_avg_price || '0'),
              timestamp: order.filled_at || order.created_at,
              account_type: accountType,
              alpaca_order_id: order.id,
              order_status: order.status
            }))
          
          allTransactions.push(...symbolOrders)
        } catch (error: any) {
          console.error(`[TRADE-LOGS] Error fetching transactions for ${accountType}:`, error?.message || error)
        }
      }
      
      // Sort by timestamp descending
      allTransactions.sort((a, b) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      )

      return NextResponse.json({
        success: true,
        data: {
          symbol: symbolParam.toUpperCase(),
          transactions: allTransactions,
          count: allTransactions.length
        }
      })
    }
    
    // Calculate statistics from Alpaca data
    if (view === 'statistics' || view === 'all' || !view) {
      const closedTrades = completedTrades
      const openTrades = currentTrades
      
      const winningTrades = closedTrades.filter(t => t.profit_loss > 0)
      const losingTrades = closedTrades.filter(t => t.profit_loss < 0)
      const totalPl = closedTrades.reduce((sum, t) => sum + (t.profit_loss || 0), 0)
      const avgPl = closedTrades.length > 0 ? totalPl / closedTrades.length : 0
      const winRate = closedTrades.length > 0 ? (winningTrades.length / closedTrades.length) * 100 : 0
      
      // Calculate average holding duration (simplified - just use first trade's duration format)
      const avgHoldingDuration = closedTrades.length > 0 ? closedTrades[0].holding_duration : '0:0:0'
      
      const bestTrade = closedTrades.length > 0 ? Math.max(...closedTrades.map(t => t.profit_loss)) : 0
      const worstTrade = closedTrades.length > 0 ? Math.min(...closedTrades.map(t => t.profit_loss)) : 0
      
      statistics = {
        total_trades: closedTrades.length + openTrades.length,
        open_trades: openTrades.length,
        closed_trades: closedTrades.length,
        winning_trades: winningTrades.length,
        losing_trades: losingTrades.length,
        total_profit_loss: totalPl,
        avg_profit_loss: avgPl,
        win_rate: winRate,
        avg_holding_duration: avgHoldingDuration,
        best_trade: bestTrade,
        worst_trade: worstTrade
      }
      }

    // Convert BigInt values to strings for JSON serialization
    const serializeBigInt = (obj: any): any => {
      if (obj === null || obj === undefined) return obj
      if (typeof obj === 'bigint') return obj.toString()
      if (Array.isArray(obj)) return obj.map(serializeBigInt)
      if (typeof obj === 'object') {
        const result: any = {}
        for (const [key, value] of Object.entries(obj)) {
          result[key] = serializeBigInt(value)
        }
        return result
      }
      return obj
    }

    return NextResponse.json({
      success: true,
      data: {
        currentTrades: serializeBigInt(currentTrades),
        completedTrades: serializeBigInt(completedTrades),
        statistics
      }
    })

  } catch (error) {
    console.error('Error in GET /api/trade-logs:', error)
    return NextResponse.json({ 
      success: false, 
      error: 'Internal server error' 
    }, { status: 500 })
  }
}


