import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, getDemoUserIdServer } from '@/utils/supabase/server'
import { createAlpacaClient, getAlpacaKeys } from '@/lib/alpaca-client'
import { isDemoMode } from '@/lib/demo-user'

export async function GET(req: NextRequest) {
  try {
    const supabase = createServerClient()
    
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
    const symbol = (searchParams.get('symbol') || 'AAPL').toUpperCase()
    const timeframe = (searchParams.get('timeframe') as any) || '1Min'
    const limit = parseInt(searchParams.get('limit') || '300')

    // Try to get keys from database first
    let alpacaApiKey: string | undefined
    let alpacaSecretKey: string | undefined
    
    const { data: apiKeys } = await supabase.rpc('get_user_api_keys', { user_uuid: userId })
    const keys = apiKeys?.[0] || {}
    const alpacaKeys = getAlpacaKeys(keys, 'cash', 'cash')
    
    alpacaApiKey = alpacaKeys.apiKey
    alpacaSecretKey = alpacaKeys.secretKey
    
    // Fallback to environment variables if no keys in database
    if (!alpacaApiKey || !alpacaSecretKey) {
      alpacaApiKey = process.env.ALPACA_PAPER_KEY || process.env.NEXT_PUBLIC_ALPACA_PAPER_KEY
      alpacaSecretKey = process.env.ALPACA_PAPER_SECRET || process.env.NEXT_PUBLIC_ALPACA_PAPER_SECRET
    }
    
    if (!alpacaApiKey || !alpacaSecretKey) {
      return NextResponse.json(
        { success: false, error: 'Alpaca API keys not configured' },
        { status: 400 }
      )
    }
    
    const alpaca = createAlpacaClient({
      apiKey: alpacaApiKey,
      secretKey: alpacaSecretKey,
      baseUrl: 'https://paper-api.alpaca.markets',
      paper: true
    })
    await alpaca.initialize()

    const series = await alpaca.getBarsSeries(symbol, timeframe, limit)
    return NextResponse.json({ success: true, data: series })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || 'Failed to fetch market data' }, { status: 500 })
  }
}



