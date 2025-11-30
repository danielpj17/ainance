export const runtime = 'nodejs'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, getDemoUserIdServer } from '@/utils/supabase/server'
import { createAlpacaClient, getAlpacaKeys } from '@/lib/alpaca-client'
import { isDemoMode } from '@/lib/demo-user'
import { createClient as createBrowserClient } from '@supabase/supabase-js'

export async function GET(req: NextRequest) {
  try {
    console.log('Account API - Starting request')
    
    // Create a client that can read cookies from the request
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Missing Supabase environment variables')
    }
    
    // Get the session from cookies
    const cookieHeader = req.headers.get('cookie') || ''
    
    // Create a client that can use the session from cookies
    const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      global: {
        headers: {
          cookie: cookieHeader,
        },
      },
    })
    
    // Try to get real authenticated user first, then fall back to demo
    let userId: string
    let isAuthenticated = false
    
    // Try to get user from session (will use cookies from headers)
    // First try getSession to get the full session with access token
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    
    if (!sessionError && session && session.user && session.user.id !== '00000000-0000-0000-0000-000000000000') {
      // Real authenticated user with valid session
      userId = session.user.id
      isAuthenticated = true
      console.log('Account API - Using authenticated user from session:', userId)
    } else {
      // Fallback: try getUser
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (!userError && user && user.id !== '00000000-0000-0000-0000-000000000000') {
        userId = user.id
        isAuthenticated = true
        console.log('Account API - Using authenticated user from getUser:', userId)
      } else {
        // Fall back to demo mode
        userId = getDemoUserIdServer()
        isAuthenticated = false
        console.log('Account API - Using demo user ID')
      }
    }

    // Try to get keys from database first
    let alpacaApiKey: string | undefined
    let alpacaSecretKey: string | undefined
    
    const { data: apiKeys } = await supabase.rpc('get_user_api_keys', { user_uuid: userId })
    const keys = apiKeys?.[0] || {}
    const alpacaKeys = getAlpacaKeys(keys, 'cash', 'cash')
    
    alpacaApiKey = alpacaKeys.apiKey
    alpacaSecretKey = alpacaKeys.secretKey
    
    // Only fallback to environment variables for demo user, not authenticated users
    if (!alpacaApiKey || !alpacaSecretKey) {
      if (!isAuthenticated && userId === '00000000-0000-0000-0000-000000000000') {
        // Demo mode - use environment variables
        console.log('Account API - No DB keys, using demo environment variables')
        alpacaApiKey = process.env.ALPACA_PAPER_KEY || process.env.NEXT_PUBLIC_ALPACA_PAPER_KEY
        alpacaSecretKey = process.env.ALPACA_PAPER_SECRET || process.env.NEXT_PUBLIC_ALPACA_PAPER_SECRET
      } else {
        // Authenticated user without keys - return zeros/N/A
        console.log('Account API - Authenticated user has no API keys configured, returning zeros')
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
            status: 'ACTIVE'
          }
        })
      }
    }
    
    console.log('Account API - Keys available:', { 
      hasApiKey: !!alpacaApiKey, 
      hasSecretKey: !!alpacaSecretKey,
      isAuthenticated,
      userId
    })
    
    if (!alpacaApiKey || !alpacaSecretKey) {
      console.error('Account API - No API keys available')
      // For demo mode, return error. For authenticated users, we already returned zeros above
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



