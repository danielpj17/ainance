export const runtime = 'nodejs'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, getDemoUserIdServer } from '@/utils/supabase/server'
import { createAlpacaClient, getAlpacaKeys } from '@/lib/alpaca-client'
import { isDemoMode } from '@/lib/demo-user'

export async function GET(req: NextRequest) {
  try {
    console.log('Account API - Starting request')
    
    const supabase = createServerClient()
    
    // In demo mode, always use demo user ID
    let userId: string
    if (isDemoMode()) {
      userId = getDemoUserIdServer()
      console.log('Account API - Using demo user ID')
    } else {
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
      }
      userId = user.id
    }

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
      console.log('Account API - No DB keys, trying environment variables')
      alpacaApiKey = process.env.ALPACA_PAPER_KEY || process.env.NEXT_PUBLIC_ALPACA_PAPER_KEY
      alpacaSecretKey = process.env.ALPACA_PAPER_SECRET || process.env.NEXT_PUBLIC_ALPACA_PAPER_SECRET
    }
    
    console.log('Account API - Keys available:', { 
      hasApiKey: !!alpacaApiKey, 
      hasSecretKey: !!alpacaSecretKey 
    })
    
    if (!alpacaApiKey || !alpacaSecretKey) {
      console.error('Account API - No API keys available')
      return NextResponse.json(
        { success: false, error: 'Alpaca API keys not configured. Please add them in Settings or set ALPACA_PAPER_KEY and ALPACA_PAPER_SECRET environment variables.' },
        { status: 400 }
      )
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



