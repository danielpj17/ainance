export const runtime = 'nodejs'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/utils/supabase/server'
import { getAlpacaKeys, createAlpacaClient } from '@/lib/alpaca-client'

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createServerClient(req, {})
    
    // Get current user with detailed error logging
    console.log('Debug: Attempting to get user...')
    
    // Try both getUser and getSession
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    
    console.log('Debug: User auth result:', { 
      hasUser: !!user, 
      userError: userError?.message,
      userId: user?.id,
      hasSession: !!session,
      sessionError: sessionError?.message
    })
    
    if ((userError || !user) && (sessionError || !session)) {
      return NextResponse.json({ 
        success: false, 
        error: 'Unauthorized', 
        details: {
          userError: userError?.message,
          sessionError: sessionError?.message,
          hasUser: !!user,
          hasSession: !!session,
          authMethod: 'server-client',
          cookies: req.cookies?.get('sb-access-token')?.value ? 'present' : 'missing'
        }
      }, { status: 401 })
    }
    
    const currentUser = user || session?.user
    
    if (!currentUser) {
      return NextResponse.json({ 
        success: false, 
        error: 'No user found in session or token',
        details: {
          hasUser: !!user,
          hasSession: !!session,
          hasSessionUser: !!session?.user
        }
      }, { status: 401 })
    }

    console.log('🔍 Debug Trading Bot - Step by Step Test')
    
    const results: any = {
      step1_user: '✅ User authenticated',
      step2_apiKeys: null,
      step3_alpacaKeys: null,
      step4_alpacaConnection: null,
      step5_marketData: null,
      errors: []
    }

    try {
      // Step 2: Get API Keys
      console.log('Step 2: Getting API keys...')
      const { data: apiKeys, error: keysError } = await supabase.rpc('get_user_api_keys', {
        user_uuid: currentUser.id
      })

      if (keysError || !apiKeys?.[0]) {
        throw new Error('API keys not found: ' + (keysError?.message || 'No keys'))
      }

      results.step2_apiKeys = {
        hasPaperKey: !!apiKeys[0].alpaca_paper_key,
        hasPaperSecret: !!apiKeys[0].alpaca_paper_secret,
        hasNewsKey: !!apiKeys[0].news_api_key,
        keys: apiKeys[0]
      }

      // Step 3: Extract Alpaca Keys
      console.log('Step 3: Extracting Alpaca keys...')
      const alpacaKeys = getAlpacaKeys(apiKeys[0], 'paper', 'cash')
      
      results.step3_alpacaKeys = {
        hasApiKey: !!alpacaKeys.apiKey,
        hasSecretKey: !!alpacaKeys.secretKey,
        isPaper: alpacaKeys.paper,
        baseUrl: alpacaKeys.paper ? 'https://paper-api.alpaca.markets' : 'https://api.alpaca.markets'
      }

      // Step 4: Test Alpaca Connection
      console.log('Step 4: Testing Alpaca connection...')
      const alpacaClient = createAlpacaClient({
        apiKey: alpacaKeys.apiKey,
        secretKey: alpacaKeys.secretKey,
        baseUrl: alpacaKeys.paper ? 'https://paper-api.alpaca.markets' : 'https://api.alpaca.markets',
        paper: alpacaKeys.paper
      })

      await alpacaClient.initialize()
      results.step4_alpacaConnection = '✅ Connected to Alpaca successfully'

      // Step 5: Test Market Data
      console.log('Step 5: Testing market data fetch...')
      const marketData = await alpacaClient.getMarketData(['AAPL'], '1Min')
      
      results.step5_marketData = {
        symbolCount: marketData.length,
        sampleData: marketData[0] || null
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      results.errors.push({
        step: 'Unknown',
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined
      })
      console.error('Debug error:', error)
    }

    return NextResponse.json({
      success: true,
      results,
      message: 'Debug test completed'
    })

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('Debug endpoint error:', error)
    return NextResponse.json({ 
      success: false, 
      error: errorMessage,
      details: error instanceof Error ? error.stack : undefined
    }, { status: 500 })
  }
}
