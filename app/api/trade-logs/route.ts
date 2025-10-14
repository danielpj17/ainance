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

    // Fetch current/open trades
    if (view === 'current' || view === 'all' || !view) {
      const { data: currentData, error: currentError } = await supabase.rpc('get_current_trades', {
        user_uuid: userId
      })

      if (!currentError && currentData) {
        currentTrades = currentData

        // Get current market prices for open positions
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

              // Fetch current prices for each open position
              for (const trade of currentTrades) {
                try {
                  const quote = await alpacaClient.getLatestQuote(trade.symbol)
                  if (quote && typeof quote.ask === 'number') {
                    trade.current_price = quote.ask
                    trade.current_value = trade.current_price * trade.qty
                    trade.unrealized_pl = trade.current_value - (trade.buy_price * trade.qty)
                    trade.unrealized_pl_percent = (trade.unrealized_pl / (trade.buy_price * trade.qty)) * 100
                  }
                } catch (error) {
                  console.error(`Error fetching price for ${trade.symbol}:`, error)
                  // Keep the values from the database query
                }
              }
            }
          }
        } catch (error) {
          console.error('Error fetching current prices:', error)
          // Continue without current prices
        }
      }
    }

    // Fetch completed trades
    if (view === 'completed' || view === 'all' || !view) {
      const { data: completedData, error: completedError } = await supabase.rpc('get_completed_trades', {
        user_uuid: userId,
        limit_count: limit,
        offset_count: offset
      })

      if (!completedError && completedData) {
        completedTrades = completedData
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

