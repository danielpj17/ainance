import { NextRequest, NextResponse } from 'next/server'
import { getUserIdFromRequest, createServerClient } from '@/utils/supabase/server'

export const runtime = 'nodejs'

/**
 * Debug API to check user authentication and database state
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    // Get user ID from request cookies
    const { userId, isDemo } = await getUserIdFromRequest(req)
    
    const supabase = createServerClient()
    
    // Check if user has settings in database
    const { data: settings, error: settingsError } = await supabase
      .from('user_settings')
      .select('user_id, api_mode, strategy, account_type, updated_at')
      .eq('user_id', userId)
      .single()
    
    // Check if user has API keys
    const { data: apiKeys, error: keysError } = await supabase.rpc('get_user_api_keys', {
      user_uuid: userId
    })
    
    const hasApiKeys = apiKeys?.[0]?.alpaca_paper_key && apiKeys?.[0]?.alpaca_paper_secret
    
    return NextResponse.json({
      success: true,
      debug: {
        userId,
        isDemo,
        isDemoUserId: userId === '00000000-0000-0000-0000-000000000000',
        hasUserSettings: !!settings && !settingsError,
        userSettings: settings || null,
        settingsError: settingsError?.message || null,
        hasApiKeys,
        apiKeysConfigured: {
          alpacaPaper: !!apiKeys?.[0]?.alpaca_paper_key,
          alpacaLive: !!apiKeys?.[0]?.alpaca_live_key,
        },
        keysError: keysError?.message || null,
        message: isDemo 
          ? 'You are in DEMO mode - using shared demo API keys'
          : hasApiKeys 
            ? 'You are AUTHENTICATED and have API keys configured'
            : 'You are AUTHENTICATED but need to add your API keys in Settings'
      }
    })
  } catch (error: any) {
    console.error('Debug error:', error)
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 })
  }
}

