import { createClient as createSupabaseClient } from '@supabase/supabase-js'

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

  return createSupabaseClient(url, serviceRole)
}

// Accept optional args for compatibility with call sites using (req, res)
export const createServerClient = (_req?: any, _res?: any) => createClient()
