/**
 * Stock Quotes API
 * 
 * Get current quotes for multiple stocks
 */

import { NextRequest, NextResponse } from 'next/server';
import { getUserIdFromRequest, getAlpacaKeysForUser } from '@/utils/supabase/server';
import { createAlpacaClient } from '@/lib/alpaca-client';

export const runtime = 'nodejs';

/**
 * GET - Get quotes for multiple symbols
 * Query params: symbols=AAPL,MSFT,GOOGL
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    // Get user ID from request cookies (strict: demo keys only for demo user)
    const { userId, isDemo } = await getUserIdFromRequest(req)
    
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
    
    // Get Alpaca keys (strict: no demo fallback for authenticated users)
    const { apiKey: alpacaApiKey, secretKey: alpacaSecretKey } = await getAlpacaKeysForUser(userId, isDemo, 'paper')
    
    // Final check to ensure keys are available
    if (!alpacaApiKey || !alpacaSecretKey) {
      return NextResponse.json(
        { success: false, error: 'Alpaca API keys not configured. Please add your API keys in Settings.' },
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

