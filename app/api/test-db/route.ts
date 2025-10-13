import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const testUserId = '00000000-0000-0000-0000-000000000000';
    
    // Test direct insert without foreign key
    const { data: watchlist, error: insertError } = await supabase
      .from('user_watchlists')
      .insert({
        user_id: testUserId,
        name: 'Test Watchlist',
        description: 'Test description',
        is_default: true
      })
      .select()
      .single();
    
    if (insertError) {
      return NextResponse.json({
        success: false,
        error: insertError.message,
        code: insertError.code,
        details: insertError.details,
        hint: insertError.hint
      });
    }
    
    return NextResponse.json({
      success: true,
      message: 'Watchlist created successfully',
      watchlist,
      testUserId
    });
    
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
}
