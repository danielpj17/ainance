import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

// Simple in-memory watchlist (no database)
let mockWatchlist = {
  id: 1,
  name: 'My Watchlist',
  description: 'Default watchlist',
  isDefault: true,
  symbols: [
    { id: 1, symbol: 'AAPL', sortOrder: 0, addedAt: new Date().toISOString() },
    { id: 2, symbol: 'MSFT', sortOrder: 1, addedAt: new Date().toISOString() },
    { id: 3, symbol: 'GOOGL', sortOrder: 2, addedAt: new Date().toISOString() }
  ],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    return NextResponse.json({
      success: true,
      watchlists: [mockWatchlist]
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const { symbol } = body;
    
    if (!symbol) {
      return NextResponse.json({
        success: false,
        error: 'Symbol is required'
      }, { status: 400 });
    }
    
    // Add symbol to mock watchlist
    const newSymbol = {
      id: Date.now(),
      symbol: symbol.toUpperCase(),
      sortOrder: mockWatchlist.symbols.length,
      addedAt: new Date().toISOString()
    };
    
    mockWatchlist.symbols.push(newSymbol);
    mockWatchlist.updatedAt = new Date().toISOString();
    
    return NextResponse.json({
      success: true,
      symbol: newSymbol
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}
