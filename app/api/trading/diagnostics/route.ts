import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, getDemoUserIdServer } from '@/utils/supabase/server'
import { isDemoMode } from '@/lib/demo-user'

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createServerClient(req, {})
    
    // In demo mode, always use demo user ID
    let userId: string
    if (isDemoMode()) {
      userId = getDemoUserIdServer()
    } else {
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
      }
      userId = user.id
    }

    // Get recent bot logs (last 10 executions)
    const { data: logs, error: logsError } = await supabase
      .from('bot_logs')
      .select('*')
      .eq('user_id', userId)
      .in('action', ['execute', 'start', 'error'])
      .order('created_at', { ascending: false })
      .limit(10)

    if (logsError) {
      console.error('Error fetching bot logs:', logsError)
      return NextResponse.json({ 
        success: false, 
        error: 'Failed to fetch bot logs' 
      }, { status: 500 })
    }

    // Get bot state
    const { data: botStateData } = await supabase.rpc('get_bot_state', {
      user_uuid: userId
    })

    const botState = botStateData?.[0] || null

    // Process logs to extract diagnostics
    const diagnostics = logs?.map((log: any) => {
      const diagnostics = log.data?.diagnostics || {}
      return {
        timestamp: log.created_at,
        action: log.action,
        message: log.message,
        diagnostics: {
          min_confidence_threshold: diagnostics.min_confidence_threshold,
          market_risk: diagnostics.market_risk,
          total_ml_signals: diagnostics.total_ml_signals,
          buy_signals_before_filter: diagnostics.buy_signals_before_filter,
          sell_signals_before_filter: diagnostics.sell_signals_before_filter,
          final_buy_signals: diagnostics.final_buy_signals,
          final_sell_signals: diagnostics.final_sell_signals,
          allocated_buy_signals: diagnostics.allocated_buy_signals,
          executed_signals: diagnostics.executed_signals,
          market_open: diagnostics.market_open,
          in_last_30_minutes: diagnostics.in_last_30_minutes,
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
    return NextResponse.json({ 
      success: false, 
      error: error.message || 'Failed to get diagnostics' 
    }, { status: 500 })
  }
}

