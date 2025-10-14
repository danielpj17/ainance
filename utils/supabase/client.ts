import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { isDemoMode, getDemoUser, getDemoSession } from '@/lib/demo-user'

export const createClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Missing Supabase environment variables. Please ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set in your .env.local file.'
    )
  }

  const client = createSupabaseClient(supabaseUrl, supabaseAnonKey)

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
      onAuthStateChange: (callback) => {
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
