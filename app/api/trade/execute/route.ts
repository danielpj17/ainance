/**
 * Unified Trade Execution Endpoint
 * 
 * This endpoint combines trade execution via Alpaca with trade log management
 * in Supabase, eliminating the dual-write pattern that was error-prone.
 * 
 * Actions:
 * - 'buy': Open a new position
 * - 'sell': Close a position (manually)
 * - 'close': Close a position by trade_pair_id
 */

export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, getUserIdFromRequest, getAlpacaKeysForUser } from '@/utils/supabase/server'
import { createAlpacaClient } from '@/lib/alpaca-client'
import crypto from 'crypto'
import type { 
  TradeExecuteRequest, 
  TradeExecuteResponse, 
  DecisionMetrics,
  AccountType 
} from '@/types/trading'

export async function POST(req: NextRequest): Promise<NextResponse<TradeExecuteResponse>> {
  const startTime = Date.now()
  
  try {
    const supabase = await createServerClient(req, {})
    const { userId, isDemo } = await getUserIdFromRequest(req)
    
    const body: TradeExecuteRequest = await req.json()
    const { 
      action, 
      symbol, 
      qty, 
      type = 'market', 
      time_in_force = 'day',
      limit_price,
      strategy, 
      account_type, 
      account_id,
      trade_pair_id,
      decision_metrics 
    } = body
    
    // Validate required fields
    if (!action || !symbol || !qty || !strategy || !account_type) {
      return NextResponse.json({ 
        success: false, 
        error: 'Missing required fields: action, symbol, qty, strategy, account_type' 
      }, { status: 400 })
    }
    
    if (!['buy', 'sell', 'close'].includes(action)) {
      return NextResponse.json({ 
        success: false, 
        error: 'Invalid action. Must be "buy", "sell", or "close"' 
      }, { status: 400 })
    }
    
    console.log(`[TRADE-EXECUTE] ${action.toUpperCase()} ${qty} ${symbol} for ${account_type}`)
    
    // Get Alpaca keys
    const alpacaAccountType: AccountType = account_type === 'live' ? 'live' : 'paper'
    const { apiKey, secretKey, paper: isPaper } = await getAlpacaKeysForUser(
      userId, 
      isDemo, 
      alpacaAccountType, 
      account_id
    )
    
    if (!apiKey || !secretKey) {
      return NextResponse.json({ 
        success: false, 
        error: 'API keys not found. Please configure your Alpaca API keys in Settings.' 
      }, { status: 400 })
    }
    
    // Initialize Alpaca client
    const alpacaClient = createAlpacaClient({
      apiKey,
      secretKey,
      baseUrl: isPaper ? 'https://paper-api.alpaca.markets' : 'https://api.alpaca.markets',
      paper: isPaper
    })
    
    try {
      await alpacaClient.initialize()
    } catch (initError: any) {
      return NextResponse.json({ 
        success: false, 
        error: `Alpaca authentication failed: ${initError.message || 'Invalid API keys'}` 
      }, { status: 401 })
    }
    
    // Determine the actual side for the Alpaca order
    // For closing: need to determine if it's a long (sell to close) or short (buy to close)
    let orderSide: 'buy' | 'sell' = action === 'buy' ? 'buy' : 'sell'
    
    if (action === 'close') {
      // Check if we're closing a short position
      try {
        const positions = await alpacaClient.getPositions()
        const position = positions.find((p: any) => p.symbol.toUpperCase() === symbol.toUpperCase())
        
        if (position) {
          const positionQty = parseFloat((position as any).qty || '0')
          // If position qty is negative, it's a short position - need to buy to close
          orderSide = positionQty < 0 ? 'buy' : 'sell'
        }
      } catch (err: any) {
        console.warn('[TRADE-EXECUTE] Could not determine position side, defaulting to sell')
      }
    }
    
    // Check account status and market before placing order
    let isMarketOpen = false
    try {
      await alpacaClient.getAccount()
      isMarketOpen = await alpacaClient.isMarketOpen()
    } catch (e) {
      console.warn('[TRADE-EXECUTE] Could not get account/market status:', e)
    }
    
    // Check if user wants to force queue the order when market is closed
    const forceQueue = body.force_queue === true
    
    // Warn user if market is closed - unless they explicitly chose to queue
    if (!isMarketOpen && type === 'market' && !forceQueue) {
      return NextResponse.json({ 
        success: false, 
        error: 'MARKET_CLOSED',
        message: 'Market is currently closed. Your order will be queued and executed when the market opens.',
        market_closed: true
      }, { status: 400 })
    }
    
    // Cancel any existing open orders for this symbol before placing a close order
    // This prevents "insufficient qty available" errors when shares are held by pending orders
    if (action === 'close' || action === 'sell') {
      try {
        const openOrders = await alpacaClient.getOpenOrders()
        const symbolOrders = openOrders.filter((o: any) => o.symbol.toUpperCase() === symbol.toUpperCase())
        
        if (symbolOrders.length > 0) {
          console.log(`[TRADE-EXECUTE] Canceling ${symbolOrders.length} existing order(s) for ${symbol}`)
          for (const order of symbolOrders) {
            try {
              await alpacaClient.cancelOrder(order.id)
            } catch (cancelErr: any) {
              console.warn(`[TRADE-EXECUTE] Could not cancel order ${order.id}:`, cancelErr.message)
            }
          }
          // Wait a moment for cancellations to process
          await new Promise(resolve => setTimeout(resolve, 500))
        }
      } catch (err: any) {
        console.warn('[TRADE-EXECUTE] Could not check/cancel existing orders:', err.message)
      }
    }
    
    // Execute the trade via Alpaca
    let orderResult: any
    try {
      if (type === 'market') {
        orderResult = await alpacaClient.placeMarketOrder(
          symbol.toUpperCase(),
          qty,
          orderSide,
          time_in_force
        )
      } else if (type === 'limit' && limit_price) {
        orderResult = await alpacaClient.placeLimitOrder(
          symbol.toUpperCase(),
          qty,
          orderSide,
          limit_price,
          time_in_force
        )
      } else {
        return NextResponse.json({ 
          success: false, 
          error: 'Invalid order type or missing limit price for limit order' 
        }, { status: 400 })
      }
    } catch (error: any) {
      console.error('[TRADE-EXECUTE] Alpaca error:', error)
      return NextResponse.json({ 
        success: false, 
        error: `Trade execution failed: ${error.message || 'Unknown error'}` 
      }, { status: 400 })
    }
    
    // Wait for order to fill and get the actual price
    let filledPrice = parseFloat(orderResult.filled_avg_price || '0')
    if (!filledPrice || filledPrice <= 0) {
      // Try to wait for fill
      const waitedPrice = await alpacaClient.waitForOrderFill(orderResult.id, 5000)
      if (waitedPrice) {
        filledPrice = waitedPrice
      }
    }
    
    const timestamp = orderResult.filled_at || orderResult.created_at || new Date().toISOString()
    const finalPrice = filledPrice || parseFloat(orderResult.limit_price || '0')
    
    console.log(`[TRADE-EXECUTE] Order filled: ${orderSide} ${qty} ${symbol} @ $${finalPrice}`)
    
    // Log to trades table (simple log)
    const { data: tradeRecord, error: tradeError } = await supabase
      .from('trades')
      .insert({
        user_id: userId,
        symbol: orderResult.symbol,
        action: orderSide,
        qty: parseFloat(orderResult.qty || String(qty)),
        price: finalPrice,
        trade_timestamp: timestamp,
        strategy,
        account_type,
        alpaca_order_id: orderResult.id,
        order_status: orderResult.status
      })
      .select()
      .single()
    
    if (tradeError) {
      console.error('[TRADE-EXECUTE] Error logging to trades table:', tradeError)
      // Continue - trade was executed successfully
    }
    
    // Handle trade_logs based on action
    let tradeLogId: number | undefined
    
    if (action === 'buy') {
      // Create new trade log entry for buy
      const newTradePairId = trade_pair_id || crypto.randomUUID()
      
      const { data: tradeLog, error: logError } = await supabase
        .from('trade_logs')
        .insert({
          user_id: userId,
          symbol: symbol.toUpperCase(),
          trade_pair_id: newTradePairId,
          action: 'buy',
          qty,
          price: finalPrice,
          total_value: qty * finalPrice,
          timestamp,
          status: 'open',
          buy_timestamp: timestamp,
          buy_price: finalPrice,
          buy_decision_metrics: decision_metrics || {},
          strategy,
          account_type,
          account_id: account_id || null,
          alpaca_order_id: orderResult.id,
          order_status: orderResult.status
        })
        .select('id')
        .single()
      
      if (logError) {
        console.error('[TRADE-EXECUTE] Error creating trade log:', logError)
      } else {
        tradeLogId = tradeLog?.id
        console.log(`[TRADE-EXECUTE] Created trade log ${tradeLogId} for BUY`)
      }
      
    } else if (action === 'sell' || action === 'close') {
      // Close existing position in trade_logs
      // Use the stored procedure for proper FIFO matching
      const { error: closeError } = await supabase.rpc('close_trade_position', {
        user_uuid: userId,
        symbol_param: symbol.toUpperCase(),
        sell_qty: qty,
        sell_price_param: finalPrice,
        sell_metrics: decision_metrics || {}
      })
      
      if (closeError) {
        console.error('[TRADE-EXECUTE] Error closing trade position:', closeError)
        
        // Fallback: try to update directly if RPC fails
        if (trade_pair_id) {
          const holdingDuration = await calculateHoldingDuration(supabase, trade_pair_id)
          
          const { error: updateError } = await supabase
            .from('trade_logs')
            .update({
              status: 'closed',
              sell_timestamp: timestamp,
              sell_price: finalPrice,
              sell_decision_metrics: decision_metrics || {},
              holding_duration: holdingDuration,
              profit_loss: 0, // Will be calculated by trigger
              profit_loss_percent: 0,
              updated_at: timestamp
            })
            .eq('trade_pair_id', trade_pair_id)
            .eq('user_id', userId)
            .eq('action', 'buy')
          
          if (updateError) {
            console.error('[TRADE-EXECUTE] Fallback update failed:', updateError)
          }
        }
      } else {
        console.log(`[TRADE-EXECUTE] Closed position for ${symbol}`)
      }
    }
    
    const duration = Date.now() - startTime
    console.log(`[TRADE-EXECUTE] Completed in ${duration}ms`)
    
    // Determine if order is queued (accepted but not filled, market closed)
    const isQueued = !isMarketOpen && (orderResult.status === 'accepted' || orderResult.status === 'pending_new')
    
    return NextResponse.json({
      success: true,
      queued: isQueued,
      message: isQueued 
        ? `Order queued. Your ${orderSide} order for ${qty} shares of ${symbol} will execute when the market opens.`
        : `Successfully ${orderSide === 'buy' ? 'bought' : 'sold'} ${qty} shares of ${symbol}`,
      trade: {
        id: orderResult.id,
        symbol: orderResult.symbol,
        side: orderSide,
        qty: parseFloat(orderResult.qty || String(qty)),
        price: finalPrice,
        status: isQueued ? 'queued' : orderResult.status,
        created_at: timestamp,
        trade_log_id: tradeLogId
      }
    })
    
  } catch (error: any) {
    console.error('[TRADE-EXECUTE] Error:', error)
    return NextResponse.json({ 
      success: false, 
      error: error.message || 'Internal server error' 
    }, { status: 500 })
  }
}

/**
 * Calculate holding duration from buy timestamp
 */
async function calculateHoldingDuration(supabase: any, tradePairId: string): Promise<string> {
  try {
    const { data: trade } = await supabase
      .from('trade_logs')
      .select('buy_timestamp')
      .eq('trade_pair_id', tradePairId)
      .eq('action', 'buy')
      .single()
    
    if (!trade?.buy_timestamp) return '0:0:0'
    
    const buyTime = new Date(trade.buy_timestamp).getTime()
    const sellTime = Date.now()
    const duration = sellTime - buyTime
    
    const totalSeconds = Math.floor(duration / 1000)
    const days = Math.floor(totalSeconds / 86400)
    const hours = Math.floor((totalSeconds % 86400) / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60
    
    if (days > 0) {
      return `${days} day${days > 1 ? 's' : ''} ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    }
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  } catch {
    return '0:0:0'
  }
}
