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
    
    // Also try to get raw data directly from Alpaca client
    let rawData = null;
    try {
      // Access the raw client to see what it returns
      const rawClient = (alpaca as any).client;
      if (rawClient && rawClient.getBarsV2) {
        const iterator = rawClient.getBarsV2('AAPL', {
          timeframe: '1Day',
          limit: 1,
          start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
        });
        
        const bars: any[] = [];
        for await (const bar of iterator) {
          bars.push(bar);
        }
        rawData = bars;
      }
    } catch (rawError) {
      console.log('Could not get raw data:', rawError);
    }
    
    return NextResponse.json({
      success: true,
      message: 'Market data debug',
      marketData: marketData,
      marketDataLength: marketData?.length || 0,
      firstItem: marketData?.[0] || null,
      firstItemKeys: marketData?.[0] ? Object.keys(marketData[0]) : [],
      rawData: rawData,
      rawDataKeys: rawData?.[0] ? Object.keys(rawData[0]) : [],
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
