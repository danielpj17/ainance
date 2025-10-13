/**
 * Test Alpaca API Connection
 */

import { NextResponse } from 'next/server';

export async function GET() {
  const ALPACA_KEY = process.env.ALPACA_PAPER_KEY;
  const ALPACA_SECRET = process.env.ALPACA_PAPER_SECRET;
  
  // Test the API connection
  try {
    const response = await fetch('https://data.alpaca.markets/v2/stocks/AAPL/bars?timeframe=1Day&limit=5&feed=iex', {
      headers: {
        'APCA-API-KEY-ID': ALPACA_KEY!,
        'APCA-API-SECRET-KEY': ALPACA_SECRET!,
      },
    });
    
    const data = await response.json();
    
    return NextResponse.json({
      hasKeys: !!ALPACA_KEY && !!ALPACA_SECRET,
      keyPrefix: ALPACA_KEY?.substring(0, 4),
      apiStatus: response.status,
      apiResponse: data,
      success: response.ok
    });
  } catch (error: any) {
    return NextResponse.json({
      hasKeys: !!ALPACA_KEY && !!ALPACA_SECRET,
      keyPrefix: ALPACA_KEY?.substring(0, 4),
      error: error.message,
      success: false
    });
  }
}
