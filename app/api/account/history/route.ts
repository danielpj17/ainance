export const runtime = 'nodejs'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, getDemoUserIdServer } from '@/utils/supabase/server'
import { createAlpacaClient, getAlpacaKeys } from '@/lib/alpaca-client'
import { createClient as createBrowserClient } from '@supabase/supabase-js'

export async function GET(req: NextRequest) {
  try {
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
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    
    if (!sessionError && session && session.user && session.user.id !== '00000000-0000-0000-0000-000000000000') {
      userId = session.user.id
      isAuthenticated = true
      console.log('Account History API - Using authenticated user from session:', userId)
    } else {
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (!userError && user && user.id !== '00000000-0000-0000-0000-000000000000') {
        userId = user.id
        isAuthenticated = true
        console.log('Account History API - Using authenticated user from getUser:', userId)
      } else {
        userId = getDemoUserIdServer()
        isAuthenticated = false
        console.log('Account History API - Using demo user ID')
      }
    }

    // Get period from query params
    const { searchParams } = new URL(req.url)
    const period = searchParams.get('period') || '1D' // 1D, 1W, 1M, 1A
    const timeframe = searchParams.get('timeframe') || '1Min'

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
        alpacaApiKey = process.env.ALPACA_PAPER_KEY || process.env.NEXT_PUBLIC_ALPACA_PAPER_KEY
        alpacaSecretKey = process.env.ALPACA_PAPER_SECRET || process.env.NEXT_PUBLIC_ALPACA_PAPER_SECRET
      } else {
        // Authenticated user without keys - return empty history
        console.log('Account History API - Authenticated user has no API keys configured, returning empty history')
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

