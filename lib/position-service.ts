/**
 * Position Service - Handles Alpaca/Supabase position reconciliation
 * 
 * This consolidates position fetching logic that was previously scattered across:
 * - app/api/trade-logs/route.ts lines 566-640 (cross-reference with Alpaca)
 * - app/api/trade-logs/route.ts lines 693-901 (position aggregation)
 * - app/api/trade-logs/route.ts lines 1260-1460 (completed trades)
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { createAlpacaClient } from './alpaca-client'
import { calculateWeightedAveragePrice, correctBuyPrice, calculateProfitLoss } from './price-utils'
import type { 
  CurrentPosition, 
  CompletedTrade, 
  AlpacaPosition, 
  AccountType,
  DecisionMetrics 
} from '@/types/trading'

// ============================================================================
// Types
// ============================================================================

export interface PositionServiceParams {
  userId: string
  accountType: AccountType
  accountId?: string
  supabase: SupabaseClient
  apiKey?: string
  secretKey?: string
  isDemo?: boolean
  debug?: boolean
}

export interface AlpacaClientParams {
  apiKey: string
  secretKey: string
  accountType: AccountType
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Group trades by similar price and timestamp
 * Useful for aggregating multiple orders that were part of the same trade
 */
export function groupSimilarTrades(
  trades: any[],
  options: { priceTolerance?: number; timeTolerance?: number } = {}
): any[][] {
  if (trades.length === 0) return []
  
  const { priceTolerance = 0.005, timeTolerance = 10 } = options // 0.5% price, 10 min time
  
  // Sort by timestamp
  const sorted = [...trades].sort((a, b) => 
    new Date(a.timestamp || a.buy_timestamp || 0).getTime() - 
    new Date(b.timestamp || b.buy_timestamp || 0).getTime()
  )
  
  const groups: any[][] = []
  
  for (const trade of sorted) {
    const tradePrice = parseFloat(trade.price || trade.buy_price || '0')
    const tradeTime = new Date(trade.timestamp || trade.buy_timestamp || 0).getTime()
    
    // Find a group where this trade fits
    let foundGroup = false
    for (const group of groups) {
      const groupPrice = parseFloat(group[0].price || group[0].buy_price || '0')
      const groupTime = new Date(group[0].timestamp || group[0].buy_timestamp || 0).getTime()
      
      const priceDiff = groupPrice > 0 ? Math.abs(tradePrice - groupPrice) / groupPrice : 0
      const timeDiff = Math.abs(tradeTime - groupTime) / (1000 * 60) // minutes
      
      if (priceDiff <= priceTolerance && timeDiff <= timeTolerance) {
        group.push(trade)
        foundGroup = true
        break
      }
    }
    
    if (!foundGroup) {
      groups.push([trade])
    }
  }
  
  return groups
}

/**
 * Group completed trades by similar buy/sell price and timestamp
 */
export function groupSimilarCompletedTrades(
  trades: any[],
  options: { priceTolerance?: number; timeTolerance?: number } = {}
): any[][] {
  if (trades.length === 0) return []
  
  const { priceTolerance = 0.005, timeTolerance = 10 } = options
  
  // Sort by sell timestamp
  const sorted = [...trades].sort((a, b) => 
    new Date(a.sell_timestamp || 0).getTime() - new Date(b.sell_timestamp || 0).getTime()
  )
  
  const groups: any[][] = []
  
  for (const trade of sorted) {
    const buyPrice = parseFloat(trade.buy_price || '0')
    const sellPrice = parseFloat(trade.sell_price || '0')
    const buyTime = new Date(trade.buy_timestamp || 0).getTime()
    const sellTime = new Date(trade.sell_timestamp || 0).getTime()
    
    let foundGroup = false
    for (const group of groups) {
      const groupBuyPrice = parseFloat(group[0].buy_price || '0')
      const groupSellPrice = parseFloat(group[0].sell_price || '0')
      const groupBuyTime = new Date(group[0].buy_timestamp || 0).getTime()
      const groupSellTime = new Date(group[0].sell_timestamp || 0).getTime()
      
      const buyPriceDiff = groupBuyPrice > 0 ? Math.abs(buyPrice - groupBuyPrice) / groupBuyPrice : 0
      const sellPriceDiff = groupSellPrice > 0 ? Math.abs(sellPrice - groupSellPrice) / groupSellPrice : 0
      const buyTimeDiff = Math.abs(buyTime - groupBuyTime) / (1000 * 60)
      const sellTimeDiff = Math.abs(sellTime - groupSellTime) / (1000 * 60)
      
      if (buyPriceDiff <= priceTolerance && sellPriceDiff <= priceTolerance && 
          buyTimeDiff <= timeTolerance && sellTimeDiff <= timeTolerance) {
        group.push(trade)
        foundGroup = true
        break
      }
    }
    
    if (!foundGroup) {
      groups.push([trade])
    }
  }
  
  return groups
}

/**
 * Calculate holding duration from a timestamp
 */
export function calculateHoldingDuration(buyTimestamp: string | null): string {
  if (!buyTimestamp) return 'Unknown'
  
  const buyTime = new Date(buyTimestamp).getTime()
  if (isNaN(buyTime)) return 'Unknown'
  
  const now = Date.now()
  const duration = now - buyTime
  const totalSeconds = Math.floor(duration / 1000)
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  
  if (days > 0) {
    return `${days}d ${hours}h`
  }
  return `${hours}h ${minutes}m`
}

/**
 * Calculate holding duration between two timestamps
 */
export function calculateHoldingDurationBetween(buyTimestamp: string, sellTimestamp: string): string {
  const buyTime = new Date(buyTimestamp).getTime()
  const sellTime = new Date(sellTimestamp).getTime()
  
  if (isNaN(buyTime) || isNaN(sellTime)) return '0:0:0'
  
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
}

/**
 * Parse Alpaca position into a standardized format
 */
export function parseAlpacaPosition(pos: any): AlpacaPosition {
  return {
    symbol: (pos.symbol || '').toUpperCase(),
    qty: parseFloat(pos.qty || '0'),
    avg_entry_price: parseFloat(pos.avg_entry_price || pos.avgEntryPrice || '0'),
    current_price: parseFloat(pos.current_price || pos.currentPrice || '0'),
    market_value: parseFloat(pos.market_value || pos.marketValue || '0'),
    unrealized_pl: parseFloat(pos.unrealized_pl || pos.unrealizedPl || '0'),
    unrealized_plpc: parseFloat(pos.unrealized_plpc || pos.unrealizedPlpc || '0') * 100,
    cost_basis: parseFloat(pos.cost_basis || pos.costBasis || '0')
  }
}

// ============================================================================
// Main Functions
// ============================================================================

/**
 * Get current positions by cross-referencing Supabase with Alpaca
 * Alpaca is used as the source of truth for actual positions
 */
export async function getCurrentPositions(params: PositionServiceParams): Promise<CurrentPosition[]> {
  const { userId, accountType, accountId, supabase, apiKey, secretKey, debug } = params
  
  const positions: CurrentPosition[] = []
  
  if (debug) {
    console.log(`[POSITION-SERVICE] Fetching current positions for ${accountType}`)
  }
  
  try {
    // 1. Fetch open trades from Supabase using optimized database function
    const { data: supabaseTrades, error: supabaseError } = await supabase
      .rpc('get_current_trades_optimized', {
        user_uuid: userId,
        account_type_param: accountType,
        account_uuid: accountId || null
      })
    
    if (supabaseError) {
      console.error(`[POSITION-SERVICE] Error fetching trades:`, supabaseError)
      // Continue - we can still show Alpaca positions
    }
    
    // Filter to only truly open trades
    let openTrades = (supabaseTrades || []).filter((t: any) => {
      const tradeUserId = t.user_id || t.userId
      if (tradeUserId && tradeUserId !== userId) return false
      if (t.account_type && t.account_type !== accountType) return false
      return !t.sell_price && !t.sell_timestamp && t.status === 'open'
    })
    
    
    if (debug) {
      console.log(`[POSITION-SERVICE] Found ${openTrades.length} open trades in Supabase`)
    }
    
    // 2. Cross-reference with Alpaca positions (source of truth)
    const alpacaPositionsMap = new Map<string, AlpacaPosition>()
    const ordersBySymbol = new Map<string, any[]>()
    
    if (apiKey && secretKey) {
      try {
        const alpacaClient = createAlpacaClient({
          apiKey,
          secretKey,
          baseUrl: accountType === 'paper' ? 'https://paper-api.alpaca.markets' : 'https://api.alpaca.markets',
          paper: accountType === 'paper'
        })
        await alpacaClient.initialize()
        
        const rawPositions = await alpacaClient.getPositions()
        
        for (const pos of rawPositions) {
          const parsed = parseAlpacaPosition(pos)
          alpacaPositionsMap.set(parsed.symbol, parsed)
        }
        
        if (debug) {
          console.log(`[POSITION-SERVICE] Alpaca has ${alpacaPositionsMap.size} positions:`, Array.from(alpacaPositionsMap.keys()))
        }
        
        // Filter trades to only those that exist in Alpaca
        openTrades = openTrades.filter((t: any) => 
          alpacaPositionsMap.has(t.symbol.toUpperCase())
        )
        
        // Mark closed positions in database (positions no longer in Alpaca)
        // Fetch order history BEFORE closedTrades loop so we can populate sell data
        try {
          const orderHistory = await alpacaClient.getOrderHistory(500)
          const filledOrders = orderHistory.filter((o: any) => o.status === 'filled' && o.filled_at)
          for (const order of filledOrders) {
            const sym = (order.symbol || '').toUpperCase()
            if (!ordersBySymbol.has(sym)) ordersBySymbol.set(sym, [])
            ordersBySymbol.get(sym)!.push(order)
          }
          for (const [, orders] of ordersBySymbol) {
            orders.sort((a: any, b: any) =>
              new Date(a.filled_at).getTime() - new Date(b.filled_at).getTime()
            )
          }
        } catch (err) {
          if (debug) console.warn(`[POSITION-SERVICE] Could not fetch order history for reconciliation:`, err)
        }
        
        const closedTrades = (supabaseTrades || []).filter((t: any) => 
          !alpacaPositionsMap.has(t.symbol.toUpperCase()) && t.status === 'open'
        )
        
        for (const trade of closedTrades) {
          try {
            const symbol = (trade.symbol || '').toUpperCase()
            const buyPrice = parseFloat(trade.buy_price || trade.price || '0')
            const qty = parseFloat(trade.qty || '0')
            const buyTimestamp = trade.buy_timestamp || trade.timestamp || trade.created_at
            
            // Find sell data from Alpaca order history (when cumulative qty went to 0)
            let sellPrice: number | null = null
            let sellTimestamp: string | null = null
            const orders = ordersBySymbol.get(symbol) || []
            if (orders.length > 0) {
              let cumulativeQty = 0
              for (const order of orders) {
                const orderQty = parseFloat(order.qty || order.filled_qty || '0')
                const qtyChange = order.side === 'buy' ? orderQty : -orderQty
                const prevQty = cumulativeQty
                cumulativeQty += qtyChange
                if (prevQty !== 0 && cumulativeQty === 0) {
                  sellPrice = parseFloat(order.filled_avg_price || order.filledAvgPrice || '0')
                  sellTimestamp = order.filled_at || order.created_at
                }
              }
            }
            
            const updateData: Record<string, unknown> = {
              status: 'closed',
              updated_at: new Date().toISOString(),
              sell_decision_metrics: { reasoning: 'Reconciled from Alpaca - position no longer held' }
            }
            
            if (sellPrice != null && sellPrice > 0 && sellTimestamp) {
              const profitLoss = (sellPrice - buyPrice) * qty
              const profitLossPercent = buyPrice > 0 ? ((sellPrice - buyPrice) / buyPrice) * 100 : 0
              const buyTime = new Date(buyTimestamp).getTime()
              const sellTime = new Date(sellTimestamp).getTime()
              const durationMs = sellTime - buyTime
              const totalSeconds = Math.floor(durationMs / 1000)
              const hours = Math.floor(totalSeconds / 3600)
              const minutes = Math.floor((totalSeconds % 3600) / 60)
              const seconds = totalSeconds % 60
              const holdingDuration = `${hours} hours ${minutes} minutes ${seconds} seconds`
              
              Object.assign(updateData, {
                sell_price: sellPrice,
                sell_timestamp: sellTimestamp,
                profit_loss: profitLoss,
                profit_loss_percent: profitLossPercent,
                holding_duration: holdingDuration
              })
            } else if (debug) {
              console.warn(`[POSITION-SERVICE] No sell data in order history for ${trade.symbol} (trade ${trade.id}) - marking closed without sell data`)
            }
            
            await supabase
              .from('trade_logs')
              .update(updateData)
              .eq('id', trade.id)
              .eq('user_id', userId)
            
            if (debug) {
              console.log(`[POSITION-SERVICE] Marked trade ${trade.id} (${trade.symbol}) as closed${sellPrice ? ' with sell data' : ''}`)
            }
          } catch (err) {
            console.error(`[POSITION-SERVICE] Error marking trade ${trade.id} as closed:`, err)
          }
        }
        
        // Fix orphaned closed trades (already status=closed but missing sell data from old code)
        const { data: orphanedTrades } = await supabase
          .from('trade_logs')
          .select('id, symbol, qty, buy_price, price, buy_timestamp, timestamp, created_at, account_id')
          .eq('user_id', userId)
          .eq('account_type', accountType)
          .eq('status', 'closed')
          .eq('action', 'buy')
          .or('sell_price.is.null,sell_timestamp.is.null')
          .limit(50)
        
        const orphanedFiltered = (orphanedTrades || []).filter((t: any) => {
          if (accountType === 'paper' && accountId) {
            return t.account_id === accountId || t.account_id == null
          }
          return true
        })
        
        for (const trade of orphanedFiltered) {
          try {
            const symbol = (trade.symbol || '').toUpperCase()
            const buyPrice = parseFloat(trade.buy_price || trade.price || '0')
            const qty = parseFloat(trade.qty || '0')
            const buyTimestamp = trade.buy_timestamp || trade.timestamp || trade.created_at
            
            let sellPrice: number | null = null
            let sellTimestamp: string | null = null
            const orders = ordersBySymbol.get(symbol) || []
            if (orders.length > 0) {
              let cumulativeQty = 0
              for (const order of orders) {
                const orderQty = parseFloat(order.qty || order.filled_qty || '0')
                const qtyChange = order.side === 'buy' ? orderQty : -orderQty
                const prevQty = cumulativeQty
                cumulativeQty += qtyChange
                if (prevQty !== 0 && cumulativeQty === 0) {
                  sellPrice = parseFloat(order.filled_avg_price || order.filledAvgPrice || '0')
                  sellTimestamp = order.filled_at || order.created_at
                }
              }
            }
            
            if (sellPrice != null && sellPrice > 0 && sellTimestamp) {
              const profitLoss = (sellPrice - buyPrice) * qty
              const profitLossPercent = buyPrice > 0 ? ((sellPrice - buyPrice) / buyPrice) * 100 : 0
              const buyTime = new Date(buyTimestamp).getTime()
              const sellTime = new Date(sellTimestamp).getTime()
              const durationMs = sellTime - buyTime
              const totalSeconds = Math.floor(durationMs / 1000)
              const hours = Math.floor(totalSeconds / 3600)
              const minutes = Math.floor((totalSeconds % 3600) / 60)
              const seconds = totalSeconds % 60
              const holdingDuration = `${hours} hours ${minutes} minutes ${seconds} seconds`
              
              await supabase
                .from('trade_logs')
                .update({
                  sell_price: sellPrice,
                  sell_timestamp: sellTimestamp,
                  profit_loss: profitLoss,
                  profit_loss_percent: profitLossPercent,
                  holding_duration: holdingDuration,
                  sell_decision_metrics: { reasoning: 'Reconciled from Alpaca - orphaned closed trade fixed' },
                  updated_at: new Date().toISOString()
                })
                .eq('id', trade.id)
                .eq('user_id', userId)
              
              if (debug) {
                console.log(`[POSITION-SERVICE] Fixed orphaned trade ${trade.id} (${trade.symbol}) with sell data`)
              }
            }
          } catch (err) {
            console.error(`[POSITION-SERVICE] Error fixing orphaned trade ${trade.id}:`, err)
          }
        }
      } catch (alpacaError) {
        console.error(`[POSITION-SERVICE] Alpaca error:`, alpacaError)
        // Continue with Supabase data only
      }
    }
    
    // 3. Build positions from Alpaca data (if available) or Supabase
    // Reuse order history from step 2 (or fetch if not yet populated)
    const alpacaOrderTimestamps = new Map<string, string>()
    if (apiKey && secretKey) {
      try {
        if (ordersBySymbol.size === 0) {
          const alpacaClient = createAlpacaClient({
            apiKey,
            secretKey,
            baseUrl: accountType === 'paper' ? 'https://paper-api.alpaca.markets' : 'https://api.alpaca.markets',
            paper: accountType === 'paper'
          })
          await alpacaClient.initialize()
          const orderHistory = await alpacaClient.getOrderHistory(500)
          const filledOrders = orderHistory.filter((o: any) => o.status === 'filled' && o.filled_at)
          for (const order of filledOrders) {
            const sym = (order.symbol || '').toUpperCase()
            if (!ordersBySymbol.has(sym)) ordersBySymbol.set(sym, [])
            ordersBySymbol.get(sym)!.push(order)
          }
          for (const [, orders] of ordersBySymbol) {
            orders.sort((a: any, b: any) =>
              new Date(a.filled_at).getTime() - new Date(b.filled_at).getTime()
            )
          }
        }
        
        // For each symbol with a current position, trace through order history
        // to find when the CURRENT position was opened (not an old closed position)
        for (const [symbol, currentPos] of alpacaPositionsMap) {
          const orders = ordersBySymbol.get(symbol) || []
          if (orders.length === 0) continue
          
          // Sort orders by time, oldest first
          orders.sort((a: any, b: any) => 
            new Date(a.filled_at).getTime() - new Date(b.filled_at).getTime()
          )
          
          // Walk through orders chronologically, tracking cumulative position
          // When position crosses zero and starts building in current direction,
          // that's when the current position opened
          let cumulativeQty = 0
          let currentPositionOpenedAt: string | null = null
          const currentQty = currentPos.qty // Positive for long, negative for short
          
          for (const order of orders) {
            const orderQty = parseFloat(order.qty || order.filled_qty || '0')
            const qtyChange = order.side === 'buy' ? orderQty : -orderQty
            
            const prevQty = cumulativeQty
            cumulativeQty += qtyChange
            
            // Check if this order started or continued building the current position
            // Current position is long (qty > 0): look for when qty went from <=0 to >0
            // Current position is short (qty < 0): look for when qty went from >=0 to <0
            if (currentQty > 0) {
              // Long position - find when we went from <=0 to >0
              if (prevQty <= 0 && cumulativeQty > 0) {
                currentPositionOpenedAt = order.filled_at
              }
            } else if (currentQty < 0) {
              // Short position - find when we went from >=0 to <0
              if (prevQty >= 0 && cumulativeQty < 0) {
                currentPositionOpenedAt = order.filled_at
              }
            }
          }
          
          
          if (currentPositionOpenedAt) {
            alpacaOrderTimestamps.set(symbol, currentPositionOpenedAt)
          }
        }
        
      } catch (err) {
        if (debug) console.warn(`[POSITION-SERVICE] Could not fetch Alpaca order history:`, err)
      }
    }
    
    if (alpacaPositionsMap.size > 0) {
      for (const [symbol, alpacaPos] of alpacaPositionsMap) {
        const isShort = alpacaPos.qty < 0
        const tradesForSymbol = openTrades.filter((t: any) => t.symbol.toUpperCase() === symbol)
        
        
        // PRIORITY 1: Use Alpaca order history timestamp (most reliable source of truth)
        let positionTimestamp = alpacaOrderTimestamps.get(symbol) || null
        
        // PRIORITY 2: Find earliest opening trade from filtered open trades
        let earliestOpeningTrade: any = null
        if (!positionTimestamp && tradesForSymbol.length > 0) {
          const openingTrades = tradesForSymbol.filter((t: any) => 
            isShort ? t.action === 'sell' : t.action === 'buy'
          )
          
          if (openingTrades.length > 0) {
            earliestOpeningTrade = openingTrades.sort((a: any, b: any) => {
              const timeA = new Date(a.timestamp || a.buy_timestamp || a.created_at || 0).getTime()
              const timeB = new Date(b.timestamp || b.buy_timestamp || b.created_at || 0).getTime()
              return timeA - timeB
            })[0]
            
            positionTimestamp = earliestOpeningTrade?.timestamp || 
                                earliestOpeningTrade?.buy_timestamp || 
                                earliestOpeningTrade?.created_at || null
          }
        }
        
        // Find most recent trade for decision metrics
        const mostRecentTrade = tradesForSymbol.length > 0 
          ? tradesForSymbol.sort((a: any, b: any) => 
              new Date(b.timestamp || b.buy_timestamp || b.created_at || 0).getTime() - 
              new Date(a.timestamp || a.buy_timestamp || a.created_at || 0).getTime()
            )[0]
          : null
        
        // PRIORITY 3: Query database for earliest trade (use created_at as fallback, not timestamp which has bad data)
        if (!positionTimestamp) {
          try {
            const { data: earliestTradeQuery } = await supabase
              .from('trade_logs')
              .select('timestamp, created_at, action, id')
              .eq('user_id', userId)
              .eq('symbol', symbol)
              .eq('account_type', accountType)
              .eq('action', isShort ? 'sell' : 'buy')
              .order('created_at', { ascending: true }) // Use created_at instead of timestamp
              .limit(1)
            
            const earliest = Array.isArray(earliestTradeQuery) ? earliestTradeQuery[0] : earliestTradeQuery
            
            
            if (earliest) {
              // Prefer created_at over timestamp since timestamp field has corrupted data
              positionTimestamp = earliest.created_at || earliest.timestamp
            }
          } catch (err) {
            if (debug) console.warn(`[POSITION-SERVICE] Could not find earliest trade for ${symbol}`)
          }
        }
        
        // PRIORITY 4: Last resort - use current time (should rarely happen now)
        if (!positionTimestamp) {
          positionTimestamp = new Date().toISOString()
        }
        
        
        const holdingDuration = calculateHoldingDuration(positionTimestamp)
        const absQty = Math.abs(alpacaPos.qty)
        const positionValue = Math.abs(alpacaPos.current_price * absQty)
        
        positions.push({
          id: mostRecentTrade?.id || earliestOpeningTrade?.id || `${symbol}-${Date.now()}`,
          symbol,
          qty: alpacaPos.qty,
          buy_price: alpacaPos.avg_entry_price,
          buy_timestamp: positionTimestamp,
          current_price: alpacaPos.current_price,
          current_value: positionValue,
          unrealized_pl: alpacaPos.unrealized_pl,
          unrealized_pl_percent: alpacaPos.unrealized_plpc,
          holding_duration: holdingDuration,
          buy_decision_metrics: mostRecentTrade?.buy_decision_metrics || earliestOpeningTrade?.buy_decision_metrics || {
            confidence: 0,
            reasoning: 'Position from Alpaca'
          },
          strategy: mostRecentTrade?.strategy || earliestOpeningTrade?.strategy || 'cash',
          account_type: accountType,
          trade_pair_id: mostRecentTrade?.trade_pair_id || earliestOpeningTrade?.trade_pair_id,
          transaction_ids: tradesForSymbol.map((t: any) => t.id?.toString()).filter(Boolean),
          transaction_count: tradesForSymbol.length
        })
        
        if (debug) {
          console.log(`[POSITION-SERVICE] ${symbol}: qty=${alpacaPos.qty}, entry=$${alpacaPos.avg_entry_price}`)
        }
      }
    } else if (openTrades.length > 0) {
      // Fallback: Build from Supabase data only
      const tradesBySymbol = new Map<string, any[]>()
      for (const trade of openTrades) {
        const symbol = trade.symbol.toUpperCase()
        if (!tradesBySymbol.has(symbol)) {
          tradesBySymbol.set(symbol, [])
        }
        tradesBySymbol.get(symbol)!.push(trade)
      }
      
      for (const [symbol, trades] of tradesBySymbol) {
        const tradeGroups = groupSimilarTrades(trades)
        
        for (const group of tradeGroups) {
          const { avgPrice, totalQty, totalValue } = calculateWeightedAveragePrice(group, undefined, debug)
          
          const mostRecentTrade = group.sort((a: any, b: any) => 
            new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime()
          )[0]
          
          const oldestTrade = group.sort((a: any, b: any) => 
            new Date(a.timestamp || a.buy_timestamp || a.created_at || 0).getTime() - 
            new Date(b.timestamp || b.buy_timestamp || b.created_at || 0).getTime()
          )[0]
          
          const buyTimestamp = oldestTrade.buy_timestamp || oldestTrade.timestamp || oldestTrade.created_at
          const holdingDuration = calculateHoldingDuration(buyTimestamp)
          
          // Use buy price as current price if no market data available
          const currentPrice = avgPrice
          const marketValue = totalQty * currentPrice
          
          positions.push({
            id: mostRecentTrade.id,
            symbol,
            qty: totalQty,
            buy_price: avgPrice,
            buy_timestamp: buyTimestamp,
            current_price: currentPrice,
            current_value: marketValue,
            unrealized_pl: 0, // Can't calculate without market price
            unrealized_pl_percent: 0,
            holding_duration: holdingDuration,
            buy_decision_metrics: mostRecentTrade.buy_decision_metrics || { confidence: 0, reasoning: 'Position from Supabase' },
            strategy: mostRecentTrade.strategy || 'cash',
            account_type: accountType,
            trade_pair_id: mostRecentTrade.trade_pair_id,
            transaction_ids: group.map((t: any) => t.id.toString()),
            transaction_count: group.length
          })
        }
      }
    }
    
    // Sort by most recent first
    positions.sort((a, b) => 
      new Date(b.buy_timestamp).getTime() - new Date(a.buy_timestamp).getTime()
    )
    
    if (debug) {
      console.log(`[POSITION-SERVICE] Returning ${positions.length} positions for ${accountType}`)
    }
    
    return positions
    
  } catch (error) {
    console.error(`[POSITION-SERVICE] Error getting current positions:`, error)
    return positions
  }
}

/**
 * Get completed trades from Supabase
 */
export async function getCompletedTrades(params: PositionServiceParams): Promise<CompletedTrade[]> {
  const { userId, accountType, accountId, supabase, apiKey, secretKey, debug } = params
  
  const completedTrades: CompletedTrade[] = []
  
  if (debug) {
    console.log(`[POSITION-SERVICE] Fetching completed trades for ${accountType}`)
  }
  
  // Fetch Alpaca order history to correct timestamps
  const alpacaOrdersBySymbol = new Map<string, any[]>()
  if (apiKey && secretKey) {
    try {
      const alpacaClient = createAlpacaClient({
        apiKey,
        secretKey,
        baseUrl: accountType === 'paper' ? 'https://paper-api.alpaca.markets' : 'https://api.alpaca.markets',
        paper: accountType === 'paper'
      })
      await alpacaClient.initialize()
      
      const orderHistory = await alpacaClient.getOrderHistory(500)
      const filledOrders = orderHistory.filter((o: any) => o.status === 'filled' && o.filled_at)
      
      // Group by symbol for lookup
      for (const order of filledOrders) {
        const sym = (order.symbol || '').toUpperCase()
        if (!alpacaOrdersBySymbol.has(sym)) {
          alpacaOrdersBySymbol.set(sym, [])
        }
        alpacaOrdersBySymbol.get(sym)!.push(order)
      }
      
      // Sort each symbol's orders by time
      for (const [sym, orders] of alpacaOrdersBySymbol) {
        orders.sort((a: any, b: any) => 
          new Date(a.filled_at).getTime() - new Date(b.filled_at).getTime()
        )
      }
      
      // Fix orphaned closed trades (status=closed but missing sell data) before fetching completed
      const { data: orphanedTrades } = await supabase
        .from('trade_logs')
        .select('id, symbol, qty, buy_price, price, buy_timestamp, timestamp, created_at, account_id')
        .eq('user_id', userId)
        .eq('account_type', accountType)
        .eq('status', 'closed')
        .eq('action', 'buy')
        .or('sell_price.is.null,sell_timestamp.is.null')
        .limit(50)
      
      const orphanedFiltered = (orphanedTrades || []).filter((t: any) => {
        if (accountType === 'paper' && accountId) {
          return t.account_id === accountId || t.account_id == null
        }
        return true
      })
      
      for (const trade of orphanedFiltered) {
        try {
          const symbol = (trade.symbol || '').toUpperCase()
          const buyPrice = parseFloat(trade.buy_price || trade.price || '0')
          const qty = parseFloat(trade.qty || '0')
          const buyTimestamp = trade.buy_timestamp || trade.timestamp || trade.created_at
          
          let sellPrice: number | null = null
          let sellTimestamp: string | null = null
          const orders = alpacaOrdersBySymbol.get(symbol) || []
          if (orders.length > 0) {
            let cumulativeQty = 0
            for (const order of orders) {
              const orderQty = parseFloat(order.qty || order.filled_qty || '0')
              const qtyChange = order.side === 'buy' ? orderQty : -orderQty
              const prevQty = cumulativeQty
              cumulativeQty += qtyChange
              if (prevQty !== 0 && cumulativeQty === 0) {
                sellPrice = parseFloat(order.filled_avg_price || order.filledAvgPrice || '0')
                sellTimestamp = order.filled_at
              }
            }
          }
          
          if (sellPrice != null && sellPrice > 0 && sellTimestamp) {
            const profitLoss = (sellPrice - buyPrice) * qty
            const profitLossPercent = buyPrice > 0 ? ((sellPrice - buyPrice) / buyPrice) * 100 : 0
            const buyTime = new Date(buyTimestamp).getTime()
            const sellTime = new Date(sellTimestamp).getTime()
            const durationMs = sellTime - buyTime
            const totalSeconds = Math.floor(durationMs / 1000)
            const hours = Math.floor(totalSeconds / 3600)
            const minutes = Math.floor((totalSeconds % 3600) / 60)
            const seconds = totalSeconds % 60
            const holdingDuration = `${hours} hours ${minutes} minutes ${seconds} seconds`
            
            await supabase
              .from('trade_logs')
              .update({
                sell_price: sellPrice,
                sell_timestamp: sellTimestamp,
                profit_loss: profitLoss,
                profit_loss_percent: profitLossPercent,
                holding_duration: holdingDuration,
                sell_decision_metrics: { reasoning: 'Reconciled from Alpaca - orphaned closed trade fixed' },
                updated_at: new Date().toISOString()
              })
              .eq('id', trade.id)
              .eq('user_id', userId)
            
            if (debug) {
              console.log(`[POSITION-SERVICE] Fixed orphaned trade ${trade.id} (${trade.symbol}) in getCompletedTrades`)
            }
          }
        } catch (err) {
          console.error(`[POSITION-SERVICE] Error fixing orphaned trade ${trade.id}:`, err)
        }
      }
      
    } catch (err) {
      if (debug) console.warn(`[POSITION-SERVICE] Could not fetch Alpaca order history for completed trades:`, err)
    }
  }
  
  try {
    // Use optimized database function
    const { data: trades, error } = await supabase
      .rpc('get_completed_trades_optimized', {
        user_uuid: userId,
        account_type_param: accountType,
        account_uuid: accountId || null
      })
    
    if (error) {
      console.error(`[POSITION-SERVICE] Error fetching completed trades:`, error)
      return completedTrades
    }
    
    if (!trades || trades.length === 0) {
      return completedTrades
    }
    
    // Filter to ensure correct user/account (include legacy trades with null account_id)
    const filteredTrades = trades.filter((t: any) => {
      const tradeUserId = t.user_id || t.userId
      if (tradeUserId && tradeUserId !== userId) return false
      if (t.account_type && t.account_type !== accountType) return false
      if (accountType === 'paper' && accountId && t.account_id != null && t.account_id !== accountId) return false
      return true
    })
    
    
    if (debug) {
      console.log(`[POSITION-SERVICE] Found ${filteredTrades.length} completed trades`)
    }
    
    // Group by symbol first
    const tradesBySymbol = new Map<string, any[]>()
    for (const trade of filteredTrades) {
      const symbol = trade.symbol.toUpperCase()
      if (!tradesBySymbol.has(symbol)) {
        tradesBySymbol.set(symbol, [])
      }
      tradesBySymbol.get(symbol)!.push(trade)
    }
    
    // Aggregate each symbol's trades
    for (const [symbol, symbolTrades] of tradesBySymbol) {
      const tradeGroups = groupSimilarCompletedTrades(symbolTrades)
      
      for (const group of tradeGroups) {
        // Sort by most recent sell
        group.sort((a: any, b: any) => 
          new Date(b.sell_timestamp || 0).getTime() - new Date(a.sell_timestamp || 0).getTime()
        )
        
        const { avgPrice: weightedBuyPrice, totalQty } = calculateWeightedAveragePrice(group, undefined, debug)
        const mostRecent = group[0]
        const sellPrice = parseFloat(mostRecent.sell_price || '0')
        
        // Calculate P&L from actual prices
        const { profitLoss, profitLossPercent } = calculateProfitLoss({
          buyPrice: weightedBuyPrice,
          sellPrice,
          qty: totalQty,
          symbol,
          debug
        })
        
        // Get oldest buy timestamp
        const oldestTrade = group.sort((a: any, b: any) => 
          new Date(a.buy_timestamp || a.timestamp || 0).getTime() - 
          new Date(b.buy_timestamp || b.timestamp || 0).getTime()
        )[0]
        
        // Try to find actual buy/sell timestamps from Alpaca order history
        let correctedBuyTimestamp = oldestTrade.buy_timestamp || oldestTrade.timestamp
        let correctedSellTimestamp = mostRecent.sell_timestamp
        const alpacaOrders = alpacaOrdersBySymbol.get(symbol) || []
        
        if (alpacaOrders.length > 0 && mostRecent.sell_timestamp) {
          const sellTime = new Date(mostRecent.sell_timestamp).getTime()
          
          // Walk through ALL orders chronologically to understand the full history
          let cumulativeQty = 0
          let lastOpenBeforeDbSell: string | null = null
          let lastCloseBeforeDbSell: string | null = null
          
          for (const order of alpacaOrders) {
            const orderTime = new Date(order.filled_at).getTime()
            
            const orderQty = parseFloat(order.qty || order.filled_qty || '0')
            const qtyChange = order.side === 'buy' ? orderQty : -orderQty
            
            const prevQty = cumulativeQty
            cumulativeQty += qtyChange
            
            // Track position openings (from 0 to non-zero)
            if (prevQty === 0 && cumulativeQty !== 0) {
              if (orderTime <= sellTime) {
                lastOpenBeforeDbSell = order.filled_at
              }
            }
            
            // Track position closings (from non-zero to 0)
            if (prevQty !== 0 && cumulativeQty === 0) {
              if (orderTime <= sellTime) {
                lastCloseBeforeDbSell = order.filled_at
              }
            }
          }
          
          // If Alpaca shows position was already closed BEFORE the database's sell timestamp,
          // the database entry is likely a phantom/incorrect record.
          // Use Alpaca's actual timestamps for BOTH buy AND sell.
          if (lastCloseBeforeDbSell && lastOpenBeforeDbSell) {
            const alpacaCloseTime = new Date(lastCloseBeforeDbSell).getTime()
            
            // The database sell is AFTER Alpaca's close - this is a phantom record
            if (alpacaCloseTime < sellTime) {
              correctedBuyTimestamp = lastOpenBeforeDbSell
              correctedSellTimestamp = lastCloseBeforeDbSell // Also correct the sell timestamp!
            }
          } else if (lastOpenBeforeDbSell) {
            correctedBuyTimestamp = lastOpenBeforeDbSell
          }
        }
        
        
        completedTrades.push({
          id: typeof mostRecent.id === 'bigint' ? mostRecent.id.toString() : mostRecent.id,
          symbol,
          qty: totalQty,
          buy_price: weightedBuyPrice,
          buy_timestamp: correctedBuyTimestamp,
          sell_price: sellPrice,
          sell_timestamp: correctedSellTimestamp,
          profit_loss: profitLoss,
          profit_loss_percent: profitLossPercent,
          holding_duration: mostRecent.holding_duration || '0:0:0',
          buy_decision_metrics: mostRecent.buy_decision_metrics || { confidence: 0, reasoning: 'Trade from Supabase' },
          sell_decision_metrics: mostRecent.sell_decision_metrics || { confidence: 0, reasoning: 'Trade from Supabase' },
          strategy: mostRecent.strategy || 'cash',
          account_type: accountType,
          trade_pair_id: mostRecent.trade_pair_id,
          transaction_ids: group.map((t: any) => t.id.toString()),
          transaction_count: group.length
        })
      }
    }
    
    // Sort by most recent sell
    completedTrades.sort((a, b) => 
      new Date(b.sell_timestamp).getTime() - new Date(a.sell_timestamp).getTime()
    )
    
    if (debug) {
      console.log(`[POSITION-SERVICE] Returning ${completedTrades.length} completed trades`)
    }
    
    return completedTrades
    
  } catch (error) {
    console.error(`[POSITION-SERVICE] Error getting completed trades:`, error)
    return completedTrades
  }
}

/**
 * Calculate trading statistics from positions and completed trades
 */
export function calculateStatistics(
  currentPositions: CurrentPosition[],
  completedTrades: CompletedTrade[]
): {
  total_trades: number
  open_trades: number
  closed_trades: number
  winning_trades: number
  losing_trades: number
  total_profit_loss: number
  avg_profit_loss: number
  win_rate: number
  avg_holding_duration: string
  best_trade: number
  worst_trade: number
} {
  const winningTrades = completedTrades.filter(t => t.profit_loss > 0)
  const losingTrades = completedTrades.filter(t => t.profit_loss < 0)
  const totalPl = completedTrades.reduce((sum, t) => sum + (t.profit_loss || 0), 0)
  const avgPl = completedTrades.length > 0 ? totalPl / completedTrades.length : 0
  const winRate = completedTrades.length > 0 ? (winningTrades.length / completedTrades.length) * 100 : 0
  
  const bestTrade = completedTrades.length > 0 ? Math.max(...completedTrades.map(t => t.profit_loss)) : 0
  const worstTrade = completedTrades.length > 0 ? Math.min(...completedTrades.map(t => t.profit_loss)) : 0
  
  return {
    total_trades: completedTrades.length + currentPositions.length,
    open_trades: currentPositions.length,
    closed_trades: completedTrades.length,
    winning_trades: winningTrades.length,
    losing_trades: losingTrades.length,
    total_profit_loss: totalPl,
    avg_profit_loss: avgPl,
    win_rate: winRate,
    avg_holding_duration: completedTrades[0]?.holding_duration || '0:0:0',
    best_trade: bestTrade,
    worst_trade: worstTrade
  }
}
