export const runtime = 'nodejs'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, getDemoUserIdServer } from '@/utils/supabase/server'
import { createAlpacaClient, getAlpacaKeys } from '@/lib/alpaca-client'
import { isDemoMode } from '@/lib/demo-user'

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

// GET - Fetch trade logs
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createServerClient(req, {})
    
    // In demo mode, always use demo user ID
    let userId: string
    if (isDemoMode()) {
      userId = getDemoUserIdServer()
    } else {
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
      }
      userId = user.id
    }

    const { searchParams } = new URL(req.url)
    const view = searchParams.get('view') // 'current', 'completed', 'all', 'statistics'
    const limit = parseInt(searchParams.get('limit') || '100')
    const offset = parseInt(searchParams.get('offset') || '0')

    let currentTrades: CurrentTrade[] = []
    let completedTrades: CompletedTrade[] = []
    let statistics: TradeStatistics | null = null

    // Fetch trade statistics
    if (view === 'statistics' || view === 'all' || !view) {
      const { data: statsData, error: statsError } = await supabase.rpc('get_trade_statistics', {
        user_uuid: userId
      })

      if (!statsError && statsData && statsData.length > 0) {
        statistics = statsData[0]
      } else {
        statistics = {
          total_trades: 0,
          open_trades: 0,
          closed_trades: 0,
          winning_trades: 0,
          losing_trades: 0,
          total_profit_loss: 0,
          avg_profit_loss: 0,
          win_rate: 0,
          avg_holding_duration: '0',
          best_trade: 0,
          worst_trade: 0
        }
      }
    }

    // Fetch current/open trades from multiple sources
    if (view === 'current' || view === 'all' || !view) {
      // Get from trade_logs table
      const { data: currentData, error: currentError } = await supabase.rpc('get_current_trades', {
        user_uuid: userId
      })

      if (!currentError && currentData) {
        currentTrades = currentData
      }

      // Also get current positions directly from Alpaca
      try {
        const { data: apiKeys } = await supabase.rpc('get_user_api_keys', {
          user_uuid: userId
        })

        if (apiKeys?.[0]) {
          const keys = apiKeys[0]
          const alpacaKeys = getAlpacaKeys(keys, 'paper', 'cash')
          
          if (alpacaKeys.apiKey && alpacaKeys.secretKey) {
            const alpacaClient = createAlpacaClient({
              apiKey: alpacaKeys.apiKey,
              secretKey: alpacaKeys.secretKey,
              baseUrl: 'https://paper-api.alpaca.markets',
              paper: true
            })

            await alpacaClient.initialize()

            // Get all open positions from Alpaca
            const positions = await alpacaClient.getPositions()
            
            // Merge Alpaca positions with trade_logs data
            const positionMap = new Map(currentTrades.map(t => [t.symbol, t]))
            
            for (const position of positions) {
              const existingTrade = positionMap.get(position.symbol)
              
              if (existingTrade) {
                // Update with live data from Alpaca
                existingTrade.current_price = parseFloat(position.current_price)
                existingTrade.current_value = parseFloat(position.market_value)
                existingTrade.unrealized_pl = parseFloat(position.unrealized_pl)
                existingTrade.unrealized_pl_percent = parseFloat(position.unrealized_plpc) * 100
              } else {
                // Add position from Alpaca that's not in trade_logs
                currentTrades.push({
                  id: BigInt(0), // Placeholder
                  symbol: position.symbol,
                  qty: Math.abs(parseFloat(position.qty)),
                  buy_price: parseFloat(position.avg_entry_price),
                  buy_timestamp: position.created_at || new Date().toISOString(),
                  current_price: parseFloat(position.current_price),
                  current_value: parseFloat(position.market_value),
                  unrealized_pl: parseFloat(position.unrealized_pl),
                  unrealized_pl_percent: parseFloat(position.unrealized_plpc) * 100,
                  holding_duration: '0:0:0', // Will be calculated on frontend
                  buy_decision_metrics: {
                    confidence: 0,
                    reasoning: 'Trade from Alpaca (not logged in system)'
                  },
                  strategy: 'unknown',
                  account_type: 'paper',
                  trade_pair_id: crypto.randomUUID()
                })
              }
            }
          }
        }
      } catch (error) {
        console.error('Error fetching Alpaca positions:', error)
        // Continue with data from database only
      }
    }

    // Fetch completed trades from multiple sources
    if (view === 'completed' || view === 'all' || !view) {
      // Get from trade_logs table
      const { data: completedData, error: completedError } = await supabase.rpc('get_completed_trades', {
        user_uuid: userId,
        limit_count: limit,
        offset_count: offset
      })

      if (!completedError && completedData) {
        completedTrades = completedData
      }

      // Also check legacy trades table for closed positions
      try {
        const { data: legacyTrades, error: legacyError } = await supabase
          .from('trades')
          .select('*')
          .eq('user_id', userId)
          .order('trade_timestamp', { ascending: false })
          .limit(50)

        if (!legacyError && legacyTrades) {
          // Group trades by symbol to find buy/sell pairs
          const tradesBySymbol = new Map<string, any[]>()
          
          for (const trade of legacyTrades) {
            if (!tradesBySymbol.has(trade.symbol)) {
              tradesBySymbol.set(trade.symbol, [])
            }
            tradesBySymbol.get(trade.symbol)!.push(trade)
          }

          // Find completed buy/sell pairs
          for (const [symbol, trades] of tradesBySymbol) {
            const buys = trades.filter(t => t.action === 'buy').sort((a, b) => 
              new Date(a.trade_timestamp).getTime() - new Date(b.trade_timestamp).getTime()
            )
            const sells = trades.filter(t => t.action === 'sell').sort((a, b) => 
              new Date(a.trade_timestamp).getTime() - new Date(b.trade_timestamp).getTime()
            )

            const pairsCount = Math.min(buys.length, sells.length)
            
            for (let i = 0; i < pairsCount; i++) {
              const buy = buys[i]
              const sell = sells[i]
              
              const pl = (sell.price - buy.price) * buy.qty
              const plPercent = ((sell.price - buy.price) / buy.price) * 100
              const duration = new Date(sell.trade_timestamp).getTime() - new Date(buy.trade_timestamp).getTime()
              const durationStr = `${Math.floor(duration / 3600000)}:${Math.floor((duration % 3600000) / 60000)}:${Math.floor((duration % 60000) / 1000)}`

              // Check if this pair is already in completedTrades
              const exists = completedTrades.some(ct => 
                ct.symbol === symbol && 
                Math.abs(new Date(ct.buy_timestamp).getTime() - new Date(buy.trade_timestamp).getTime()) < 1000
              )

              if (!exists) {
                completedTrades.push({
                  id: buy.id,
                  symbol,
                  qty: buy.qty,
                  buy_price: buy.price,
                  buy_timestamp: buy.trade_timestamp,
                  sell_price: sell.price,
                  sell_timestamp: sell.trade_timestamp,
                  profit_loss: pl,
                  profit_loss_percent: plPercent,
                  holding_duration: durationStr,
                  buy_decision_metrics: {
                    confidence: buy.confidence || 0,
                    reasoning: buy.reasoning || 'Legacy trade from trades table'
                  },
                  sell_decision_metrics: {
                    confidence: sell.confidence || 0,
                    reasoning: sell.reasoning || 'Legacy trade from trades table'
                  },
                  strategy: buy.strategy,
                  account_type: buy.account_type,
                  trade_pair_id: crypto.randomUUID()
                })
              }
            }
          }
        }
      } catch (error) {
        console.error('Error fetching legacy trades:', error)
        // Continue with trade_logs data only
      }

      // Sort completed trades by sell timestamp (most recent first)
      completedTrades.sort((a, b) => 
        new Date(b.sell_timestamp).getTime() - new Date(a.sell_timestamp).getTime()
      )
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

// POST - Create or update trade log
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createServerClient(req, {})
    
    // In demo mode, always use demo user ID
    let userId: string
    if (isDemoMode()) {
      userId = getDemoUserIdServer()
    } else {
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
      }
      userId = user.id
    }

    const body = await req.json()
    const { action, symbol, qty, price, decision_metrics, strategy, account_type, alpaca_order_id, order_status, trade_pair_id } = body

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
        error: 'Invalid action. Must be "buy" or "sell"' 
      }, { status: 400 })
    }

  } catch (error) {
    console.error('Error in POST /api/trade-logs:', error)
    return NextResponse.json({ 
      success: false, 
      error: 'Internal server error' 
    }, { status: 500 })
  }
}

