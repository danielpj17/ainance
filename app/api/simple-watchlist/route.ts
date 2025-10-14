import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export const runtime = 'nodejs';

// GET - Get or create a simple watchlist
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const supabase = createClient();
    const testUserId = '00000000-0000-0000-0000-000000000000';
    
    // Try to get existing watchlist
    const { data: watchlists, error: getError } = await supabase
      .from('user_watchlists')
      .select(`
        id,
        name,
        description,
        is_default,
        created_at,
        updated_at,
        watchlist_symbols (
          id,
          symbol,
          notes,
          sort_order,
          added_at
        )
      `)
      .eq('user_id', testUserId)
      .order('created_at', { ascending: true });
    
    if (getError) {
      console.error('Error fetching watchlists:', getError);
      return NextResponse.json({
        success: false,
        error: getError.message,
        code: getError.code
      }, { status: 500 });
    }
    
    // If no watchlists exist, create a default one
    if (!watchlists || watchlists.length === 0) {
      const { data: newWatchlist, error: createError } = await supabase
        .from('user_watchlists')
        .insert({
          user_id: testUserId,
          name: 'My Watchlist',
          description: 'Default watchlist',
          is_default: true
        })
        .select()
        .single();
      
      if (createError) {
        console.error('Error creating watchlist:', createError);
        return NextResponse.json({
          success: false,
          error: createError.message,
          code: createError.code,
          details: createError.details
        }, { status: 500 });
      }
      
      // Add default symbols
      const { error: symbolsError } = await supabase
        .from('watchlist_symbols')
        .insert([
          {
            watchlist_id: newWatchlist.id,
            symbol: 'AAPL',
            sort_order: 0
          },
          {
            watchlist_id: newWatchlist.id,
            symbol: 'MSFT',
            sort_order: 1
          },
          {
            watchlist_id: newWatchlist.id,
            symbol: 'GOOGL',
            sort_order: 2
          }
        ]);
      
      if (symbolsError) {
        console.error('Error adding default symbols:', symbolsError);
        // Continue anyway - watchlist was created
      }
      
      return NextResponse.json({
        success: true,
        watchlists: [{
          id: newWatchlist.id,
          name: newWatchlist.name,
          description: newWatchlist.description,
          isDefault: newWatchlist.is_default,
          symbols: [
            { symbol: 'AAPL', sortOrder: 0 },
            { symbol: 'MSFT', sortOrder: 1 },
            { symbol: 'GOOGL', sortOrder: 2 }
          ],
          createdAt: newWatchlist.created_at,
          updatedAt: newWatchlist.updated_at
        }]
      });
    }
    
    // Format existing watchlists
    const formattedWatchlists = watchlists.map(wl => ({
      id: wl.id,
      name: wl.name,
      description: wl.description,
      isDefault: wl.is_default,
      symbols: (wl.watchlist_symbols || [])
        .sort((a: any, b: any) => a.sort_order - b.sort_order)
        .map((s: any) => ({
          id: s.id,
          symbol: s.symbol,
          notes: s.notes,
          sortOrder: s.sort_order,
          addedAt: s.added_at
        })),
      createdAt: wl.created_at,
      updatedAt: wl.updated_at
    }));
    
    return NextResponse.json({
      success: true,
      watchlists: formattedWatchlists
    });
    
  } catch (error: any) {
    console.error('Simple watchlist error:', error);
    return NextResponse.json({
      success: false,
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
}

// POST - Add symbol to watchlist
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const supabase = createClient();
    const testUserId = '00000000-0000-0000-0000-000000000000';
    
    const body = await req.json();
    const { watchlistId, symbol } = body;
    
    if (!watchlistId || !symbol) {
      return NextResponse.json({
        success: false,
        error: 'Watchlist ID and symbol are required'
      }, { status: 400 });
    }
    
    // Get current symbol count for sort order
    const { count } = await supabase
      .from('watchlist_symbols')
      .select('*', { count: 'exact', head: true })
      .eq('watchlist_id', watchlistId);
    
    // Add symbol
    const { data: symbolData, error: insertError } = await supabase
      .from('watchlist_symbols')
      .insert({
        watchlist_id: watchlistId,
        symbol: symbol.toUpperCase(),
        sort_order: count || 0
      })
      .select()
      .single();
    
    if (insertError) {
      console.error('Error adding symbol:', insertError);
      return NextResponse.json({
        success: false,
        error: insertError.message,
        code: insertError.code
      }, { status: 500 });
    }
    
    return NextResponse.json({
      success: true,
      symbol: {
        id: symbolData.id,
        symbol: symbolData.symbol,
        sortOrder: symbolData.sort_order,
        addedAt: symbolData.added_at
      }
    });
    
  } catch (error: any) {
    console.error('Add symbol error:', error);
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}
