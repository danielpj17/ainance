import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    console.log('Debug watchlist API called');
    
    // Test the no-db-watchlist API
    const response = await fetch(`${req.nextUrl.origin}/api/no-db-watchlist`);
    const data = await response.json();
    
    return NextResponse.json({
      success: true,
      message: 'Debug API working',
      noDbResponse: data,
      timestamp: new Date().toISOString()
    });
    
  } catch (error: any) {
    console.error('Debug watchlist error:', error);
    return NextResponse.json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}
