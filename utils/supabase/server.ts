import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { getDemoUserId } from '@/lib/demo-user'

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

  // Configure for serverless environments with better timeout and retry settings
  return createSupabaseClient(url, serviceRole, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      fetch: (url, options = {}) => {
        // Add timeout for serverless environments
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout
        
        return fetch(url, {
          ...options,
          signal: controller.signal,
        }).finally(() => {
          clearTimeout(timeoutId)
        })
      },
    },
  })
}

// Accept optional args for compatibility with call sites using (req, res)
export const createServerClient = (_req?: any, _res?: any) => createClient()

// Helper to get demo user ID for server-side operations
export const getDemoUserIdServer = () => getDemoUserId()
