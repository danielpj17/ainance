import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/utils/supabase/server'

export interface ApiKeysRequest {
  alpacaPaperKey: string
  alpacaPaperSecret: string
  alpacaLiveKey?: string
  alpacaLiveSecret?: string
  newsApiKey: string
}

export interface ApiKeysResponse {
  success: boolean
  error?: string
}

// POST - Save encrypted API keys
export async function POST(req: NextRequest): Promise<NextResponse<ApiKeysResponse>> {
  try {
    const supabase = await createServerClient(req, {})
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { alpacaPaperKey, alpacaPaperSecret, alpacaLiveKey, alpacaLiveSecret, newsApiKey }: ApiKeysRequest = body

    // Validate required keys
    if (!alpacaPaperKey || !alpacaPaperSecret || !newsApiKey) {
      return NextResponse.json({ 
        success: false, 
        error: 'Paper trading keys and NewsAPI key are required' 
      }, { status: 400 })
    }

    // Use the encrypted API key update function
    const { error } = await supabase.rpc('update_user_api_keys', {
      user_uuid: user.id,
      p_alpaca_paper_key: alpacaPaperKey,
      p_alpaca_paper_secret: alpacaPaperSecret,
      p_alpaca_live_key: alpacaLiveKey || null,
      p_alpaca_live_secret: alpacaLiveSecret || null,
      p_news_api_key: newsApiKey
    })

    if (error) {
      console.error('Error saving API keys:', error)
      return NextResponse.json({ 
        success: false, 
        error: 'Failed to save API keys' 
      }, { status: 500 })
    }

    console.log('API keys saved successfully for user:', user.id)

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
    const supabase = await createServerClient(req, {})
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    // Get encrypted API keys (for testing - in production, you might not want to expose this)
    const { data, error } = await supabase.rpc('get_user_api_keys', {
      user_uuid: user.id
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
