import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, getDemoUserIdServer } from '@/utils/supabase/server'
import { isDemoMode } from '@/lib/demo-user'

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    let supabase
    try {
      supabase = createServerClient(req, {})
      if (!supabase) {
        throw new Error('Supabase client is null or undefined')
      }
    } catch (supabaseError: any) {
      console.error('❌ Error creating Supabase client:', supabaseError)
      return NextResponse.json({ 
        success: false, 
        error: `Server configuration error: ${supabaseError.message || 'Failed to initialize database connection'}` 
      }, { status: 500 })
    }
    
    // In demo mode, always use demo user ID
    let userId: string
    try {
      if (isDemoMode()) {
        userId = getDemoUserIdServer()
      } else {
        const { data: { user }, error: userError } = await supabase.auth.getUser()
        if (userError || !user) {
          return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
        }
        userId = user.id
      }
    } catch (authError: any) {
      console.error('Error getting user:', authError)
      return NextResponse.json({ 
        success: false, 
        error: `Authentication error: ${authError.message || 'Failed to authenticate'}` 
      }, { status: 401 })
    }

    // Get recent bot logs (last 10 executions)
    let logs: any[] = []
    let logsError: any = null
    try {
      const result = await supabase
        .from('bot_logs')
        .select('*')
        .eq('user_id', userId)
        .in('action', ['execute', 'start', 'error'])
        .order('created_at', { ascending: false })
        .limit(10)
      
      logs = result.data || []
      logsError = result.error
    } catch (queryError: any) {
      console.error('Error querying bot_logs:', queryError)
      logsError = queryError
    }

    if (logsError) {
      console.error('Error fetching bot logs:', logsError)
      // Don't fail completely - return empty diagnostics if logs can't be fetched
      // This allows the endpoint to still return bot state
      console.warn('⚠️  Continuing without bot logs due to error:', logsError.message)
    }

    // Get bot state
    let botState: any = null
    try {
      const { data: botStateData, error: botStateError } = await supabase.rpc('get_bot_state', {
        user_uuid: userId
      })

      if (botStateError) {
        console.error('Error fetching bot state:', botStateError)
      } else {
        botState = botStateData?.[0] || null
      }
    } catch (stateError: any) {
      console.error('Error in get_bot_state RPC:', stateError)
    }

    // Process logs to extract diagnostics
    const diagnostics = logs?.map((log: any) => {
      const diagnosticsData = log.data?.diagnostics || {}
      return {
        timestamp: log.created_at,
        action: log.action,
        message: log.message,
        data: log.data || {}, // Include full data object for filtered_signals
        diagnostics: {
          min_confidence_threshold: diagnosticsData.min_confidence_threshold,
          market_risk: diagnosticsData.market_risk,
          total_ml_signals: diagnosticsData.total_ml_signals,
          buy_signals_before_filter: diagnosticsData.buy_signals_before_filter,
          sell_signals_before_filter: diagnosticsData.sell_signals_before_filter,
          final_buy_signals: diagnosticsData.final_buy_signals,
          final_sell_signals: diagnosticsData.final_sell_signals,
          allocated_buy_signals: diagnosticsData.allocated_buy_signals,
          executed_signals: diagnosticsData.executed_signals,
          market_open: diagnosticsData.market_open,
          in_last_30_minutes: diagnosticsData.in_last_30_minutes,
          filtered_buy_count: diagnosticsData.filtered_buy_count,
          filtered_sell_count: diagnosticsData.filtered_sell_count,
          signals: log.data?.signals || []
        }
      }
    }) || []

    return NextResponse.json({
      success: true,
      diagnostics,
      botState: {
        isRunning: botState?.is_running || false,
        lastRun: botState?.last_run || null,
        error: botState?.error || null,
        config: botState?.config || null
      }
    })

  } catch (error: any) {
    console.error('Error in diagnostics endpoint:', error)
    console.error('Error stack:', error.stack)
    return NextResponse.json({ 
      success: false, 
      error: error.message || 'Failed to get diagnostics' 
    }, { status: 500 })
  }
}
