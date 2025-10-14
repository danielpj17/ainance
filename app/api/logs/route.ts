export const runtime = 'nodejs'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, getDemoUserIdServer } from '@/utils/supabase/server'
import { createAlpacaClient, getAlpacaKeys } from '@/lib/alpaca-client'
import { isDemoMode } from '@/lib/demo-user'

export interface TradeLog {
  id: bigint
  symbol: string
  action: string
  qty: number
  price: number
  total_value: number
  trade_timestamp: string
  strategy: string
  account_type: string
  realized_pl: number
  unrealized_pl: number
  is_closed: boolean
  position_size: number
  cost_basis: number
  created_at: string
}

export interface TradeMetrics {
  total_spent: number
  total_received: number
  realized_pl: number
  unrealized_pl: number
  open_positions: number
  closed_positions: number
}

export interface OpenPosition {
  symbol: string
  total_qty: number
  avg_cost: number
  total_cost: number
  first_trade_date: string
  trade_count: number
  current_price?: number
  current_value?: number
  unrealized_pl?: number
  pl_percent?: number
}

export interface ClosedPosition {
  id: bigint
  symbol: string
  entry_date: string
  exit_date: string
  qty: number
  entry_price: number
  exit_price: number
  cost: number
  proceeds: number
  realized_pl: number
  pl_percent: number
}

// GET - Fetch trade logs with P&L calculations
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
    const limit = parseInt(searchParams.get('limit') || '100')
    const offset = parseInt(searchParams.get('offset') || '0')
    const symbol = searchParams.get('symbol')
    const view = searchParams.get('view') // 'all', 'open', 'closed'

    // Fetch trade metrics
    const { data: metricsData, error: metricsError } = await supabase.rpc('calculate_trade_metrics', {
      user_uuid: userId
    })

    if (metricsError) {
      console.error('Error fetching trade metrics:', metricsError)
      return NextResponse.json({ 
        success: false, 
        error: 'Failed to fetch trade metrics' 
      }, { status: 500 })
    }

    const metrics: TradeMetrics = metricsData?.[0] || {
      total_spent: 0,
      total_received: 0,
      realized_pl: 0,
      unrealized_pl: 0,
      open_positions: 0,
      closed_positions: 0
    }

    // Fetch data based on view type
    let trades: TradeLog[] = []
    let openPositions: OpenPosition[] = []
    let closedPositions: ClosedPosition[] = []

    if (view === 'open' || view === 'all' || !view) {
      // Fetch open positions
      const { data: openPosData, error: openPosError } = await supabase.rpc('get_open_positions', {
        user_uuid: userId
      })

      if (!openPosError && openPosData) {
        openPositions = openPosData

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
              for (const position of openPositions) {
                try {
                  const quote = await alpacaClient.getLatestQuote(position.symbol)
                  // Our alpaca client returns { bid, ask, bidSize, askSize }
                  // Use ask as the current executable price for buys
                  if (quote && typeof quote.ask === 'number') {
                    position.current_price = quote.ask
                    position.current_value = position.current_price * position.total_qty
                    position.unrealized_pl = position.current_value - position.total_cost
                    position.pl_percent = (position.unrealized_pl / position.total_cost) * 100
                  }
                } catch (error) {
                  console.error(`Error fetching price for ${position.symbol}:`, error)
                  // Use avg_cost as fallback
                  position.current_price = position.avg_cost
                  position.current_value = position.avg_cost * position.total_qty
                  position.unrealized_pl = 0
                  position.pl_percent = 0
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

    if (view === 'closed' || view === 'all' || !view) {
      // Fetch closed positions
      const { data: closedPosData, error: closedPosError } = await supabase.rpc('get_closed_positions', {
        user_uuid: userId
      })

      if (!closedPosError && closedPosData) {
        closedPositions = closedPosData
      }
    }

    if (!view || view === 'all') {
      // Fetch all trades
      const { data: tradesData, error: tradesError } = await supabase.rpc('get_user_trades', {
        user_uuid: userId,
        limit_count: limit,
        offset_count: offset,
        symbol_filter: symbol
      })

      if (tradesError) {
        console.error('Error fetching trades:', tradesError)
        return NextResponse.json({ 
          success: false, 
          error: 'Failed to fetch trades' 
        }, { status: 500 })
      }

      trades = tradesData || []
    }

    return NextResponse.json({
      success: true,
      data: {
        metrics,
        trades,
        openPositions,
        closedPositions
      }
    })

  } catch (error) {
    console.error('Error in GET /api/logs:', error)
    return NextResponse.json({ 
      success: false, 
      error: 'Internal server error' 
    }, { status: 500 })
  }
}

