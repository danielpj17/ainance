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

  // In demo mode, use a custom fetch that removes Authorization headers
  // This prevents JWT validation errors when using invalid demo tokens
  const customFetch: typeof fetch = isDemoMode() && typeof window !== 'undefined'
    ? async (input, init) => {
        // Remove Authorization header if present
        if (init?.headers) {
          const headers = new Headers(init.headers)
          headers.delete('Authorization')
          init.headers = headers
        }
        return fetch(input, init)
      }
    : fetch

  const client = createSupabaseClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true, // Always persist - we'll check for real sessions
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    global: {
      fetch: customFetch,
    },
  })

  // Cache the instance (client-side only)
  if (typeof window !== 'undefined') {
    clientInstance = client
  }

  // In demo mode, we need to support both real auth and demo mode
  // Check for real sessions first, then fall back to demo
  if (isDemoMode()) {
    const originalAuth = client.auth
    const originalGetUser = originalAuth.getUser.bind(originalAuth)
    const originalGetSession = originalAuth.getSession.bind(originalAuth)

    // Override getUser to check for real user first, then fall back to demo
    client.auth.getUser = async () => {
      try {
        // Try to get real user first
        const { data: { user }, error } = await originalGetUser()
        if (user && !error && user.id !== '00000000-0000-0000-0000-000000000000') {
          return { data: { user }, error: null } // Real user signed in
        }
      } catch (e) {
        // If there's an error getting real user, fall through to demo
      }
      // Fall back to demo user
      return {
        data: { user: getDemoUser() },
        error: null,
      }
    }

    // Override getSession to check for real session first, then fall back to demo
    client.auth.getSession = async () => {
      try {
        // Try to get real session first
        const { data: { session }, error } = await originalGetSession()
        if (session && !error && session.user && session.user.id !== '00000000-0000-0000-0000-000000000000') {
          return { data: { session }, error: null } // Real session exists
        }
      } catch (e) {
        // If there's an error getting real session, fall through to demo
      }
      // Return null session for demo mode
      return {
        data: { session: null },
        error: null,
      }
    }

    // Keep other methods but allow OAuth to work
    client.auth = {
      ...originalAuth,
      signInWithPassword: async () => ({
        data: { user: getDemoUser(), session: null },
        error: null,
      }),
      signUp: async () => ({
        data: { user: getDemoUser(), session: null },
        error: null,
      }),
      signOut: async () => {
        // Try to sign out real session first
        try {
          await originalAuth.signOut()
        } catch (e) {
          // Ignore errors
        }
        // Clear session storage
        if (typeof window !== 'undefined') {
          localStorage.removeItem(`sb-${supabaseUrl.split('//')[1].split('.')[0]}-auth-token`)
        }
        return { error: null }
      },
      onAuthStateChange: (callback: any) => {
        // Listen for real auth changes
        const { data: { subscription } } = originalAuth.onAuthStateChange((event, session) => {
          if (session && session.user && session.user.id !== '00000000-0000-0000-0000-000000000000') {
            // Real user signed in
            callback(event, session)
          } else {
            // Demo mode - call with demo user but no session
            callback('SIGNED_IN', null)
          }
        })
        return { data: { subscription } }
      },
    } as any
  }

  return client
}
