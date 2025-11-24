import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { isDemoMode, getDemoUser, getDemoSession } from '@/lib/demo-user'

// Singleton pattern to prevent multiple client instances
// Using 'any' type to allow different client configurations
let clientInstance: any = null

export const createClient = () => {
  // Return cached instance if available (client-side only)
  if (typeof window !== 'undefined' && clientInstance) {
    return clientInstance
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // During build time, return a dummy client if env vars are missing
  // This allows the build to succeed, and the actual client will be created at runtime
  if (!supabaseUrl || !supabaseAnonKey) {
    if (typeof window === 'undefined') {
      // Server-side during build: return a dummy client
      return createSupabaseClient(
        'https://placeholder.supabase.co',
        'placeholder-anon-key'
      )
    } else {
      // Client-side at runtime: this is a real error
      throw new Error(
        'Missing Supabase environment variables. Please ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set.'
      )
    }
  }

  // Validate URL format and warn about potential mismatches
  if (typeof window !== 'undefined') {
    if (!supabaseUrl.includes('.supabase.co')) {
      console.warn('⚠️ Invalid Supabase URL format:', supabaseUrl)
    }
    
    // Extract project ID from URL and token for validation
    const urlProjectId = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1]
    if (urlProjectId && supabaseAnonKey) {
      try {
        // Decode JWT to check project ID (basic check)
        const tokenParts = supabaseAnonKey.split('.')
        if (tokenParts.length === 3) {
          const payload = JSON.parse(atob(tokenParts[1]))
          const tokenProjectId = payload.ref
          if (tokenProjectId && urlProjectId !== tokenProjectId) {
            console.error(
              '❌ Supabase URL/Token Mismatch!',
              '\n  URL Project ID:', urlProjectId,
              '\n  Token Project ID:', tokenProjectId,
              '\n  Please update NEXT_PUBLIC_SUPABASE_URL in Vercel to:',
              `https://${tokenProjectId}.supabase.co`,
              '\n  Then redeploy your application.'
            )
          }
        }
      } catch (e) {
        // Silently fail if we can't decode the token
      }
    }
  }

  const client = createSupabaseClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  })

  // Cache the instance (client-side only)
  if (typeof window !== 'undefined') {
    clientInstance = client
  }

  // In demo mode, override auth methods to always return demo user
  if (isDemoMode()) {
    const originalAuth = client.auth

    client.auth = {
      ...originalAuth,
      getUser: async () => ({
        data: { user: getDemoUser() },
        error: null,
      }),
      getSession: async () => ({
        data: { session: getDemoSession() },
        error: null,
      }),
      signInWithPassword: async () => ({
        data: { user: getDemoUser(), session: getDemoSession() },
        error: null,
      }),
      signUp: async () => ({
        data: { user: getDemoUser(), session: getDemoSession() },
        error: null,
      }),
      signOut: async () => ({
        error: null,
      }),
      onAuthStateChange: (callback: any) => {
        // Immediately call with signed in state
        callback('SIGNED_IN', getDemoSession())
        return {
          data: { subscription: { unsubscribe: () => {} } },
        }
      },
    } as any
  }

  return client
}
