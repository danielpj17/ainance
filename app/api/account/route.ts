export const runtime = 'nodejs'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/utils/supabase/server'
import { createAlpacaClient } from '@/lib/alpaca-client'

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerClient(req, {})
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      console.error('Account API - User error:', userError)
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    console.log('Account API - User authenticated:', user.id)

    // Get Alpaca credentials from environment variables first, fallback to database
    let alpacaApiKey: string | undefined = process.env.ALPACA_PAPER_KEY;
    let alpacaSecretKey: string | undefined = process.env.ALPACA_PAPER_SECRET;
    
    console.log('Account API - Env keys available:', { 
      hasApiKey: !!alpacaApiKey, 
      hasSecretKey: !!alpacaSecretKey 
    })
    
    // If not in environment, try to get from database (only if user exists)
    if (!alpacaApiKey || !alpacaSecretKey) {
      console.log('Account API - Attempting to get keys from database')
      if (user?.id) {
        const { data: apiKeys, error: keysError } = await supabase.rpc('get_user_api_keys', { user_uuid: user.id });
        if (keysError) {
          console.error('Account API - Database keys error:', keysError)
        }
        console.log('Account API - Database keys result:', apiKeys)
        const keys = apiKeys?.[0] || {};
        
        if (keys.alpaca_paper_key && keys.alpaca_paper_secret) {
          alpacaApiKey = keys.alpaca_paper_key;
          alpacaSecretKey = keys.alpaca_paper_secret;
          console.log('Account API - Using database keys')
        }
      }
    }
    
    // Final check to ensure keys are available
    if (!alpacaApiKey || !alpacaSecretKey) {
      console.error('Account API - No API keys available')
      return NextResponse.json(
        { success: false, error: 'Alpaca API keys not configured. Please add them in Settings.' },
        { status: 400 }
      );
    }
    
    console.log('Account API - Creating Alpaca client')
    const alpaca = createAlpacaClient({
      apiKey: alpacaApiKey,
      secretKey: alpacaSecretKey,
      baseUrl: 'https://paper-api.alpaca.markets',
      paper: true
    });
    
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



