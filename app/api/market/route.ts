import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/utils/supabase/server'
import { createAlpacaClient, getAlpacaKeys } from '@/lib/alpaca-client'

export async function GET(req: NextRequest) {
  try {
    const supabase = createServerClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const symbol = (searchParams.get('symbol') || 'AAPL').toUpperCase()
    const timeframe = (searchParams.get('timeframe') as any) || '1Min'
    const limit = parseInt(searchParams.get('limit') || '300')

    const { data: apiKeys } = await supabase.rpc('get_user_api_keys', { user_uuid: user.id })
    const keys = apiKeys?.[0] || {}
    const alpacaKeys = getAlpacaKeys(keys, 'cash', 'cash')
    const alpaca = createAlpacaClient({ apiKey: alpacaKeys.apiKey, secretKey: alpacaKeys.secretKey, baseUrl: alpacaKeys.paper ? 'https://paper-api.alpaca.markets' : 'https://api.alpaca.markets', paper: alpacaKeys.paper })
    await alpaca.initialize()

    const series = await alpaca.getBarsSeries(symbol, timeframe, limit)
    return NextResponse.json({ success: true, data: series })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || 'Failed to fetch market data' }, { status: 500 })
  }
}



