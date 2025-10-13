import { NextRequest, NextResponse } from 'next/server';
import { createAlpacaClient } from '@/lib/alpaca-client';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    console.log('Testing Alpaca client...');
    
    // Check environment variables
    const alpacaApiKey = process.env.ALPACA_PAPER_KEY;
    const alpacaSecretKey = process.env.ALPACA_PAPER_SECRET;
    
    if (!alpacaApiKey || !alpacaSecretKey) {
      return NextResponse.json({
        success: false,
        error: 'Alpaca API keys not found in environment variables',
        hasApiKey: !!alpacaApiKey,
        hasSecretKey: !!alpacaSecretKey
      });
    }
    
    // Create Alpaca client
    const alpaca = createAlpacaClient({
      apiKey: alpacaApiKey,
      secretKey: alpacaSecretKey,
      baseUrl: 'https://paper-api.alpaca.markets',
      paper: true
    });
    
    // Test initialization
    await alpaca.initialize();
    console.log('Alpaca client initialized successfully');
    
    // Test account info
    const account = await alpaca.getAccount();
    console.log('Account info retrieved:', account.id);
    
    // Test market status
    const isMarketOpen = await alpaca.isMarketOpen();
    console.log('Market status:', isMarketOpen);
    
    // Test getting bars for AAPL
    const marketData = await alpaca.getMarketData(['AAPL'], '1Day');
    console.log('Market data for AAPL:', marketData);
    
    return NextResponse.json({
      success: true,
      message: 'Alpaca client test successful',
      accountId: account.id,
      isMarketOpen: isMarketOpen,
      marketDataLength: marketData?.length || 0,
      sampleMarketData: marketData?.[0] || null,
      timestamp: new Date().toISOString()
    });
    
  } catch (error: any) {
    console.error('Alpaca client test error:', error);
    return NextResponse.json({
      success: false,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}