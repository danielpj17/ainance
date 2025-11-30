export const runtime = 'nodejs'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, getUserIdFromRequest, getAlpacaKeysForUser } from '@/utils/supabase/server'
import { createAlpacaClient } from '@/lib/alpaca-client'

export interface TradeRequest {
  symbol: string
  side: 'buy' | 'sell'
  qty: number
  type: 'market' | 'limit'
  time_in_force: 'day' | 'gtc' | 'ioc' | 'fok'
  limit_price?: number
  strategy: string
  account_type: string
}

export interface TradeResponse {
  success: boolean
  trade?: any
  error?: string
}

// POST - Execute trade via Alpaca API
export async function POST(req: NextRequest): Promise<NextResponse<TradeResponse>> {
  try {
    const supabase = await createServerClient(req, {})
    
    // Get user ID from request cookies (strict: demo keys only for demo user)
    const { userId, isDemo } = await getUserIdFromRequest(req)

    const body = await req.json()
    const { symbol, side, qty, type, time_in_force, limit_price, strategy, account_type }: TradeRequest = body

    // Validate input
    if (!symbol || !side || !qty || !type || !time_in_force || !strategy || !account_type) {
      return NextResponse.json({ 
        success: false, 
        error: 'Missing required trade parameters' 
      }, { status: 400 })
    }

    // Get Alpaca keys (strict: no demo fallback for authenticated users)
    const alpacaAccountType = account_type === 'live' ? 'live' : 'paper'
    const { apiKey: alpacaApiKey, secretKey: alpacaSecretKey, paper: isPaper } = await getAlpacaKeysForUser(userId, isDemo, alpacaAccountType)

    // Final check to ensure keys are available (NO demo fallback)
    if (!alpacaApiKey || !alpacaSecretKey) {
      return NextResponse.json({ 
        success: false, 
        error: 'API keys not found. Please configure your Alpaca API keys in Settings.' 
      }, { status: 400 })
    }

    // Initialize Alpaca client
    const alpacaClient = createAlpacaClient({
      apiKey: alpacaApiKey,
      secretKey: alpacaSecretKey,
      baseUrl: isPaper ? 'https://paper-api.alpaca.markets' : 'https://api.alpaca.markets',
      paper: isPaper
    })

    await alpacaClient.initialize()

    // Execute trade using the client
    let tradeResult
    try {
      if (type === 'market') {
        tradeResult = await alpacaClient.placeMarketOrder(
          symbol.toUpperCase(),
          qty,
          side,
          time_in_force
        )
      } else if (type === 'limit' && limit_price) {
        tradeResult = await alpacaClient.placeLimitOrder(
          symbol.toUpperCase(),
          qty,
          side,
          limit_price,
          time_in_force
        )
      } else {
        return NextResponse.json({ 
          success: false, 
          error: 'Invalid order type or missing limit price' 
        }, { status: 400 })
      }
    } catch (error: any) {
      console.error('Alpaca client error:', error)
      return NextResponse.json({ 
        success: false, 
        error: `Trade execution failed: ${error.message || 'Unknown error'}` 
      }, { status: 400 })
    }

    // Log trade to database
    const { data: tradeRecord, error: tradeError } = await supabase
      .from('trades')
      .insert({
        user_id: userId,
        symbol: tradeResult.symbol,
        action: side,
        qty: parseFloat(tradeResult.qty || '0'),
        price: parseFloat(tradeResult.filled_avg_price || tradeResult.limit_price || '0'),
        trade_timestamp: new Date(tradeResult.created_at).toISOString(),
        strategy,
        account_type,
        alpaca_order_id: tradeResult.id,
        order_status: tradeResult.status
      })
      .select()
      .single()

    if (tradeError) {
      console.error('Error logging trade:', tradeError)
      // Don't fail the trade if logging fails
    }

    console.log(`Trade executed: ${side} ${qty} ${symbol} at $${tradeResult.filled_avg_price || tradeResult.limit_price}`)

    return NextResponse.json({
      success: true,
      trade: {
        id: tradeRecord?.id || tradeResult.id,
        symbol: tradeResult.symbol,
        side: tradeResult.side,
        qty: tradeResult.qty,
        price: tradeResult.filled_avg_price || tradeResult.limit_price,
        status: tradeResult.status,
        created_at: tradeResult.created_at,
        strategy,
        account_type
      }
    })

  } catch (error) {
    console.error('Error in POST /api/trade:', error)
    return NextResponse.json({ 
      success: false, 
      error: 'Internal server error' 
    }, { status: 500 })
  }
}

// GET - Get user's trade history
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createServerClient(req, {})
    
    // Get user ID from request cookies (strict: demo keys only for demo user)
    const { userId, isDemo } = await getUserIdFromRequest(req)

    const { searchParams } = new URL(req.url)
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')
    const symbol = searchParams.get('symbol')

    // Get trades using the database function
    const { data: trades, error } = await supabase.rpc('get_user_trades', {
      user_uuid: userId,
      limit_count: limit,
      offset_count: offset,
      symbol_filter: symbol
    })

    if (error) {
      console.error('Error fetching trades:', error)
      return NextResponse.json({ 
        success: false, 
        error: 'Failed to fetch trades' 
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      data: trades || []
    })

  } catch (error) {
    console.error('Error in GET /api/trade:', error)
    return NextResponse.json({ 
      success: false, 
      error: 'Internal server error' 
    }, { status: 500 })
  }
}
