import { NextRequest, NextResponse } from 'next/server';
import { createAlpacaClient } from '@/lib/alpaca-client';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    console.log('Debug market data API called');
    
    const alpacaApiKey = process.env.ALPACA_PAPER_KEY;
    const alpacaSecretKey = process.env.ALPACA_PAPER_SECRET;
    
    if (!alpacaApiKey || !alpacaSecretKey) {
      return NextResponse.json({
        success: false,
        error: 'Alpaca API keys not found'
      });
    }
    
    const alpaca = createAlpacaClient({
      apiKey: alpacaApiKey,
      secretKey: alpacaSecretKey,
      baseUrl: 'https://paper-api.alpaca.markets',
      paper: true
    });
    
    await alpaca.initialize();
    
    // Get market data for AAPL
    const marketData = await alpaca.getMarketData(['AAPL'], '1Day');
    
    return NextResponse.json({
      success: true,
      message: 'Market data debug',
      marketData: marketData,
      marketDataLength: marketData?.length || 0,
      firstItem: marketData?.[0] || null,
      firstItemKeys: marketData?.[0] ? Object.keys(marketData[0]) : [],
      timestamp: new Date().toISOString()
    });
    
  } catch (error: any) {
    console.error('Debug market data error:', error);
    return NextResponse.json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}
