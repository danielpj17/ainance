/**
 * Price utilities for correcting and validating trade prices.
 * 
 * This consolidates price correction logic that was previously duplicated in:
 * - app/api/trade-logs/route.ts lines 949-1010 (current positions)
 * - app/api/trade-logs/route.ts lines 1389-1410 (completed trades)
 * 
 * The main issue being solved: buy_price was sometimes stored as total_value
 * instead of per-share price, causing incorrect P&L calculations.
 */

export interface PriceCorrectionParams {
  /** The stored buy price (may be incorrect) */
  buyPrice: number
  /** Quantity of shares */
  qty: number
  /** Total value of the position (if available) */
  totalValue?: number
  /** Current market price (for sanity checking) */
  currentPrice?: number
  /** Symbol for logging purposes */
  symbol?: string
  /** Enable debug logging */
  debug?: boolean
}

export interface PriceCorrectionResult {
  /** The corrected buy price */
  correctedPrice: number
  /** Whether a correction was applied */
  wasCorrect: boolean
  /** Reason for correction (if any) */
  correctionReason?: string
}

/**
 * Corrects a buy price that may have been incorrectly stored as total_value
 * instead of per-share price.
 * 
 * Detection methods:
 * 1. If buy_price matches total_value exactly (within $0.01), it was stored incorrectly
 * 2. If buy_price is >1.5x the calculated per-share price from total_value, it's likely wrong
 * 3. If buy_price is >10x the current market price, it's unreasonably high
 */
export function correctBuyPrice(params: PriceCorrectionParams): PriceCorrectionResult {
  const { buyPrice, qty, totalValue, currentPrice, symbol, debug } = params
  
  // Early return if no valid data
  if (!buyPrice || buyPrice <= 0 || !qty || qty <= 0) {
    return {
      correctedPrice: buyPrice || 0,
      wasCorrect: true
    }
  }
  
  let correctedPrice = buyPrice
  let wasCorrect = true
  let correctionReason: string | undefined
  
  // Method 1: Use total_value to detect incorrect storage
  if (totalValue && totalValue > 0) {
    const calculatedPerShare = totalValue / qty
    
    // Check if buy_price matches total_value exactly (within $0.01)
    // This indicates buy_price was stored as the total instead of per-share
    if (Math.abs(buyPrice - totalValue) < 0.01) {
      correctedPrice = calculatedPerShare
      wasCorrect = false
      correctionReason = `buy_price matched total_value exactly (${buyPrice} ≈ ${totalValue}), corrected to ${calculatedPerShare.toFixed(4)}/share`
    }
    // Check if buy_price is way higher than calculated per-share (more than 1.5x)
    else if (buyPrice > calculatedPerShare * 1.5) {
      correctedPrice = calculatedPerShare
      wasCorrect = false
      correctionReason = `buy_price (${buyPrice}) was >1.5x calculated per-share (${calculatedPerShare.toFixed(4)}), corrected`
    }
  }
  
  // Method 2: Sanity check against current market price
  // If buy_price is more than 10x the current price, it's almost certainly wrong
  if (currentPrice && currentPrice > 0 && correctedPrice > currentPrice * 10) {
    // Try to estimate correct price from total_value first
    if (totalValue && totalValue > 0) {
      const calculatedPerShare = totalValue / qty
      correctedPrice = calculatedPerShare
      wasCorrect = false
      correctionReason = `buy_price (${buyPrice}) was >10x current price (${currentPrice}), corrected to ${calculatedPerShare.toFixed(4)} from total_value`
    } else {
      // Last resort: estimate as slightly above current price (assuming small loss)
      // This is imperfect but better than showing wildly incorrect data
      correctedPrice = currentPrice * 1.1
      wasCorrect = false
      correctionReason = `buy_price (${buyPrice}) was >10x current price (${currentPrice}), estimated at ${correctedPrice.toFixed(4)}`
    }
  }
  
  // Log corrections in development mode
  if (debug && !wasCorrect) {
    console.log(`[PRICE-UTILS] ${symbol || 'Unknown'}: ${correctionReason}`)
  }
  
  return {
    correctedPrice,
    wasCorrect,
    correctionReason
  }
}

/**
 * Calculate the total value of a trade, correcting price if needed
 */
export function calculateTradeValue(params: {
  buyPrice: number
  qty: number
  totalValue?: number
  currentPrice?: number
  symbol?: string
  debug?: boolean
}): { value: number; priceUsed: number; wasCorrect: boolean } {
  const { qty } = params
  const result = correctBuyPrice(params)
  
  return {
    value: result.correctedPrice * qty,
    priceUsed: result.correctedPrice,
    wasCorrect: result.wasCorrect
  }
}

/**
 * Calculate weighted average buy price from multiple trades
 * Applies price correction to each trade before averaging
 */
export function calculateWeightedAveragePrice(
  trades: Array<{
    buy_price?: number
    price?: number
    qty: number | string
    total_value?: number | string
    symbol?: string
  }>,
  currentPriceMap?: Map<string, number>,
  debug?: boolean
): { avgPrice: number; totalQty: number; totalValue: number; correctionsApplied: number } {
  let totalQty = 0
  let totalValue = 0
  let correctionsApplied = 0
  
  for (const trade of trades) {
    const qty = typeof trade.qty === 'string' ? parseFloat(trade.qty) : trade.qty
    const buyPrice = parseFloat(String(trade.buy_price || trade.price || '0'))
    const totalValueNum = trade.total_value 
      ? (typeof trade.total_value === 'string' ? parseFloat(trade.total_value) : trade.total_value)
      : undefined
    const currentPrice = trade.symbol ? currentPriceMap?.get(trade.symbol.toUpperCase()) : undefined
    
    if (qty <= 0) continue
    
    const result = correctBuyPrice({
      buyPrice,
      qty,
      totalValue: totalValueNum,
      currentPrice,
      symbol: trade.symbol,
      debug
    })
    
    if (!result.wasCorrect) {
      correctionsApplied++
    }
    
    totalQty += qty
    totalValue += result.correctedPrice * qty
  }
  
  return {
    avgPrice: totalQty > 0 ? totalValue / totalQty : 0,
    totalQty,
    totalValue,
    correctionsApplied
  }
}

/**
 * Calculate profit/loss with price correction
 */
export function calculateProfitLoss(params: {
  buyPrice: number
  sellPrice: number
  qty: number
  totalValue?: number
  symbol?: string
  debug?: boolean
}): { profitLoss: number; profitLossPercent: number; correctedBuyPrice: number } {
  const { sellPrice, qty } = params
  const { correctedPrice: correctedBuyPrice } = correctBuyPrice(params)
  
  const profitLoss = (sellPrice - correctedBuyPrice) * qty
  const profitLossPercent = correctedBuyPrice > 0 
    ? ((sellPrice - correctedBuyPrice) / correctedBuyPrice) * 100 
    : 0
  
  return {
    profitLoss,
    profitLossPercent,
    correctedBuyPrice
  }
}

/**
 * Format currency value
 */
export function formatCurrency(amount: number | string): string {
  const value = typeof amount === 'string' ? parseFloat(amount) : amount
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value)
}

/**
 * Parse amount safely, returning 0 for invalid values
 */
export function parseAmount(value: number | string | null | undefined): number {
  if (value === null || value === undefined) return 0
  const parsed = typeof value === 'number' ? value : parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}
