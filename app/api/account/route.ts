export const runtime = 'nodejs'
import { NextRequest, NextResponse } from 'next/server'
import { getUserIdFromRequest, getAlpacaKeysForUser } from '@/utils/supabase/server'
import { createAlpacaClient } from '@/lib/alpaca-client'

export async function GET(req: NextRequest) {
  try {
    console.log('Account API - Starting request')
    
    // Get user ID from request cookies (strict: demo keys only for demo user)
    const { userId, isDemo } = await getUserIdFromRequest(req)
    console.log('Account API - User:', { userId, isDemo })
    
    // Get Alpaca keys (strict: no demo fallback for authenticated users)
    const { apiKey: alpacaApiKey, secretKey: alpacaSecretKey } = await getAlpacaKeysForUser(userId, isDemo, 'paper')
    
    console.log('Account API - Keys available:', { 
      hasApiKey: !!alpacaApiKey, 
      hasSecretKey: !!alpacaSecretKey,
      isDemo,
      userId
    })
    
    // If authenticated user has no keys, return zeros/N/A (NO demo fallback)
    if (!alpacaApiKey || !alpacaSecretKey) {
      console.log('Account API - No API keys available, returning zeros')
      return NextResponse.json({ 
        success: true, 
        data: {
          equity: '0.00',
          cash: '0.00',
          buying_power: '0.00',
          portfolio_value: '0.00',
          day_trading_buying_power: '0.00',
          pattern_day_trader: false,
          trading_blocked: false,
          account_blocked: false,
          long_market_value: '0.00',
          short_market_value: '0.00',
          account_number: 'N/A',
          status: 'NOT_CONFIGURED'
        }
      })
    }
    
    console.log('Account API - Creating Alpaca client')
    const alpaca = createAlpacaClient({
      apiKey: alpacaApiKey,
      secretKey: alpacaSecretKey,
      baseUrl: 'https://paper-api.alpaca.markets',
      paper: true
    })
    
    console.log('Account API - Initializing Alpaca client')
    await alpaca.initialize()
    
    console.log('Account API - Fetching account data')
    const account = await alpaca.getAccount()
    
    console.log('Account API - Account data received:', {
      equity: account.equity,
      cash: account.cash,
      buying_power: account.buying_power
    })
    
    return NextResponse.json({ success: true, data: account })
  } catch (error: any) {
    console.error('Account API - Error:', error)
    return NextResponse.json({ 
      success: false, 
      error: error.message || 'Failed to fetch account' 
    }, { status: 500 })
  }
}



