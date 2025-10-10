export const runtime = 'nodejs'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/utils/supabase/server'

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createServerClient(req, {})
    
    // Check various auth methods
    const authHeader = req.headers.get('authorization')
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    
    // Check cookies
    const cookies = req.cookies.getAll()
    const authCookies = cookies.filter(c => c.name.includes('sb-') || c.name.includes('auth'))
    
    return NextResponse.json({
      success: true,
      auth: {
        hasAuthHeader: !!authHeader,
        authHeaderValue: authHeader ? authHeader.substring(0, 20) + '...' : null,
        hasUser: !!user,
        userId: user?.id,
        userError: userError?.message,
        hasSession: !!session,
        sessionError: sessionError?.message,
        authCookies: authCookies.map(c => ({ name: c.name, hasValue: !!c.value }))
      }
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ 
      success: false, 
      error: errorMessage
    }, { status: 500 })
  }
}
