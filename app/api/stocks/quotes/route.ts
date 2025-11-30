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
    
    // TEMPORARY: Skip auth check for testing
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    const userId = user?.id || '00000000-0000-0000-0000-000000000000';
    
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
    
    // Get Alpaca credentials - prioritize user-specific keys from database
    // For authenticated users: use their saved keys
    // For demo mode: fallback to environment variables
    let alpacaApiKey: string | undefined
    let alpacaSecretKey: string | undefined
    
    const isDemo = userId === '00000000-0000-0000-0000-000000000000'
    
    // For authenticated users, always try database first (user-specific keys)
    if (!isDemo) {
      const { data: apiKeys } = await supabase.rpc('get_user_api_keys', { user_uuid: userId });
      const keys = apiKeys?.[0] || {};
      
      if (keys.alpaca_paper_key && keys.alpaca_paper_secret) {
        alpacaApiKey = keys.alpaca_paper_key;
        alpacaSecretKey = keys.alpaca_paper_secret;
      }
    }
    
    // Fallback to environment variables if no user keys found (or demo mode)
    if (!alpacaApiKey || !alpacaSecretKey) {
      alpacaApiKey = process.env.ALPACA_PAPER_KEY;
      alpacaSecretKey = process.env.ALPACA_PAPER_SECRET;
    }
    
    // Final check to ensure keys are available
    if (!alpacaApiKey || !alpacaSecretKey) {
      return NextResponse.json(
        { success: false, error: 'Alpaca API keys not configured. Please add ALPACA_PAPER_KEY and ALPACA_PAPER_SECRET to your Vercel environment variables.' },
        { status: 400 }
      );
    }
    
    const alpaca = createAlpacaClient({
      apiKey: alpacaApiKey,
      secretKey: alpacaSecretKey,
      baseUrl: 'https://paper-api.alpaca.markets',
      paper: true
    });
    
    await alpaca.initialize();
    
    // Check if market is open
    const isMarketOpen = await alpaca.isMarketOpen();
    console.log('Market is open:', isMarketOpen);
    
    // Get latest quotes for all symbols
    const quotes = [];
    
    for (const symbol of symbols) {
      try {
        console.log(`Fetching quote for ${symbol}...`);
        
        // Since market is closed, get latest bar data directly
        let quoteData;
        try {
          console.log(`Fetching daily bar for ${symbol}...`);
          
          // Get latest daily bar data (last trading day)
          const marketData = await alpaca.getMarketData([symbol], '1Day');
          console.log(`Market data response for ${symbol}:`, marketData);
          
          if (marketData && marketData.length > 0) {
            const latestBar = marketData[0];
            quoteData = {
              symbol,
              price: latestBar.close || 0,
              open: latestBar.open || 0,
              high: latestBar.high || 0,
              low: latestBar.low || 0,
              volume: latestBar.volume || 0,
              timestamp: latestBar.timestamp || new Date().toISOString()
            };
            console.log(`Got bar data for ${symbol}:`, quoteData);
            console.log(`Raw latestBar for ${symbol}:`, latestBar);
          } else {
            console.log(`No bar data found for ${symbol}`);
            quoteData = {
              symbol,
              price: 0,
              open: 0,
              high: 0,
              low: 0,
              volume: 0,
              timestamp: new Date().toISOString()
            };
          }
        } catch (barError) {
          console.error(`Failed to get bar data for ${symbol}:`, barError);
          
          // Try real-time quote as fallback (might work even when market closed)
          try {
            console.log(`Trying real-time quote for ${symbol} as fallback...`);
            const latestQuote = await alpaca.getLatestQuote(symbol);
            quoteData = {
              symbol,
              price: (latestQuote.bid + latestQuote.ask) / 2,
              bid: latestQuote.bid,
              ask: latestQuote.ask,
              bidSize: latestQuote.bidSize,
              askSize: latestQuote.askSize,
              timestamp: new Date().toISOString()
            };
            console.log(`Got fallback quote for ${symbol}:`, quoteData.price);
          } catch (quoteError) {
            console.error(`Both bar and quote failed for ${symbol}:`, quoteError);
            quoteData = {
              symbol,
              price: 0,
              open: 0,
              high: 0,
              low: 0,
              volume: 0,
              timestamp: new Date().toISOString()
            };
          }
        }
        
        if (quoteData) {
          // Calculate change from open if we have open price
          let change = 0;
          let changePercent = 0;
          
          if (quoteData.open && quoteData.price) {
            change = quoteData.price - quoteData.open;
            changePercent = (change / quoteData.open) * 100;
          }
          
          quotes.push({
            symbol: quoteData.symbol,
            price: quoteData.price || 0,
            open: quoteData.open || quoteData.price || 0,
            high: quoteData.high || quoteData.price || 0,
            low: quoteData.low || quoteData.price || 0,
            volume: quoteData.volume || 0,
            change: change,
            changePercent: changePercent,
            timestamp: quoteData.timestamp || new Date().toISOString(),
            isMarketOpen: isMarketOpen
          });
        }
      } catch (symbolError: any) {
        console.error(`Failed to get data for ${symbol}:`, symbolError);
        // Add placeholder data so the symbol still shows
        quotes.push({
          symbol,
          price: 0,
          open: 0,
          high: 0,
          low: 0,
          volume: 0,
          change: 0,
          changePercent: 0,
          timestamp: new Date().toISOString(),
          isMarketOpen: isMarketOpen,
          error: symbolError?.message || 'Unknown error'
        });
      }
    }
    
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

