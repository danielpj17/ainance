import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, getUserIdFromRequest } from '@/utils/supabase/server'

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerClient(req, {})
    
    // Get user ID from request (checks Authorization header)
    const { userId, isDemo } = await getUserIdFromRequest(req)
    console.log('[CHECK-TRADE] User detected:', { userId, isDemo })

    const { searchParams } = new URL(req.url)
    const symbol = searchParams.get('symbol') || 'SPXS'

    console.log(`🔍 Checking most recent ${symbol} buy trade...`)

    // Query for most recent buy trade from trade_logs
    const { data: tradeLogs, error: tradeLogsError } = await supabase
      .from('trade_logs')
      .select('*')
      .eq('symbol', symbol.toUpperCase())
      .eq('action', 'buy')
      .order('buy_timestamp', { ascending: false })
      .limit(1)

    if (tradeLogsError) {
      console.error('❌ Error querying trade_logs:', tradeLogsError)
      return NextResponse.json({ 
        success: false, 
        error: 'Database error',
        details: tradeLogsError.message 
      }, { status: 500 })
    }

    if (!tradeLogs || tradeLogs.length === 0) {
      // Try legacy trades table
      const { data: legacyTrades, error: legacyError } = await supabase
        .from('trades')
        .select('*')
        .eq('symbol', symbol.toUpperCase())
        .eq('action', 'buy')
        .order('trade_timestamp', { ascending: false })
        .limit(1)

      if (legacyError) {
        return NextResponse.json({ 
          success: false, 
          error: 'Database error',
          details: legacyError.message 
        }, { status: 500 })
      }

      if (!legacyTrades || legacyTrades.length === 0) {
        return NextResponse.json({ 
          success: true,
          found: false,
          message: `No ${symbol} buy trades found`
        })
      }

      const trade = legacyTrades[0]
      return NextResponse.json({
        success: true,
        found: true,
        trade: {
          symbol: trade.symbol,
          action: trade.action,
          qty: trade.qty,
          price: trade.price,
          timestamp: trade.trade_timestamp,
          strategy: trade.strategy,
          account_type: trade.account_type
        },
        isML: null,
        message: 'Legacy trade - no decision metrics available',
        note: 'Cannot determine if ML or rule-based (legacy trades table)'
      })
    }

    const trade = tradeLogs[0]
    const metrics = trade.buy_decision_metrics

    // Determine if ML or rule-based
    const reasoning = metrics?.reasoning || ''
    
    // ML model indicators:
    const mlIndicators = [
      'RSI', 'MACD', 'Bollinger', 'EMA', 'stochastic', 'volume',
      'Overbought', 'Oversold', 'Bullish momentum', 'Bearish momentum',
      'ML buy signal', 'ML sell signal'
    ]
    
    const hasMLIndicators = mlIndicators.some(indicator => 
      reasoning.toLowerCase().includes(indicator.toLowerCase())
    )
    
    let isML: boolean | null = null
    let evidence = ''
    
    if (hasMLIndicators || reasoning.includes('ML')) {
      isML = true
      evidence = `Reasoning contains ML indicators: "${reasoning}"`
    } else if (reasoning.includes('rule') || reasoning.includes('Rule-based')) {
      isML = false
      evidence = `Reasoning suggests rule-based: "${reasoning}"`
    } else {
      isML = null
      evidence = `Cannot definitively determine from reasoning: "${reasoning}". Note: Current system uses ML model.`
    }

    return NextResponse.json({
      success: true,
      found: true,
      trade: {
        symbol: trade.symbol,
        action: trade.action,
        qty: trade.qty,
        price: trade.buy_price,
        timestamp: trade.buy_timestamp,
        status: trade.status,
        strategy: trade.strategy,
        account_type: trade.account_type,
        trade_pair_id: trade.trade_pair_id
      },
      decisionMetrics: metrics ? {
        confidence: metrics.confidence,
        adjusted_confidence: metrics.adjusted_confidence,
        reasoning: metrics.reasoning,
        news_sentiment: metrics.news_sentiment,
        market_risk: metrics.market_risk,
        has_news_headlines: metrics.news_headlines && metrics.news_headlines.length > 0
      } : null,
      isML: isML,
      evidence: evidence,
      confirmed: isML === true ? '✅ CONFIRMED: This trade was made using the ML MODEL' : 
                 isML === false ? '⚠️ This trade appears to be from RULE-BASED algorithm' :
                 '⚠️ Cannot definitively determine (but current system uses ML model)'
    })

  } catch (error: any) {
    console.error('Error checking trade:', error)
    return NextResponse.json({ 
      success: false, 
      error: 'Internal server error',
      details: error.message 
    }, { status: 500 })
  }
}

