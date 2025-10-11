/**
 * Watchlist Symbols API
 * 
 * Add/remove symbols from watchlists
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/utils/supabase/server';

export const runtime = 'nodejs';

/**
 * POST - Add symbol to watchlist
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createServerClient(req, {});
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    const body = await req.json();
    const { watchlistId, symbol, notes, sortOrder } = body;
    
    if (!watchlistId || !symbol) {
      return NextResponse.json(
        { success: false, error: 'Watchlist ID and symbol are required' },
        { status: 400 }
      );
    }
    
    // Verify watchlist belongs to user
    const { data: watchlist, error: watchlistError } = await supabase
      .from('user_watchlists')
      .select('id')
      .eq('id', watchlistId)
      .eq('user_id', user.id)
      .single();
    
    if (watchlistError || !watchlist) {
      return NextResponse.json(
        { success: false, error: 'Watchlist not found' },
        { status: 404 }
      );
    }
    
    // Add symbol
    const { data: symbolData, error: insertError } = await supabase
      .from('watchlist_symbols')
      .insert({
        watchlist_id: watchlistId,
        symbol: symbol.toUpperCase(),
        notes,
        sort_order: sortOrder || 0
      })
      .select()
      .single();
    
    if (insertError) {
      if (insertError.code === '23505') { // Unique constraint violation
        return NextResponse.json(
          { success: false, error: 'Symbol already in watchlist' },
          { status: 409 }
        );
      }
      
      console.error('Error adding symbol:', insertError);
      return NextResponse.json(
        { success: false, error: 'Failed to add symbol' },
        { status: 500 }
      );
    }
    
    return NextResponse.json({
      success: true,
      symbol: {
        id: symbolData.id,
        symbol: symbolData.symbol,
        notes: symbolData.notes,
        sortOrder: symbolData.sort_order,
        addedAt: symbolData.added_at
      }
    });
    
  } catch (error) {
    console.error('Add symbol error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE - Remove symbol from watchlist
 */
export async function DELETE(req: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createServerClient(req, {});
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    const { searchParams } = new URL(req.url);
    const symbolId = searchParams.get('id');
    const watchlistId = searchParams.get('watchlistId');
    const symbol = searchParams.get('symbol');
    
    if (!symbolId && !(watchlistId && symbol)) {
      return NextResponse.json(
        { success: false, error: 'Symbol ID or (watchlistId + symbol) required' },
        { status: 400 }
      );
    }
    
    // Build delete query
    let query = supabase.from('watchlist_symbols').delete();
    
    if (symbolId) {
      query = query.eq('id', symbolId);
    } else {
      query = query
        .eq('watchlist_id', watchlistId!)
        .eq('symbol', symbol!.toUpperCase());
    }
    
    const { error } = await query;
    
    if (error) {
      console.error('Error removing symbol:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to remove symbol' },
        { status: 500 }
      );
    }
    
    return NextResponse.json({
      success: true,
      message: 'Symbol removed from watchlist'
    });
    
  } catch (error) {
    console.error('Remove symbol error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

