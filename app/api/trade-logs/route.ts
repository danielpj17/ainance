/**
 * Trade Logs API - Refactored
 * 
 * This route has been slimmed down from 1600+ lines to ~300 lines by:
 * - Moving position reconciliation to lib/position-service.ts
 * - Moving price correction to lib/price-utils.ts
 * - Using shared types from types/trading.ts
 * 
 * Endpoints:
 * - GET: Fetch current positions, completed trades, or statistics
 * - POST: Fix prices or handle legacy buy/sell actions
 */

export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, getUserIdFromRequest, getAlpacaKeysForUser } from '@/utils/supabase/server'
import { createAlpacaClient } from '@/lib/alpaca-client'
import { getCurrentPositions, getCompletedTrades, calculateStatistics } from '@/lib/position-service'
import type { 
  CurrentPosition, 
  CompletedTrade, 
  TradeStatistics,
  TradeLogsResponse,
  AccountType 
} from '@/types/trading'

// ============================================================================
// Cache Management
// ============================================================================

// Cache version - increment when logic changes to invalidate old cached data
const CACHE_VERSION = 2 // Bumped after timestamp correction fix
const cache = new Map<string, { data: any; expires: number; version: number }>()
const CACHE_TTL = 30000 // 30 seconds

// Clean up expired cache entries periodically
setInterval(() => {
  const now = Date.now()
  for (const [key, value] of cache.entries()) {
    if (value.expires < now || value.version !== CACHE_VERSION) {
      cache.delete(key)
    }
  }
}, 60000)

function invalidateUserCache(userId: string) {
  const prefixes = [
    `trade-logs-${userId}-all-paper`,
    `trade-logs-${userId}-all-live`,
    `trade-logs-${userId}-current-paper`,
    `trade-logs-${userId}-current-live`,
    `trade-logs-${userId}-completed-paper`,
    `trade-logs-${userId}-completed-live`
  ]
  for (const key of prefixes) {
    cache.delete(key)
  }
}

function invalidateAllCache() {
  cache.clear()
}

// ============================================================================
// GET Handler
// ============================================================================

export async function GET(req: NextRequest): Promise<NextResponse<TradeLogsResponse>> {
  const debug = process.env.NODE_ENV === 'development'
  
  try {
    const supabase = await createServerClient(req, {})
    const { userId, isDemo } = await getUserIdFromRequest(req)
    
    if (debug) {
      console.log('[TRADE-LOGS] GET request:', { userId, isDemo })
    }
    
    const { searchParams } = new URL(req.url)
    const view = searchParams.get('view') // 'current', 'completed', 'all', 'statistics'
    const accountId = searchParams.get('account_id') || undefined
    const rawAccountType = searchParams.get('account_type')
    const accountTypeParam = rawAccountType === 'paper' || rawAccountType === 'live' ? rawAccountType : undefined
    const accountTypesToFetch: AccountType[] = accountTypeParam ? [accountTypeParam] : ['paper', 'live']
    const forceRefresh = searchParams.get('refresh') === 'true'
    
    // Force refresh clears all cache for this user
    if (forceRefresh) {
      invalidateUserCache(userId)
    }
    
    if (debug) {
      console.log('[TRADE-LOGS] Params:', { view, accountId, accountTypeParam, forceRefresh })
    }
    
    let currentTrades: CurrentPosition[] = []
    let completedTrades: CompletedTrade[] = []
    let statistics: TradeStatistics | null = null
    
    // Fetch current positions
    if (view === 'current' || view === 'all' || !view) {
      for (const accountType of accountTypesToFetch) {
        // Check cache (also verify version to invalidate stale logic)
        const cacheKey = `trade-logs-${userId}-current-${accountType}`
        const cached = cache.get(cacheKey)
        if (cached && cached.expires > Date.now() && cached.version === CACHE_VERSION) {
          currentTrades.push(...(cached.data as CurrentPosition[]))
          continue
        }
        
        // Get Alpaca keys for this account type
        const { apiKey, secretKey } = await getAlpacaKeysForUser(userId, isDemo, accountType, accountId)
        
        const positions = await getCurrentPositions({
          userId,
          accountType,
          accountId,
          supabase,
          apiKey: apiKey ?? undefined,
          secretKey: secretKey ?? undefined,
          isDemo,
          debug
        })
        
        currentTrades.push(...positions)
        
        // Cache results with version
        cache.set(cacheKey, {
          data: positions,
          expires: Date.now() + CACHE_TTL,
          version: CACHE_VERSION
        })
      }
      
      // Sort by most recent
      currentTrades.sort((a, b) => 
        new Date(b.buy_timestamp).getTime() - new Date(a.buy_timestamp).getTime()
      )
    }
    
    // Fetch completed trades
    if (view === 'completed' || view === 'all' || !view) {
      for (const accountType of accountTypesToFetch) {
        // Check cache (also verify version to invalidate stale logic)
        const cacheKey = `trade-logs-${userId}-completed-${accountType}`
        const cached = cache.get(cacheKey)
        if (cached && cached.expires > Date.now() && cached.version === CACHE_VERSION) {
          completedTrades.push(...(cached.data as CompletedTrade[]))
          continue
        }
        
        // Get Alpaca keys for this account type (needed for timestamp correction)
        const { apiKey, secretKey } = await getAlpacaKeysForUser(userId, isDemo, accountType, accountId)
        
        const trades = await getCompletedTrades({
          userId,
          accountType,
          accountId,
          supabase,
          apiKey: apiKey ?? undefined,
          secretKey: secretKey ?? undefined,
          debug
        })
        
        completedTrades.push(...trades)
        
        // Cache results with version
        cache.set(cacheKey, {
          data: trades,
          expires: Date.now() + CACHE_TTL,
          version: CACHE_VERSION
        })
      }
      
      // Sort by most recent sell
      completedTrades.sort((a, b) => 
        new Date(b.sell_timestamp).getTime() - new Date(a.sell_timestamp).getTime()
      )
    }
    
    // Calculate statistics
    if (view === 'statistics' || view === 'all' || !view) {
      statistics = calculateStatistics(currentTrades, completedTrades)
    }
    
    return NextResponse.json({
      success: true,
      data: {
        currentTrades,
        completedTrades,
        statistics: statistics || undefined
      }
    })
    
  } catch (error: any) {
    console.error('[TRADE-LOGS] GET error:', error)
    return NextResponse.json({ 
      success: false, 
      error: error.message || 'Internal server error' 
    }, { status: 500 })
  }
}

// ============================================================================
// POST Handler
// ============================================================================

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createServerClient(req, {})
    const { userId, isDemo } = await getUserIdFromRequest(req)
    
    const body = await req.json().catch(() => ({}))
    const { action, symbol, qty, price, decision_metrics, strategy, account_type, trade_pair_id } = body
    
    // Invalidate cache on any POST
    invalidateUserCache(userId)
    
    // Handle fix-prices action
    if (action === 'fix-prices') {
      return handleFixPrices(supabase, userId, isDemo, symbol)
    }
    
    // Handle legacy buy/sell actions
    // Note: New code should use /api/trade/execute instead
    if (!action || !symbol || !qty || !price || !strategy || !account_type) {
      return NextResponse.json({ 
        success: false, 
        error: 'Missing required fields' 
      }, { status: 400 })
    }
    
    if (action === 'buy') {
      const { data: tradeLog, error: insertError } = await supabase
        .from('trade_logs')
        .insert({
          user_id: userId,
          symbol: symbol.toUpperCase(),
          trade_pair_id: trade_pair_id || undefined,
          action: 'buy',
          qty: parseFloat(qty),
          price: parseFloat(price),
          total_value: parseFloat(qty) * parseFloat(price),
          timestamp: new Date().toISOString(),
          status: 'open',
          buy_timestamp: new Date().toISOString(),
          buy_price: parseFloat(price),
          buy_decision_metrics: decision_metrics,
          strategy,
          account_type
        })
        .select()
        .single()
      
      if (insertError) {
        console.error('[TRADE-LOGS] Error creating trade log:', insertError)
        return NextResponse.json({ 
          success: false, 
          error: 'Failed to create trade log' 
        }, { status: 500 })
      }
      
      return NextResponse.json({ success: true, data: tradeLog })
      
    } else if (action === 'sell') {
      const { error: closeError } = await supabase.rpc('close_trade_position', {
        user_uuid: userId,
        symbol_param: symbol.toUpperCase(),
        sell_qty: parseFloat(qty),
        sell_price_param: parseFloat(price),
        sell_metrics: decision_metrics || {}
      })
      
      if (closeError) {
        console.error('[TRADE-LOGS] Error closing position:', closeError)
        return NextResponse.json({ 
          success: false, 
          error: 'Failed to close trade position' 
        }, { status: 500 })
      }
      
      return NextResponse.json({ success: true, message: 'Trade position closed successfully' })
      
    } else {
      return NextResponse.json({ 
        success: false, 
        error: 'Invalid action. Must be "fix-prices", "buy", or "sell"' 
      }, { status: 400 })
    }
    
  } catch (error: any) {
    console.error('[TRADE-LOGS] POST error:', error)
    return NextResponse.json({ 
      success: false, 
      error: error.message || 'Internal server error' 
    }, { status: 500 })
  }
}

// ============================================================================
// Fix Prices Handler
// ============================================================================

async function handleFixPrices(
  supabase: any, 
  userId: string, 
  isDemo: boolean, 
  symbolFilter?: string
): Promise<NextResponse> {
  const debug = process.env.NODE_ENV === 'development'
  
  if (debug) {
    console.log(`[FIX-PRICES] Starting for user ${userId}, symbol: ${symbolFilter || 'ALL'}`)
  }
  
  // Get API keys
  const { data: apiKeys, error: keysError } = await supabase
    .from('api_keys')
    .select('alpaca_api_key, alpaca_api_secret')
    .eq('user_id', userId)
    .eq('account_type', isDemo ? 'paper' : 'live')
    .single()
  
  if (keysError || !apiKeys) {
    return NextResponse.json({ success: false, error: 'API keys not found' }, { status: 404 })
  }
  
  // Initialize Alpaca client
  const alpacaClient = createAlpacaClient({
    apiKey: apiKeys.alpaca_api_key,
    secretKey: apiKeys.alpaca_api_secret,
    baseUrl: isDemo ? 'https://paper-api.alpaca.markets' : 'https://api.alpaca.markets',
    paper: isDemo
  })
  await alpacaClient.initialize()
  
  // Fetch trades that need fixing
  let query = supabase
    .from('trade_logs')
    .select('id, symbol, alpaca_order_id, buy_price, sell_price, action, status, qty')
    .eq('user_id', userId)
    .not('alpaca_order_id', 'is', null)
  
  if (symbolFilter) {
    query = query.eq('symbol', symbolFilter.toUpperCase())
  }
  
  const { data: trades, error: tradesError } = await query
  
  if (tradesError) {
    console.error('[FIX-PRICES] Error fetching trades:', tradesError)
    return NextResponse.json({ success: false, error: 'Failed to fetch trades' }, { status: 500 })
  }
  
  if (!trades || trades.length === 0) {
    return NextResponse.json({ success: true, message: 'No trades found to fix', fixed: 0 })
  }
  
  let fixedCount = 0
  let errorCount = 0
  const results: any[] = []
  
  for (const trade of trades) {
    if (!trade.alpaca_order_id) continue
    
    try {
      const order = await alpacaClient.getOrder(trade.alpaca_order_id)
      if (!order) {
        errorCount++
        continue
      }
      
      const filledPrice = order.filled_avg_price ? parseFloat(order.filled_avg_price) : null
      if (!filledPrice || filledPrice <= 0) continue
      
      const currentPrice = trade.action === 'buy' ? trade.buy_price : trade.sell_price
      const priceDiff = Math.abs(filledPrice - (currentPrice || 0))
      
      if (priceDiff > 0.01) {
        const updateData: any = { updated_at: new Date().toISOString() }
        
        if (trade.action === 'buy') {
          updateData.buy_price = filledPrice
          updateData.price = filledPrice
          updateData.total_value = trade.qty * filledPrice
        } else {
          updateData.sell_price = filledPrice
          updateData.price = filledPrice
        }
        
        // Recalculate P&L for closed trades
        if (trade.status === 'closed') {
          const { data: tradeData } = await supabase
            .from('trade_logs')
            .select('buy_price, sell_price, qty')
            .eq('id', trade.id)
            .single()
          
          if (tradeData) {
            const buyPrice = trade.action === 'buy' ? filledPrice : tradeData.buy_price
            const sellPrice = trade.action === 'sell' ? filledPrice : tradeData.sell_price
            
            if (buyPrice && sellPrice) {
              updateData.profit_loss = (sellPrice - buyPrice) * tradeData.qty
              updateData.profit_loss_percent = buyPrice > 0 ? ((sellPrice - buyPrice) / buyPrice) * 100 : 0
            }
          }
        }
        
        const { error: updateError } = await supabase
          .from('trade_logs')
          .update(updateData)
          .eq('id', trade.id)
        
        if (updateError) {
          errorCount++
        } else {
          fixedCount++
          results.push({
            trade_id: trade.id,
            symbol: trade.symbol,
            action: trade.action,
            old_price: currentPrice,
            new_price: filledPrice,
            status: 'updated'
          })
        }
      }
      
      // Rate limit protection
      await new Promise(resolve => setTimeout(resolve, 100))
      
    } catch (error) {
      console.error(`[FIX-PRICES] Error processing trade ${trade.id}:`, error)
      errorCount++
    }
  }
  
  return NextResponse.json({
    success: true,
    message: `Fixed ${fixedCount} trades, ${errorCount} errors`,
    fixed: fixedCount,
    errors: errorCount,
    results
  })
}
