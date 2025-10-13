/**
 * Stock Search API
 * 
 * Search for stocks by symbol or company name
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/utils/supabase/server';

export const runtime = 'nodejs';

// A curated list of popular stocks with their company names
// In a production app, this would be fetched from a comprehensive stock database or API
const STOCK_DATABASE = [
  // Tech
  { symbol: 'AAPL', name: 'Apple Inc.', exchange: 'NASDAQ' },
  { symbol: 'MSFT', name: 'Microsoft Corporation', exchange: 'NASDAQ' },
  { symbol: 'GOOGL', name: 'Alphabet Inc. Class A', exchange: 'NASDAQ' },
  { symbol: 'GOOG', name: 'Alphabet Inc. Class C', exchange: 'NASDAQ' },
  { symbol: 'AMZN', name: 'Amazon.com Inc.', exchange: 'NASDAQ' },
  { symbol: 'META', name: 'Meta Platforms Inc.', exchange: 'NASDAQ' },
  { symbol: 'TSLA', name: 'Tesla Inc.', exchange: 'NASDAQ' },
  { symbol: 'NVDA', name: 'NVIDIA Corporation', exchange: 'NASDAQ' },
  { symbol: 'NFLX', name: 'Netflix Inc.', exchange: 'NASDAQ' },
  { symbol: 'ADBE', name: 'Adobe Inc.', exchange: 'NASDAQ' },
  { symbol: 'CRM', name: 'Salesforce Inc.', exchange: 'NYSE' },
  { symbol: 'ORCL', name: 'Oracle Corporation', exchange: 'NYSE' },
  { symbol: 'INTC', name: 'Intel Corporation', exchange: 'NASDAQ' },
  { symbol: 'AMD', name: 'Advanced Micro Devices Inc.', exchange: 'NASDAQ' },
  { symbol: 'CSCO', name: 'Cisco Systems Inc.', exchange: 'NASDAQ' },
  { symbol: 'AVGO', name: 'Broadcom Inc.', exchange: 'NASDAQ' },
  { symbol: 'QCOM', name: 'QUALCOMM Inc.', exchange: 'NASDAQ' },
  { symbol: 'TXN', name: 'Texas Instruments Inc.', exchange: 'NASDAQ' },
  { symbol: 'IBM', name: 'International Business Machines Corporation', exchange: 'NYSE' },
  { symbol: 'UBER', name: 'Uber Technologies Inc.', exchange: 'NYSE' },
  { symbol: 'LYFT', name: 'Lyft Inc.', exchange: 'NASDAQ' },
  { symbol: 'SPOT', name: 'Spotify Technology S.A.', exchange: 'NYSE' },
  { symbol: 'SNAP', name: 'Snap Inc.', exchange: 'NYSE' },
  { symbol: 'TWTR', name: 'Twitter Inc.', exchange: 'NYSE' },
  { symbol: 'SQ', name: 'Block Inc.', exchange: 'NYSE' },
  { symbol: 'PYPL', name: 'PayPal Holdings Inc.', exchange: 'NASDAQ' },
  { symbol: 'SHOP', name: 'Shopify Inc.', exchange: 'NYSE' },
  
  // Finance
  { symbol: 'JPM', name: 'JPMorgan Chase & Co.', exchange: 'NYSE' },
  { symbol: 'BAC', name: 'Bank of America Corporation', exchange: 'NYSE' },
  { symbol: 'WFC', name: 'Wells Fargo & Company', exchange: 'NYSE' },
  { symbol: 'GS', name: 'Goldman Sachs Group Inc.', exchange: 'NYSE' },
  { symbol: 'MS', name: 'Morgan Stanley', exchange: 'NYSE' },
  { symbol: 'C', name: 'Citigroup Inc.', exchange: 'NYSE' },
  { symbol: 'AXP', name: 'American Express Company', exchange: 'NYSE' },
  { symbol: 'BLK', name: 'BlackRock Inc.', exchange: 'NYSE' },
  { symbol: 'SCHW', name: 'Charles Schwab Corporation', exchange: 'NYSE' },
  { symbol: 'V', name: 'Visa Inc.', exchange: 'NYSE' },
  { symbol: 'MA', name: 'Mastercard Inc.', exchange: 'NYSE' },
  
  // Healthcare
  { symbol: 'JNJ', name: 'Johnson & Johnson', exchange: 'NYSE' },
  { symbol: 'UNH', name: 'UnitedHealth Group Inc.', exchange: 'NYSE' },
  { symbol: 'PFE', name: 'Pfizer Inc.', exchange: 'NYSE' },
  { symbol: 'ABBV', name: 'AbbVie Inc.', exchange: 'NYSE' },
  { symbol: 'TMO', name: 'Thermo Fisher Scientific Inc.', exchange: 'NYSE' },
  { symbol: 'ABT', name: 'Abbott Laboratories', exchange: 'NYSE' },
  { symbol: 'MRK', name: 'Merck & Co. Inc.', exchange: 'NYSE' },
  { symbol: 'LLY', name: 'Eli Lilly and Company', exchange: 'NYSE' },
  { symbol: 'DHR', name: 'Danaher Corporation', exchange: 'NYSE' },
  { symbol: 'BMY', name: 'Bristol-Myers Squibb Company', exchange: 'NYSE' },
  { symbol: 'AMGN', name: 'Amgen Inc.', exchange: 'NASDAQ' },
  { symbol: 'GILD', name: 'Gilead Sciences Inc.', exchange: 'NASDAQ' },
  { symbol: 'CVS', name: 'CVS Health Corporation', exchange: 'NYSE' },
  { symbol: 'CI', name: 'Cigna Corporation', exchange: 'NYSE' },
  { symbol: 'MRNA', name: 'Moderna Inc.', exchange: 'NASDAQ' },
  
  // Consumer
  { symbol: 'WMT', name: 'Walmart Inc.', exchange: 'NYSE' },
  { symbol: 'HD', name: 'Home Depot Inc.', exchange: 'NYSE' },
  { symbol: 'DIS', name: 'Walt Disney Company', exchange: 'NYSE' },
  { symbol: 'NKE', name: 'Nike Inc.', exchange: 'NYSE' },
  { symbol: 'MCD', name: 'McDonald\'s Corporation', exchange: 'NYSE' },
  { symbol: 'SBUX', name: 'Starbucks Corporation', exchange: 'NASDAQ' },
  { symbol: 'KO', name: 'Coca-Cola Company', exchange: 'NYSE' },
  { symbol: 'PEP', name: 'PepsiCo Inc.', exchange: 'NASDAQ' },
  { symbol: 'COST', name: 'Costco Wholesale Corporation', exchange: 'NASDAQ' },
  { symbol: 'TGT', name: 'Target Corporation', exchange: 'NYSE' },
  { symbol: 'LOW', name: 'Lowe\'s Companies Inc.', exchange: 'NYSE' },
  { symbol: 'LULU', name: 'Lululemon Athletica Inc.', exchange: 'NASDAQ' },
  
  // Energy
  { symbol: 'XOM', name: 'Exxon Mobil Corporation', exchange: 'NYSE' },
  { symbol: 'CVX', name: 'Chevron Corporation', exchange: 'NYSE' },
  { symbol: 'COP', name: 'ConocoPhillips', exchange: 'NYSE' },
  { symbol: 'SLB', name: 'Schlumberger Limited', exchange: 'NYSE' },
  
  // Industrial
  { symbol: 'BA', name: 'Boeing Company', exchange: 'NYSE' },
  { symbol: 'CAT', name: 'Caterpillar Inc.', exchange: 'NYSE' },
  { symbol: 'GE', name: 'General Electric Company', exchange: 'NYSE' },
  { symbol: 'MMM', name: '3M Company', exchange: 'NYSE' },
  { symbol: 'HON', name: 'Honeywell International Inc.', exchange: 'NASDAQ' },
  { symbol: 'UPS', name: 'United Parcel Service Inc.', exchange: 'NYSE' },
  { symbol: 'LMT', name: 'Lockheed Martin Corporation', exchange: 'NYSE' },
  
  // Crypto & ETF
  { symbol: 'COIN', name: 'Coinbase Global Inc.', exchange: 'NASDAQ' },
  { symbol: 'SPY', name: 'SPDR S&P 500 ETF Trust', exchange: 'ARCA' },
  { symbol: 'QQQ', name: 'Invesco QQQ Trust', exchange: 'NASDAQ' },
  { symbol: 'IWM', name: 'iShares Russell 2000 ETF', exchange: 'ARCA' },
  { symbol: 'VTI', name: 'Vanguard Total Stock Market ETF', exchange: 'ARCA' },
  
  // Communication
  { symbol: 'T', name: 'AT&T Inc.', exchange: 'NYSE' },
  { symbol: 'VZ', name: 'Verizon Communications Inc.', exchange: 'NYSE' },
  { symbol: 'TMUS', name: 'T-Mobile US Inc.', exchange: 'NASDAQ' },
  
  // Automotive
  { symbol: 'F', name: 'Ford Motor Company', exchange: 'NYSE' },
  { symbol: 'GM', name: 'General Motors Company', exchange: 'NYSE' },
  { symbol: 'RIVN', name: 'Rivian Automotive Inc.', exchange: 'NASDAQ' },
  { symbol: 'LCID', name: 'Lucid Group Inc.', exchange: 'NASDAQ' },
];

/**
 * GET - Search for stocks by symbol or company name
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
    const query = searchParams.get('q')?.trim().toUpperCase() || '';
    const limit = parseInt(searchParams.get('limit') || '20');
    
    if (!query) {
      return NextResponse.json(
        { success: false, error: 'Search query is required' },
        { status: 400 }
      );
    }
    
    // Search for stocks matching the query
    const results = STOCK_DATABASE.filter(stock => {
      const symbolMatch = stock.symbol.includes(query);
      const nameMatch = stock.name.toUpperCase().includes(query);
      return symbolMatch || nameMatch;
    }).slice(0, limit);
    
    return NextResponse.json({
      success: true,
      results,
      count: results.length
    });
    
  } catch (error) {
    console.error('Stock search error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

