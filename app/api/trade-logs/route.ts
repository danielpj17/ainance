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

    // Fetch current positions directly from Alpaca
    if (view === 'current' || view === 'all' || !view) {
      console.log('[TRADE-LOGS] Fetching current positions from Alpaca')
      
      // Fetch for both paper and live accounts
      const accountTypes: ('paper' | 'live')[] = ['paper', 'live']
      
      for (const accountType of accountTypes) {
        try {
          const alpacaKeys = await getAlpacaKeysForUser(userId, isDemo, accountType)
          
          if (!alpacaKeys.apiKey || !alpacaKeys.secretKey) {
            console.log(`[TRADE-LOGS] No API keys for ${accountType} account, skipping`)
            continue
          }

          const alpacaClient = createAlpacaClient({
            apiKey: alpacaKeys.apiKey,
            secretKey: alpacaKeys.secretKey,
            baseUrl: alpacaKeys.paper ? 'https://paper-api.alpaca.markets' : 'https://api.alpaca.markets',
            paper: alpacaKeys.paper
          })

          await alpacaClient.initialize()
          
          // Sync all orders to Supabase first (including buy orders for current positions)
          const allOrders = await alpacaClient.getOrderHistory(limit)
          console.log(`[SYNC] Syncing ${allOrders.length} orders from ${accountType} account to Supabase...`)
          for (const order of allOrders) {
            if (order.status === 'filled' || order.status === 'partially_filled') {
              await syncOrderToSupabase(order, accountType, supabase, userId)
              // Small delay to avoid rate limiting
              await new Promise(resolve => setTimeout(resolve, 50))
            }
          }
          
          // Get current positions from Alpaca
          const positions = await alpacaClient.getPositions()
          console.log(`[TRADE-LOGS] Found ${positions.length} positions in ${accountType} account`)
          
          // Try to get decision metrics from Supabase for these positions
          const symbols = positions.map(p => p.symbol.toUpperCase())
          const { data: metricsData } = await supabase
            .from('trade_logs')
            .select('symbol, buy_decision_metrics, strategy, trade_pair_id')
            .eq('user_id', userId)
            .eq('account_type', accountType)
            .in('symbol', symbols)
            .eq('action', 'buy')
            .eq('status', 'open')
            .order('timestamp', { ascending: false })
          
          // Create a map of metrics by symbol
          const metricsMap = new Map<string, any>()
          if (metricsData) {
            for (const metric of metricsData) {
              if (!metricsMap.has(metric.symbol)) {
                metricsMap.set(metric.symbol, {
                  buy_decision_metrics: metric.buy_decision_metrics,
                  strategy: metric.strategy,
                  trade_pair_id: metric.trade_pair_id
                })
              }
            }
          }
          
          // Convert Alpaca positions to CurrentTrade format
          for (const position of positions) {
            const symbol = position.symbol.toUpperCase()
            const qty = Math.abs(parseFloat(position.qty))
            const costBasis = parseFloat(position.cost_basis)
            const avgEntryPrice = qty > 0 ? costBasis / qty : 0
            const currentPrice = parseFloat(position.current_price)
            const marketValue = parseFloat(position.market_value)
            const unrealizedPl = parseFloat(position.unrealized_pl)
            const unrealizedPlPercent = parseFloat(position.unrealized_plpc) * 100
            
            // Get metrics from Supabase if available
            const metrics = metricsMap.get(symbol)
            
            // Calculate holding duration (we'll use a placeholder since Alpaca doesn't provide entry time)
            const holdingDuration = '0:0:0' // Will be calculated from order history if needed
            
            currentTrades.push({
              id: BigInt(0), // Placeholder - not from database
              symbol,
              qty,
              buy_price: avgEntryPrice,
              buy_timestamp: new Date().toISOString(), // Will be updated from order history
              current_price: currentPrice,
              current_value: marketValue,
              unrealized_pl: unrealizedPl,
              unrealized_pl_percent: unrealizedPlPercent,
              holding_duration: holdingDuration,
              buy_decision_metrics: metrics?.buy_decision_metrics || {
                confidence: 0,
                reasoning: 'Position from Alpaca'
              },
              strategy: metrics?.strategy || 'cash',
              account_type: accountType,
              trade_pair_id: metrics?.trade_pair_id || crypto.randomUUID()
            })
          }
        } catch (error: any) {
          console.error(`[TRADE-LOGS] Error fetching positions for ${accountType}:`, error?.message || error)
        }
      }
      
      console.log(`[TRADE-LOGS] Total current trades from Alpaca: ${currentTrades.length}`)
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

    // Fetch completed trades from Alpaca order history
    if (view === 'completed' || view === 'all' || !view) {
      console.log('[TRADE-LOGS] Fetching completed trades from Alpaca order history')
      
      const accountTypes: ('paper' | 'live')[] = ['paper', 'live']
      const allOrders: any[] = []
      
      // Fetch all filled orders from Alpaca for both account types
      for (const accountType of accountTypes) {
        try {
          const alpacaKeys = await getAlpacaKeysForUser(userId, isDemo, accountType)
          
          if (!alpacaKeys.apiKey || !alpacaKeys.secretKey) {
            console.log(`[TRADE-LOGS] No API keys for ${accountType} account, skipping`)
            continue
          }

          const alpacaClient = createAlpacaClient({
            apiKey: alpacaKeys.apiKey,
            secretKey: alpacaKeys.secretKey,
            baseUrl: alpacaKeys.paper ? 'https://paper-api.alpaca.markets' : 'https://api.alpaca.markets',
            paper: alpacaKeys.paper
          })

          await alpacaClient.initialize()
          
          // Get all filled orders from Alpaca (increased limit to get more history)
          const orders = await alpacaClient.getOrderHistory(limit)
          console.log(`[TRADE-LOGS] Found ${orders.length} orders in ${accountType} account`)
          
          // Sync all orders to Supabase (store exact Alpaca data)
          console.log(`[SYNC] Syncing ${orders.length} orders from ${accountType} account to Supabase...`)
          for (const order of orders) {
            if (order.status === 'filled' || order.status === 'partially_filled') {
              await syncOrderToSupabase(order, accountType, supabase, userId)
              // Small delay to avoid rate limiting
              await new Promise(resolve => setTimeout(resolve, 50))
            }
          }
          
          // Filter for filled orders only and add account type
          const filledOrders = orders
            .filter(order => order.status === 'filled' || order.status === 'partially_filled')
            .filter(order => order.filled_qty && parseFloat(order.filled_qty) > 0)
            .map(order => ({
              ...order,
              account_type: accountType
            }))
          
          allOrders.push(...filledOrders)
        } catch (error: any) {
          console.error(`[TRADE-LOGS] Error fetching orders for ${accountType}:`, error?.message || error)
        }
      }
      
      console.log(`[TRADE-LOGS] Total filled orders from Alpaca: ${allOrders.length}`)
      
      // Group orders by symbol
      const ordersBySymbol = new Map<string, any[]>()
      for (const order of allOrders) {
        const symbol = order.symbol.toUpperCase()
        if (!ordersBySymbol.has(symbol)) {
          ordersBySymbol.set(symbol, [])
        }
        ordersBySymbol.get(symbol)!.push(order)
      }
      
      // Try to get decision metrics from Supabase
      const allSymbols = Array.from(ordersBySymbol.keys())
      const { data: metricsData } = await supabase
        .from('trade_logs')
        .select('symbol, alpaca_order_id, buy_decision_metrics, sell_decision_metrics, strategy, trade_pair_id, account_type')
        .eq('user_id', userId)
        .in('symbol', allSymbols)
        .not('alpaca_order_id', 'is', null)
      
      // Create maps for metrics lookup
      const buyMetricsMap = new Map<string, any>()
      const sellMetricsMap = new Map<string, any>()
      const strategyMap = new Map<string, string>()
      const tradePairMap = new Map<string, string>()
      
      if (metricsData) {
        for (const metric of metricsData) {
          const key = `${metric.symbol}_${metric.alpaca_order_id}`
          if (metric.buy_decision_metrics) {
            buyMetricsMap.set(key, metric.buy_decision_metrics)
            strategyMap.set(key, metric.strategy)
            tradePairMap.set(key, metric.trade_pair_id)
          }
          if (metric.sell_decision_metrics) {
            sellMetricsMap.set(key, metric.sell_decision_metrics)
          }
        }
      }
      
      // Process each symbol's orders to match buy/sell pairs using FIFO
      for (const [symbol, orders] of ordersBySymbol) {
        // Sort orders by filled_at timestamp
        orders.sort((a, b) => {
          const timeA = a.filled_at ? new Date(a.filled_at).getTime() : new Date(a.created_at).getTime()
          const timeB = b.filled_at ? new Date(b.filled_at).getTime() : new Date(b.created_at).getTime()
          return timeA - timeB
        })
        
        // Separate buy and sell orders
        const buyOrders = orders.filter(o => o.side === 'buy')
        const sellOrders = orders.filter(o => o.side === 'sell')
        
        console.log(`[TRADE-LOGS] Processing ${symbol}: ${buyOrders.length} buys, ${sellOrders.length} sells`)
        
        // Match buy and sell orders using FIFO
        let buyIndex = 0
        let sellIndex = 0
        
        while (buyIndex < buyOrders.length && sellIndex < sellOrders.length) {
          const buyOrder = buyOrders[buyIndex]
          const sellOrder = sellOrders[sellIndex]
          
          const buyQty = parseFloat(buyOrder.filled_qty)
          const sellQty = parseFloat(sellOrder.filled_qty)
          const buyPrice = parseFloat(buyOrder.filled_avg_price || '0')
          const sellPrice = parseFloat(sellOrder.filled_avg_price || '0')
          
          if (buyQty <= 0 || sellQty <= 0 || buyPrice <= 0 || sellPrice <= 0) {
            // Skip invalid orders
            if (buyQty <= 0 || buyPrice <= 0) buyIndex++
            if (sellQty <= 0 || sellPrice <= 0) sellIndex++
            continue
          }
          
          // Use the smaller quantity for the trade pair
          const tradeQty = Math.min(buyQty, sellQty)
          
          // Calculate P&L
          const pl = (sellPrice - buyPrice) * tradeQty
          const plPercent = buyPrice > 0 ? ((sellPrice - buyPrice) / buyPrice) * 100 : 0
          
          // Calculate holding duration
          const buyTime = buyOrder.filled_at ? new Date(buyOrder.filled_at).getTime() : new Date(buyOrder.created_at).getTime()
          const sellTime = sellOrder.filled_at ? new Date(sellOrder.filled_at).getTime() : new Date(sellOrder.created_at).getTime()
          const duration = sellTime - buyTime
          const totalSeconds = Math.floor(duration / 1000)
          const days = Math.floor(totalSeconds / 86400)
          const hours = Math.floor((totalSeconds % 86400) / 3600)
          const minutes = Math.floor((totalSeconds % 3600) / 60)
          const seconds = totalSeconds % 60
          const durationStr = days > 0 
            ? `${days} day${days > 1 ? 's' : ''} ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
            : `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
          
          // Get metrics from Supabase if available
          const buyKey = `${symbol}_${buyOrder.id}`
          const sellKey = `${symbol}_${sellOrder.id}`
          const buyMetrics = buyMetricsMap.get(buyKey) || { confidence: 0, reasoning: 'Trade from Alpaca' }
          const sellMetrics = sellMetricsMap.get(sellKey) || { confidence: 0, reasoning: 'Trade from Alpaca' }
          const strategy = strategyMap.get(buyKey) || strategyMap.get(sellKey) || 'cash'
          const tradePairId = tradePairMap.get(buyKey) || tradePairMap.get(sellKey) || crypto.randomUUID()
          
          completedTrades.push({
            id: BigInt(0), // Placeholder - not from database
            symbol,
            qty: tradeQty,
            buy_price: buyPrice,
            buy_timestamp: buyOrder.filled_at || buyOrder.created_at,
            sell_price: sellPrice,
            sell_timestamp: sellOrder.filled_at || sellOrder.created_at,
            profit_loss: pl,
            profit_loss_percent: plPercent,
            holding_duration: durationStr,
            buy_decision_metrics: buyMetrics,
            sell_decision_metrics: sellMetrics,
            strategy,
            account_type: buyOrder.account_type || 'paper',
            trade_pair_id: tradePairId
          })
          
          // Update remaining quantities
          buyOrder.filled_qty = (buyQty - tradeQty).toString()
          sellOrder.filled_qty = (sellQty - tradeQty).toString()
          
          // Move to next order if current one is fully matched
          if (parseFloat(buyOrder.filled_qty) <= 0) buyIndex++
          if (parseFloat(sellOrder.filled_qty) <= 0) sellIndex++
        }
      }
      
      // Sort completed trades by sell timestamp (most recent first)
      completedTrades.sort((a, b) => 
        new Date(b.sell_timestamp).getTime() - new Date(a.sell_timestamp).getTime()
      )
      
      // Apply limit and offset
      completedTrades = completedTrades.slice(offset, offset + limit)
      
      console.log(`[TRADE-LOGS] Total completed trades from Alpaca: ${completedTrades.length}`)
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

    return NextResponse.json({
      success: true,
      data: {
        currentTrades,
        completedTrades,
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


