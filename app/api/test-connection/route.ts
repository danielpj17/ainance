export const runtime = 'nodejs'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    console.log('🔍 Testing Basic Connection')
    
    const results = {
      timestamp: new Date().toISOString(),
      environment: {
        hasSupabaseUrl: !!process.env.SUPABASE_URL,
        hasSupabaseAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        hasSupabaseServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
        nodeEnv: process.env.NODE_ENV
      },
      headers: {
        authorization: req.headers.get('authorization'),
        userAgent: req.headers.get('user-agent'),
        origin: req.headers.get('origin')
      },
      test: '✅ Basic endpoint working'
    }

    return NextResponse.json({
      success: true,
      results
    })

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ 
      success: false, 
      error: errorMessage
    }, { status: 500 })
  }
}
