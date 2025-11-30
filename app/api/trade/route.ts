export const runtime = 'nodejs'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, getDemoUserIdServer } from '@/utils/supabase/server'
import { createAlpacaClient, getAlpacaKeys, isPaperTrading } from '@/lib/alpaca-client'
import { isDemoMode } from '@/lib/demo-user'

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
    const { symbol, side, qty, type, time_in_force, limit_price, strategy, account_type }: TradeRequest = body

    // Validate input
    if (!symbol || !side || !qty || !type || !time_in_force || !strategy || !account_type) {
      return NextResponse.json({ 
        success: false, 
        error: 'Missing required trade parameters' 
      }, { status: 400 })
    }

    // Get Alpaca credentials - prioritize user-specific keys from database
    // For authenticated users: use their saved keys
    // For demo mode: fallback to environment variables
    let alpacaApiKey: string | undefined
    let alpacaSecretKey: string | undefined
    let isPaper = true
    
    const isDemo = userId === '00000000-0000-0000-0000-000000000000'
    
    // For authenticated users, always try database first (user-specific keys)
    if (!isDemo) {
      const { data: apiKeys, error: keysError } = await supabase.rpc('get_user_api_keys', {
        user_uuid: userId
      })

      if (!keysError && apiKeys?.[0]) {
        const keys = apiKeys[0]
        const alpacaKeys = getAlpacaKeys(keys, account_type, strategy)
        
        if (alpacaKeys.apiKey && alpacaKeys.secretKey) {
          alpacaApiKey = alpacaKeys.apiKey;
          alpacaSecretKey = alpacaKeys.secretKey;
          isPaper = alpacaKeys.paper;
        }
      }
    }
    
    // Only fallback to environment variables for demo user, not authenticated users
    if (!alpacaApiKey || !alpacaSecretKey) {
      if (isDemo) {
        // Demo mode - use environment variables
        alpacaApiKey = process.env.ALPACA_PAPER_KEY
        alpacaSecretKey = process.env.ALPACA_PAPER_SECRET
      }
    }

    // Final check to ensure keys are available
    if (!alpacaApiKey || !alpacaSecretKey) {
      return NextResponse.json({ 
        success: false, 
        error: 'API keys not found. Please configure your Alpaca API keys in environment variables or database.' 
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
