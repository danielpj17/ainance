import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/utils/supabase/server';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerClient();
    
    // Test database connection
    const { data, error } = await supabase
      .from('user_watchlists')
      .select('*')
      .limit(1);
    
    if (error) {
      return NextResponse.json({
        success: false,
        error: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint
      });
    }
    
    return NextResponse.json({
      success: true,
      message: 'Database connection works',
      tableExists: true,
      sampleData: data
    });
    
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerClient();
    
    // Test creating a watchlist
    const testUserId = '00000000-0000-0000-0000-000000000000';
    
    const { data: watchlist, error: createError } = await supabase
      .from('user_watchlists')
      .insert({
        user_id: testUserId,
        name: 'Test Watchlist',
        description: 'Test description',
        is_default: true
      })
      .select()
      .single();
    
    if (createError) {
      return NextResponse.json({
        success: false,
        error: createError.message,
        code: createError.code,
        details: createError.details,
        hint: createError.hint
      });
    }
    
    // Test adding symbols
    const { data: symbols, error: symbolError } = await supabase
      .from('watchlist_symbols')
      .insert([
        {
          watchlist_id: watchlist.id,
          symbol: 'AAPL',
          sort_order: 0
        },
        {
          watchlist_id: watchlist.id,
          symbol: 'MSFT',
          sort_order: 1
        }
      ])
      .select();
    
    if (symbolError) {
      return NextResponse.json({
        success: false,
        symbolError: symbolError.message,
        code: symbolError.code,
        details: symbolError.details,
        hint: symbolError.hint
      });
    }
    
    return NextResponse.json({
      success: true,
      watchlist,
      symbols,
      message: 'Test watchlist created successfully'
    });
    
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
}
