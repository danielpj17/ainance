export const runtime = 'nodejs'
import { NextRequest, NextResponse } from 'next/server'
import { getUserIdFromRequest, getAlpacaKeysForUser } from '@/utils/supabase/server'
import { createAlpacaClient } from '@/lib/alpaca-client'

export async function GET(req: NextRequest) {
  try {
    // Get user ID from request cookies (strict: demo keys only for demo user)
    const { userId, isDemo } = await getUserIdFromRequest(req)
    console.log('Account History API - User:', { userId, isDemo })

    // Get period from query params
    const { searchParams } = new URL(req.url)
    const period = searchParams.get('period') || '1D' // 1D, 1W, 1M, 1A
    const timeframe = searchParams.get('timeframe') || '1Min'

    // Get Alpaca keys (strict: no demo fallback for authenticated users)
    const { apiKey: alpacaApiKey, secretKey: alpacaSecretKey } = await getAlpacaKeysForUser(userId, isDemo, 'paper')
    
    // If no keys, return empty history (NO demo fallback)
    if (!alpacaApiKey || !alpacaSecretKey) {
      console.log('Account History API - No API keys, returning empty history')
      return NextResponse.json({ 
        success: true, 
        data: {
          timestamp: [],
          equity: [],
          profit_loss: [],
          profit_loss_pct: [],
          base_value: 0,
          timeframe: timeframe
        }
      })
    }
    
    const alpaca = createAlpacaClient({
      apiKey: alpacaApiKey,
      secretKey: alpacaSecretKey,
      baseUrl: 'https://paper-api.alpaca.markets',
      paper: true
    });
    await alpaca.initialize()
    
    // Fetch portfolio history
    const history = await alpaca.getPortfolioHistory({
      period,
      timeframe,
      extended_hours: false
    })
    
    return NextResponse.json({ success: true, data: history })
  } catch (error: any) {
    console.error('Error fetching portfolio history:', error)
    return NextResponse.json({ 
      success: false, 
      error: error.message || 'Failed to fetch portfolio history' 
    }, { status: 500 })
  }
}

