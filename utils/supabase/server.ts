import { createClient } from '@supabase/supabase-js'

export const createServerClient = (req: any, res: any) => {
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

  // Forward user's Authorization header if present so auth.getUser() works
  let authorizationHeader: string | undefined
  try {
    // Next.js Route Handler Request has headers.get
    authorizationHeader = typeof req?.headers?.get === 'function'
      ? req.headers.get('Authorization') || undefined
      : (req?.headers?.authorization || req?.headers?.Authorization)
  } catch (_) {
    authorizationHeader = undefined
  }

  return createClient(url, serviceRole, {
    global: {
      headers: authorizationHeader ? { Authorization: authorizationHeader } : undefined,
    },
  })
}
