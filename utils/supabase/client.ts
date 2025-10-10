import { createClient as createSupabaseClient } from '@supabase/supabase-js'

export const createClient = () => {
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

  return createSupabaseClient(supabaseUrl, supabaseAnonKey)
}
