export const runtime = 'nodejs'
import { NextRequest, NextResponse } from 'next/server'
import { getUserIdFromRequest, getAlpacaKeysForUser } from '@/utils/supabase/server'
import { createAlpacaClient } from '@/lib/alpaca-client'

export async function GET(req: NextRequest) {
  try {
    // Get user ID from request cookies (strict: demo keys only for demo user)
    const { userId, isDemo } = await getUserIdFromRequest(req)
    console.log('Account History API - User:', { userId, isDemo })

    // Get period and account type from query params
    const { searchParams } = new URL(req.url)
    const period = searchParams.get('period') || '1D' // 1D, 1W, 1M, 1A
    const timeframe = searchParams.get('timeframe') || '1Min'
    const accountType = (searchParams.get('account_type') || 'paper') as 'paper' | 'live'
    const accountId = searchParams.get('account_id') || undefined

    // Get Alpaca keys (with optional account_id for paper trading)
    const { apiKey: alpacaApiKey, secretKey: alpacaSecretKey, paper } = await getAlpacaKeysForUser(userId, isDemo, accountType, accountId)
    
    console.log('Account History API - Account type:', accountType)
    
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
    
    const baseUrl = paper ? 'https://paper-api.alpaca.markets' : 'https://api.alpaca.markets'
    
    const alpaca = createAlpacaClient({
      apiKey: alpacaApiKey,
      secretKey: alpacaSecretKey,
      baseUrl,
      paper
    });
    await alpaca.initialize()
    
    // Fetch portfolio history
    const history = await alpaca.getPortfolioHistory({
      period,
      timeframe,
      extended_hours: false
    })
    
    // Log the response structure to debug
    console.log('Account History API - Portfolio history response structure:', {
      hasEquity: Array.isArray(history?.equity),
      equityLength: history?.equity?.length || 0,
      hasValue: Array.isArray(history?.value),
      valueLength: history?.value?.length || 0,
      keys: Object.keys(history || {}),
      firstEquityValue: history?.equity?.[0],
      firstValueValue: history?.value?.[0],
      sampleEquity: history?.equity?.slice(0, 3),
      sampleValue: history?.value?.slice(0, 3)
    })
    
    // The Alpaca API returns portfolio history with 'equity' field containing total portfolio value
    // (cash + market value of positions). Ensure we're using equity, not value or cash.
    // Handle case-insensitive field access in case SDK returns different casing
    const equityArray = history?.equity || history?.Equity || []
    const valueArray = history?.value || history?.Value || []
    
    // If equity array exists and has data, use it (this is the correct field for portfolio equity)
    // If only value exists, it might be cash, so we should not use it
    const finalEquity = equityArray.length > 0 ? equityArray : []
    
    if (equityArray.length === 0 && valueArray.length > 0) {
      console.warn('Account History API - WARNING: No equity field found, but value field exists. This might be cash, not equity.')
    }
    
    // Return the history with explicit equity field
    const responseData = {
      timestamp: history?.timestamp || history?.Timestamp || [],
      equity: finalEquity,
      profit_loss: history?.profit_loss || history?.ProfitLoss || [],
      profit_loss_pct: history?.profit_loss_pct || history?.ProfitLossPct || [],
      base_value: history?.base_value || history?.BaseValue || (finalEquity.length > 0 ? finalEquity[0] : 0),
      timeframe: history?.timeframe || timeframe
    }
    
    return NextResponse.json({ success: true, data: responseData })
  } catch (error: any) {
    console.error('Error fetching portfolio history:', error)
    return NextResponse.json({ 
      success: false, 
      error: error.message || 'Failed to fetch portfolio history' 
    }, { status: 500 })
  }
}

