import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/utils/supabase/server'
import { createAlpacaClient } from '@/lib/alpaca-client'

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const symbol = (searchParams.get('symbol') || 'AAPL').toUpperCase()
    const timeframe = (searchParams.get('timeframe') as any) || '1Min'
    const limit = parseInt(searchParams.get('limit') || '300')

    // Get Alpaca credentials from environment variables first, fallback to database
    let alpacaApiKey: string | undefined = process.env.ALPACA_PAPER_KEY;
    let alpacaSecretKey: string | undefined = process.env.ALPACA_PAPER_SECRET;
    
    // If not in environment, try to get from database (only if user exists)
    if (!alpacaApiKey || !alpacaSecretKey) {
      if (user?.id) {
        const { data: apiKeys } = await supabase.rpc('get_user_api_keys', { user_uuid: user.id });
        const keys = apiKeys?.[0] || {};
        
        if (keys.alpaca_paper_key && keys.alpaca_paper_secret) {
          alpacaApiKey = keys.alpaca_paper_key;
          alpacaSecretKey = keys.alpaca_paper_secret;
        }
      }
    }
    
    // Final check to ensure keys are available
    if (!alpacaApiKey || !alpacaSecretKey) {
      return NextResponse.json(
        { success: false, error: 'Alpaca API keys not configured' },
        { status: 400 }
      );
    }
    
    const alpaca = createAlpacaClient({
      apiKey: alpacaApiKey,
      secretKey: alpacaSecretKey,
      baseUrl: 'https://paper-api.alpaca.markets',
      paper: true
    });
    await alpaca.initialize()

    const series = await alpaca.getBarsSeries(symbol, timeframe, limit)
    return NextResponse.json({ success: true, data: series })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || 'Failed to fetch market data' }, { status: 500 })
  }
}



