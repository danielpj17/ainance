import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/utils/supabase/server'
import { cookies } from 'next/headers'

export async function GET(req: NextRequest) {
  try {
    console.log('=== TEST AUTH API ===')
    
    // Check cookies
    const cookieStore = await cookies()
    const allCookies = cookieStore.getAll()
    console.log('Cookies present:', allCookies.map(c => c.name))
    
    // Check for Supabase auth cookie
    const authCookie = allCookies.find(c => c.name.includes('auth-token'))
    console.log('Has auth cookie:', !!authCookie)
    
    // Try to get user
    const supabase = await createServerClient()
    console.log('Supabase client created successfully')
    
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    
    console.log('Auth result:', {
      hasUser: !!user,
      userId: user?.id,
      userEmail: user?.email,
      error: userError?.message
    })
    
    if (userError || !user) {
      return NextResponse.json({
        success: false,
        authenticated: false,
        error: userError?.message || 'No user',
        debug: {
          hasCookies: allCookies.length > 0,
          cookieNames: allCookies.map(c => c.name),
          hasAuthCookie: !!authCookie
        }
      }, { status: 401 })
    }
    
    return NextResponse.json({
      success: true,
      authenticated: true,
      user: {
        id: user.id,
        email: user.email
      },
      debug: {
        hasCookies: allCookies.length > 0,
        cookieNames: allCookies.map(c => c.name)
      }
    })
    
  } catch (error: any) {
    console.error('Test auth error:', error)
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 })
  }
}

