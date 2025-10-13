/**
 * Watchlists API
 * 
 * Manage user watchlists and symbols
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/utils/supabase/server';

export const runtime = 'nodejs';

/**
 * GET - Get all user watchlists
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
    
    // Get user's watchlists
    const { data: watchlists, error } = await supabase
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
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });
    
    if (error) {
      console.error('Error fetching watchlists:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch watchlists' },
        { status: 500 }
      );
    }
    
    // Format the response
    const formattedWatchlists = watchlists.map(wl => ({
      id: wl.id,
      name: wl.name,
      description: wl.description,
      isDefault: wl.is_default,
      symbols: (wl.watchlist_symbols || [])
        .sort((a: any, b: any) => a.sort_order - b.sort_order || new Date(a.added_at).getTime() - new Date(b.added_at).getTime())
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
    
  } catch (error) {
    console.error('Watchlists API error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST - Create a new watchlist
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
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
    
    const body = await req.json();
    const { name, description, isDefault = false, symbols = [] } = body;
    
    if (!name) {
      return NextResponse.json(
        { success: false, error: 'Watchlist name is required' },
        { status: 400 }
      );
    }
    
    // Create watchlist
    const { data: watchlist, error: createError } = await supabase
      .from('user_watchlists')
      .insert({
        user_id: user.id,
        name,
        description,
        is_default: isDefault
      })
      .select()
      .single();
    
    if (createError) {
      console.error('Error creating watchlist:', createError);
      return NextResponse.json(
        { success: false, error: 'Failed to create watchlist' },
        { status: 500 }
      );
    }
    
    // Add symbols if provided
    if (symbols.length > 0) {
      const symbolRecords = symbols.map((symbol: string, index: number) => ({
        watchlist_id: watchlist.id,
        symbol: symbol.toUpperCase(),
        sort_order: index
      }));
      
      const { error: symbolsError } = await supabase
        .from('watchlist_symbols')
        .insert(symbolRecords);
      
      if (symbolsError) {
        console.error('Error adding symbols:', symbolsError);
        // Rollback watchlist creation
        await supabase.from('user_watchlists').delete().eq('id', watchlist.id);
        return NextResponse.json(
          { success: false, error: 'Failed to add symbols to watchlist' },
          { status: 500 }
        );
      }
    }
    
    return NextResponse.json({
      success: true,
      watchlist: {
        id: watchlist.id,
        name: watchlist.name,
        description: watchlist.description,
        isDefault: watchlist.is_default,
        symbols: symbols.map((s: string, i: number) => ({
          symbol: s.toUpperCase(),
          sortOrder: i
        })),
        createdAt: watchlist.created_at
      }
    });
    
  } catch (error) {
    console.error('Create watchlist error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE - Delete a watchlist
 */
export async function DELETE(req: NextRequest): Promise<NextResponse> {
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
    const watchlistId = searchParams.get('id');
    
    if (!watchlistId) {
      return NextResponse.json(
        { success: false, error: 'Watchlist ID is required' },
        { status: 400 }
      );
    }
    
    // Delete watchlist (cascade will delete symbols)
    const { error } = await supabase
      .from('user_watchlists')
      .delete()
      .eq('id', watchlistId)
      .eq('user_id', user.id);
    
    if (error) {
      console.error('Error deleting watchlist:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to delete watchlist' },
        { status: 500 }
      );
    }
    
    return NextResponse.json({
      success: true,
      message: 'Watchlist deleted successfully'
    });
    
  } catch (error) {
    console.error('Delete watchlist error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

