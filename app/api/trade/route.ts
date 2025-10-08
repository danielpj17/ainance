import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/utils/supabase/server'

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
    const supabase = createServerClient(req, {})
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { symbol, side, qty, type, time_in_force, limit_price, strategy, account_type }: TradeRequest = body

    // Validate input
    if (!symbol || !side || !qty || !type || !time_in_force || !strategy || !account_type) {
      return NextResponse.json({ 
        success: false, 
        error: 'Missing required trade parameters' 
      }, { status: 400 })
    }

    // Get user's API keys
    const { data: apiKeys, error: keysError } = await supabase.rpc('get_user_api_keys', {
      user_uuid: user.id
    })

    if (keysError || !apiKeys?.[0]) {
      return NextResponse.json({ 
        success: false, 
        error: 'API keys not found. Please configure your trading keys.' 
      }, { status: 400 })
    }

    const keys = apiKeys[0]
    
    // Determine which API keys to use based on account type
    const isPaper = account_type === 'paper' || strategy === 'cash'
    const alpacaKey = isPaper ? keys.alpaca_paper_key : keys.alpaca_live_key
    const alpacaSecret = isPaper ? keys.alpaca_paper_secret : keys.alpaca_live_secret
    const baseUrl = isPaper ? 'https://paper-api.alpaca.markets' : 'https://api.alpaca.markets'

    if (!alpacaKey || !alpacaSecret) {
      return NextResponse.json({ 
        success: false, 
        error: `No ${isPaper ? 'paper' : 'live'} trading API keys configured` 
      }, { status: 400 })
    }

    // Prepare trade order for Alpaca
    const orderData = {
      symbol: symbol.toUpperCase(),
      side,
      qty: qty.toString(),
      type,
      time_in_force,
      ...(limit_price && { limit_price: limit_price.toString() })
    }

    // Execute trade via Alpaca API
    const alpacaResponse = await fetch(`${baseUrl}/v2/orders`, {
      method: 'POST',
      headers: {
        'APCA-API-KEY-ID': alpacaKey,
        'APCA-API-SECRET-KEY': alpacaSecret,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(orderData)
    })

    if (!alpacaResponse.ok) {
      const errorData = await alpacaResponse.json()
      console.error('Alpaca API error:', errorData)
      return NextResponse.json({ 
        success: false, 
        error: `Alpaca API error: ${errorData.message || errorData.error || 'Unknown error'}` 
      }, { status: 400 })
    }

    const tradeResult = await alpacaResponse.json()

    // Log trade to database
    const { data: tradeRecord, error: tradeError } = await supabase
      .from('trades')
      .insert({
        user_id: user.id,
        symbol: tradeResult.symbol,
        action: side,
        qty: parseFloat(tradeResult.qty),
        price: parseFloat(tradeResult.filled_avg_price || tradeResult.limit_price || '0'),
        timestamp: new Date(tradeResult.created_at).toISOString(),
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
    const supabase = createServerClient(req, {})
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')
    const symbol = searchParams.get('symbol')

    // Get trades using the database function
    const { data: trades, error } = await supabase.rpc('get_user_trades', {
      user_uuid: user.id,
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
