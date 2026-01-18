/**
 * Tests for lib/price-utils.ts
 * 
 * These tests verify the price correction logic that fixes incorrect buy_price
 * values that were stored as total_value instead of per-share price.
 */

import {
  correctBuyPrice,
  calculateTradeValue,
  calculateWeightedAveragePrice,
  calculateProfitLoss,
  formatCurrency,
  parseAmount,
} from '@/lib/price-utils'

describe('correctBuyPrice', () => {
  it('should return original price when values are valid and correct', () => {
    const result = correctBuyPrice({
      buyPrice: 50.00,
      qty: 10,
      totalValue: 500.00,
    })
    
    expect(result.wasCorrect).toBe(true)
    expect(result.correctedPrice).toBe(50.00)
  })
  
  it('should correct price when buy_price equals total_value', () => {
    // Bug scenario: buy_price was stored as 500.00 instead of 50.00
    const result = correctBuyPrice({
      buyPrice: 500.00,
      qty: 10,
      totalValue: 500.00,
      symbol: 'TEST',
    })
    
    expect(result.wasCorrect).toBe(false)
    expect(result.correctedPrice).toBe(50.00) // 500 / 10
    expect(result.correctionReason).toContain('matched total_value')
  })
  
  it('should correct price when buy_price is > 1.5x calculated per-share', () => {
    // buy_price = 100, but total_value/qty = 50
    const result = correctBuyPrice({
      buyPrice: 100.00,
      qty: 10,
      totalValue: 500.00,
      symbol: 'TEST',
    })
    
    expect(result.wasCorrect).toBe(false)
    expect(result.correctedPrice).toBe(50.00)
    expect(result.correctionReason).toContain('>1.5x')
  })
  
  it('should correct price when buy_price is > 10x current price using total_value', () => {
    const result = correctBuyPrice({
      buyPrice: 1000.00,
      qty: 10,
      totalValue: 500.00,
      currentPrice: 50.00,
      symbol: 'TEST',
    })
    
    expect(result.wasCorrect).toBe(false)
    expect(result.correctedPrice).toBe(50.00) // From total_value
  })
  
  it('should estimate price when buy_price is > 10x current price without total_value', () => {
    const result = correctBuyPrice({
      buyPrice: 1000.00,
      qty: 10,
      currentPrice: 50.00,
      symbol: 'TEST',
    })
    
    expect(result.wasCorrect).toBe(false)
    expect(result.correctedPrice).toBeCloseTo(55.00, 2) // currentPrice * 1.1
  })
  
  it('should handle zero or negative values gracefully', () => {
    expect(correctBuyPrice({ buyPrice: 0, qty: 10 }).correctedPrice).toBe(0)
    expect(correctBuyPrice({ buyPrice: -10, qty: 10 }).correctedPrice).toBe(-10)
    expect(correctBuyPrice({ buyPrice: 50, qty: 0 }).correctedPrice).toBe(50)
  })
  
  it('should handle missing values', () => {
    const result = correctBuyPrice({
      buyPrice: 50,
      qty: 10,
    })
    
    expect(result.wasCorrect).toBe(true)
    expect(result.correctedPrice).toBe(50)
  })
})

describe('calculateTradeValue', () => {
  it('should calculate correct value with valid price', () => {
    const result = calculateTradeValue({
      buyPrice: 50.00,
      qty: 10,
      totalValue: 500.00,
    })
    
    expect(result.value).toBe(500.00)
    expect(result.priceUsed).toBe(50.00)
    expect(result.wasCorrect).toBe(true)
  })
  
  it('should calculate value using corrected price', () => {
    const result = calculateTradeValue({
      buyPrice: 500.00, // Incorrect - stored as total
      qty: 10,
      totalValue: 500.00,
    })
    
    expect(result.value).toBe(500.00) // 50 * 10
    expect(result.priceUsed).toBe(50.00) // Corrected price
    expect(result.wasCorrect).toBe(false)
  })
})

describe('calculateWeightedAveragePrice', () => {
  it('should calculate weighted average for single trade', () => {
    const result = calculateWeightedAveragePrice([
      { buy_price: 50.00, qty: 10 }
    ])
    
    expect(result.avgPrice).toBe(50.00)
    expect(result.totalQty).toBe(10)
    expect(result.totalValue).toBe(500.00)
    expect(result.correctionsApplied).toBe(0)
  })
  
  it('should calculate weighted average for multiple trades', () => {
    const result = calculateWeightedAveragePrice([
      { buy_price: 50.00, qty: 10 }, // 500
      { buy_price: 60.00, qty: 10 }, // 600
    ])
    
    expect(result.avgPrice).toBe(55.00) // 1100 / 20
    expect(result.totalQty).toBe(20)
    expect(result.totalValue).toBe(1100.00)
  })
  
  it('should apply corrections when needed', () => {
    const result = calculateWeightedAveragePrice([
      { buy_price: 500.00, qty: 10, total_value: 500.00 }, // Should correct to 50
      { buy_price: 60.00, qty: 10 },
    ])
    
    expect(result.avgPrice).toBe(55.00) // (500 + 600) / 20
    expect(result.correctionsApplied).toBe(1)
  })
  
  it('should handle empty array', () => {
    const result = calculateWeightedAveragePrice([])
    
    expect(result.avgPrice).toBe(0)
    expect(result.totalQty).toBe(0)
    expect(result.totalValue).toBe(0)
  })
  
  it('should skip trades with zero quantity', () => {
    const result = calculateWeightedAveragePrice([
      { buy_price: 50.00, qty: 0 },
      { buy_price: 60.00, qty: 10 },
    ])
    
    expect(result.avgPrice).toBe(60.00)
    expect(result.totalQty).toBe(10)
  })
  
  it('should use price field as fallback when buy_price is missing', () => {
    const result = calculateWeightedAveragePrice([
      { price: 50.00, qty: 10 }
    ])
    
    expect(result.avgPrice).toBe(50.00)
  })
})

describe('calculateProfitLoss', () => {
  it('should calculate profit correctly', () => {
    const result = calculateProfitLoss({
      buyPrice: 50.00,
      sellPrice: 60.00,
      qty: 10,
    })
    
    expect(result.profitLoss).toBe(100.00) // (60-50) * 10
    expect(result.profitLossPercent).toBe(20.00) // 20%
    expect(result.correctedBuyPrice).toBe(50.00)
  })
  
  it('should calculate loss correctly', () => {
    const result = calculateProfitLoss({
      buyPrice: 60.00,
      sellPrice: 50.00,
      qty: 10,
    })
    
    expect(result.profitLoss).toBeCloseTo(-100.00)
    expect(result.profitLossPercent).toBeCloseTo(-16.67, 1)
  })
  
  it('should apply price correction before calculating P&L', () => {
    const result = calculateProfitLoss({
      buyPrice: 500.00, // Incorrect - should be 50
      sellPrice: 60.00,
      qty: 10,
      totalValue: 500.00,
    })
    
    expect(result.correctedBuyPrice).toBe(50.00)
    expect(result.profitLoss).toBe(100.00) // (60-50) * 10
    expect(result.profitLossPercent).toBe(20.00)
  })
  
  it('should handle zero buy price', () => {
    const result = calculateProfitLoss({
      buyPrice: 0,
      sellPrice: 60.00,
      qty: 10,
    })
    
    expect(result.profitLoss).toBe(600.00)
    expect(result.profitLossPercent).toBe(0) // Can't calculate percentage
  })
})

describe('formatCurrency', () => {
  it('should format positive values', () => {
    expect(formatCurrency(1234.56)).toBe('$1,234.56')
  })
  
  it('should format negative values', () => {
    expect(formatCurrency(-1234.56)).toBe('-$1,234.56')
  })
  
  it('should format string values', () => {
    expect(formatCurrency('1234.56')).toBe('$1,234.56')
  })
  
  it('should format zero', () => {
    expect(formatCurrency(0)).toBe('$0.00')
  })
  
  it('should handle small decimals', () => {
    expect(formatCurrency(0.01)).toBe('$0.01')
  })
})

describe('parseAmount', () => {
  it('should parse number values', () => {
    expect(parseAmount(123.45)).toBe(123.45)
  })
  
  it('should parse string values', () => {
    expect(parseAmount('123.45')).toBe(123.45)
  })
  
  it('should return 0 for null', () => {
    expect(parseAmount(null)).toBe(0)
  })
  
  it('should return 0 for undefined', () => {
    expect(parseAmount(undefined)).toBe(0)
  })
  
  it('should return 0 for NaN', () => {
    expect(parseAmount(NaN)).toBe(0)
  })
  
  it('should return 0 for invalid string', () => {
    expect(parseAmount('not a number')).toBe(0)
  })
  
  it('should handle negative values', () => {
    expect(parseAmount(-123.45)).toBe(-123.45)
    expect(parseAmount('-123.45')).toBe(-123.45)
  })
})
