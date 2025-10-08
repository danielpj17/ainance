import { createClient } from '@supabase/supabase-js'

export const createServerClient = (req: any, res: any) => {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
