import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, getDemoUserIdServer } from '@/utils/supabase/server'
import { isDemoMode } from '@/lib/demo-user'

export interface ApiKeysRequest {
  alpacaPaperKey: string
  alpacaPaperSecret: string
  alpacaLiveKey?: string
  alpacaLiveSecret?: string
  // newsApiKey removed - News API uses shared environment variable
}

export interface ApiKeysResponse {
  success: boolean
  error?: string
}

// POST - Save encrypted API keys
export async function POST(req: NextRequest): Promise<NextResponse<ApiKeysResponse>> {
  try {
    const supabase = createServerClient()
    
    // Try to get real authenticated user first, then fall back to demo
    let userId: string
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    
    if (!userError && user && user.id !== '00000000-0000-0000-0000-000000000000') {
      // Real authenticated user
      userId = user.id
    } else {
      // Fall back to demo mode
      userId = getDemoUserIdServer()
    }

    const body = await req.json()
    const { alpacaPaperKey, alpacaPaperSecret, alpacaLiveKey, alpacaLiveSecret }: ApiKeysRequest = body

    // Validate required keys (News API is shared from environment, not user-specific)
    if (!alpacaPaperKey || !alpacaPaperSecret) {
      return NextResponse.json({ 
        success: false, 
        error: 'Paper trading keys are required' 
      }, { status: 400 })
    }

    // Use the encrypted API key update function
    // News API key is always null - it's shared from environment variables
    const { error } = await supabase.rpc('update_user_api_keys', {
      user_uuid: userId,
      p_alpaca_paper_key: alpacaPaperKey,
      p_alpaca_paper_secret: alpacaPaperSecret,
      p_alpaca_live_key: alpacaLiveKey || null,
      p_alpaca_live_secret: alpacaLiveSecret || null,
      p_news_api_key: null // News API is shared, not user-specific
    })

    if (error) {
      console.error('Error saving API keys:', error)
      return NextResponse.json({ 
        success: false, 
        error: 'Failed to save API keys' 
      }, { status: 500 })
    }

    console.log('API keys saved successfully for user:', userId)

    return NextResponse.json({
      success: true
    })

  } catch (error) {
    console.error('Error in POST /api/settings/api-keys:', error)
    return NextResponse.json({ 
      success: false, 
      error: 'Internal server error' 
    }, { status: 500 })
  }
}

// GET - Retrieve API keys (for validation/testing)
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const supabase = createServerClient()
    
    // Try to get real authenticated user first, then fall back to demo
    let userId: string
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    
    if (!userError && user && user.id !== '00000000-0000-0000-0000-000000000000') {
      // Real authenticated user
      userId = user.id
    } else {
      // Fall back to demo mode
      userId = getDemoUserIdServer()
    }

    // Get encrypted API keys (for testing - in production, you might not want to expose this)
    const { data, error } = await supabase.rpc('get_user_api_keys', {
      user_uuid: userId
    })

    if (error) {
      console.error('Error retrieving API keys:', error)
      return NextResponse.json({ 
        success: false, 
        error: 'Failed to retrieve API keys' 
      }, { status: 500 })
    }

    // Return masked keys for security
    const maskedKeys = data?.[0] ? {
      alpacaPaperKey: data[0].alpaca_paper_key ? 'PK***' + data[0].alpaca_paper_key.slice(-4) : null,
      alpacaPaperSecret: data[0].alpaca_paper_secret ? '***' + data[0].alpaca_paper_secret.slice(-4) : null,
      alpacaLiveKey: data[0].alpaca_live_key ? 'AK***' + data[0].alpaca_live_key.slice(-4) : null,
      alpacaLiveSecret: data[0].alpaca_live_secret ? '***' + data[0].alpaca_live_secret.slice(-4) : null,
      newsApiKey: data[0].news_api_key ? data[0].news_api_key.slice(0, 8) + '***' : null
    } : null

    return NextResponse.json({
      success: true,
      data: maskedKeys
    })

  } catch (error) {
    console.error('Error in GET /api/settings/api-keys:', error)
    return NextResponse.json({ 
      success: false, 
      error: 'Internal server error' 
    }, { status: 500 })
  }
}
