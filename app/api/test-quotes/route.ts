import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    console.log('Test quotes API called');
    
    // Test the quotes API
    const response = await fetch(`${req.nextUrl.origin}/api/stocks/quotes?symbols=AAPL,MSFT,GOOGL`);
    const data = await response.json();
    
    return NextResponse.json({
      success: true,
      message: 'Test quotes API working',
      quotesResponse: data,
      timestamp: new Date().toISOString()
    });
    
  } catch (error: any) {
    console.error('Test quotes error:', error);
    return NextResponse.json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}
