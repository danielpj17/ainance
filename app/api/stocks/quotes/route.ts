/**
 * Stock Quotes API
 * 
 * Get current quotes for multiple stocks
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/utils/supabase/server';
import { createAlpacaClient, getAlpacaKeys } from '@/lib/alpaca-client';

export const runtime = 'nodejs';

/**
 * GET - Get quotes for multiple symbols
 * Query params: symbols=AAPL,MSFT,GOOGL
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createServerClient();
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    const { searchParams } = new URL(req.url);
    const symbolsParam = searchParams.get('symbols');
    
    if (!symbolsParam) {
      return NextResponse.json(
        { success: false, error: 'Symbols parameter is required' },
        { status: 400 }
      );
    }
    
    const symbols = symbolsParam.split(',').map(s => s.trim().toUpperCase()).filter(s => s);
    
    if (symbols.length === 0) {
      return NextResponse.json(
        { success: false, error: 'At least one symbol is required' },
        { status: 400 }
      );
    }
    
    // Get Alpaca credentials from environment variables first, fallback to database
    let alpacaApiKey = process.env.ALPACA_PAPER_KEY;
    let alpacaSecretKey = process.env.ALPACA_PAPER_SECRET;
    
    // If not in environment, try to get from database
    if (!alpacaApiKey || !alpacaSecretKey) {
      const { data: apiKeys } = await supabase.rpc('get_user_api_keys', { user_uuid: user.id });
      const keys = apiKeys?.[0] || {};
      
      if (!keys.alpaca_paper_key || !keys.alpaca_paper_secret) {
        return NextResponse.json(
          { success: false, error: 'Alpaca API keys not configured. Please add ALPACA_PAPER_KEY and ALPACA_PAPER_SECRET to your Vercel environment variables.' },
          { status: 400 }
        );
      }
      
      alpacaApiKey = keys.alpaca_paper_key;
      alpacaSecretKey = keys.alpaca_paper_secret;
    }
    
    const alpaca = createAlpacaClient({
      apiKey: alpacaApiKey,
      secretKey: alpacaSecretKey,
      baseUrl: 'https://paper-api.alpaca.markets',
      paper: true
    });
    
    await alpaca.initialize();
    
    // Get market data for all symbols
    const marketData = await alpaca.getMarketData(symbols, '1Min');
    
    // Format response
    const quotes = marketData.map(data => ({
      symbol: data.symbol,
      price: data.close,
      open: data.open,
      high: data.high,
      low: data.low,
      volume: data.volume,
      change: data.close - data.open,
      changePercent: ((data.close - data.open) / data.open) * 100,
      timestamp: data.timestamp
    }));
    
    return NextResponse.json({
      success: true,
      quotes
    });
    
  } catch (error: any) {
    console.error('Stock quotes error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch stock quotes' },
      { status: 500 }
    );
  }
}

