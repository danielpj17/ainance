import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { getDemoUserId } from '@/lib/demo-user'
import { NextRequest } from 'next/server'

// Demo user ID constant
const DEMO_USER_ID = '00000000-0000-0000-0000-000000000000'

export const createClient = () => {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRole) {
    console.error(
      'Supabase server env missing:',
      {
        SUPABASE_URL_defined: Boolean(process.env.SUPABASE_URL),
        NEXT_PUBLIC_SUPABASE_URL_defined: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
        SUPABASE_SERVICE_ROLE_KEY_defined: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      }
    )
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set')
  }

  // Configure for serverless environments
  // Note: Using default fetch with timeout handled by Vercel's function timeout
  return createSupabaseClient(url, serviceRole, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

// Accept optional args for compatibility with call sites using (req, res)
export const createServerClient = (_req?: any, _res?: any) => createClient()

// Helper to get demo user ID for server-side operations
export const getDemoUserIdServer = () => getDemoUserId()

/**
 * Get the authenticated user ID from request.
 * Checks Authorization header (Bearer token) first, then cookies.
 * Returns the real user ID if authenticated, or the demo user ID if not.
 * Also returns whether this is a demo user (for strict API key separation).
 */
export async function getUserIdFromRequest(req: NextRequest): Promise<{ userId: string; isDemo: boolean }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  
  if (!supabaseUrl || !supabaseAnonKey) {
    console.log('getUserIdFromRequest - Missing Supabase env vars, using demo user')
    return { userId: DEMO_USER_ID, isDemo: true }
  }
  
  // Create a Supabase client
  const supabase = createSupabaseClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
  
  try {
    // Method 1: Check Authorization header (Bearer token)
    const authHeader = req.headers.get('authorization')
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7) // Remove 'Bearer ' prefix
      console.log('getUserIdFromRequest - Found Authorization header, validating token...')
      
      // Validate the token and get user
      const { data: { user }, error } = await supabase.auth.getUser(token)
      
      if (!error && user && user.id !== DEMO_USER_ID) {
        console.log('getUserIdFromRequest - Authenticated user from token:', user.id, user.email)
        return { userId: user.id, isDemo: false }
      } else if (error) {
        console.log('getUserIdFromRequest - Token validation error:', error.message)
      }
    }
    
    // Method 2: Check cookies (for browser requests)
    const cookieHeader = req.headers.get('cookie') || ''
    if (cookieHeader) {
      // Look for Supabase auth token in cookies
      const projectRef = supabaseUrl.split('//')[1]?.split('.')[0] || ''
      const tokenCookieName = `sb-${projectRef}-auth-token`
      
      // Parse cookies
      const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
        const [key, value] = cookie.trim().split('=')
        if (key && value) acc[key] = decodeURIComponent(value)
        return acc
      }, {} as Record<string, string>)
      
      // Try to find and parse the auth token cookie
      const authTokenCookie = cookies[tokenCookieName]
      if (authTokenCookie) {
        try {
          const tokenData = JSON.parse(authTokenCookie)
          if (tokenData.access_token) {
            console.log('getUserIdFromRequest - Found auth cookie, validating...')
            const { data: { user }, error } = await supabase.auth.getUser(tokenData.access_token)
            
            if (!error && user && user.id !== DEMO_USER_ID) {
              console.log('getUserIdFromRequest - Authenticated user from cookie:', user.id, user.email)
              return { userId: user.id, isDemo: false }
            }
          }
        } catch (e) {
          console.log('getUserIdFromRequest - Could not parse auth cookie')
        }
      }
    }
  } catch (e) {
    console.error('getUserIdFromRequest - Error checking auth:', e)
  }
  
  // Fall back to demo user
  console.log('getUserIdFromRequest - No valid auth found, using demo user')
  return { userId: DEMO_USER_ID, isDemo: true }
}

/**
 * Get Alpaca API keys for a user.
 * STRICT: Only returns demo keys for demo user. Authenticated users get their own keys or nothing.
 */
export async function getAlpacaKeysForUser(
  userId: string,
  isDemo: boolean,
  accountType: 'paper' | 'live' = 'paper'
): Promise<{ apiKey: string | null; secretKey: string | null; paper: boolean }> {
  const supabase = createClient()
  
  // For demo user ONLY, use environment variables
  if (isDemo && userId === DEMO_USER_ID) {
    console.log('getAlpacaKeysForUser - Demo user, using env vars')
    const apiKey = accountType === 'paper' 
      ? (process.env.ALPACA_PAPER_KEY || process.env.NEXT_PUBLIC_ALPACA_PAPER_KEY || null)
      : (process.env.ALPACA_LIVE_KEY || null)
    const secretKey = accountType === 'paper'
      ? (process.env.ALPACA_PAPER_SECRET || process.env.NEXT_PUBLIC_ALPACA_PAPER_SECRET || null)
      : (process.env.ALPACA_LIVE_SECRET || null)
    return { apiKey, secretKey, paper: accountType === 'paper' }
  }
  
  // For authenticated users, ONLY use their saved keys from database
  console.log('getAlpacaKeysForUser - Authenticated user, checking database for keys')
  try {
    const { data: apiKeys, error } = await supabase.rpc('get_user_api_keys', { user_uuid: userId })
    
    if (!error && apiKeys?.[0]) {
      const keys = apiKeys[0]
      if (accountType === 'paper' && keys.alpaca_paper_key && keys.alpaca_paper_secret) {
        console.log('getAlpacaKeysForUser - Found paper keys in database')
        return { apiKey: keys.alpaca_paper_key, secretKey: keys.alpaca_paper_secret, paper: true }
      }
      if (accountType === 'live' && keys.alpaca_live_key && keys.alpaca_live_secret) {
        console.log('getAlpacaKeysForUser - Found live keys in database')
        return { apiKey: keys.alpaca_live_key, secretKey: keys.alpaca_live_secret, paper: false }
      }
    }
  } catch (e) {
    console.error('getAlpacaKeysForUser - Error fetching keys:', e)
  }
  
  // Authenticated user without keys - return null (NO fallback to demo keys)
  console.log('getAlpacaKeysForUser - No keys found for authenticated user')
  return { apiKey: null, secretKey: null, paper: accountType === 'paper' }
}
