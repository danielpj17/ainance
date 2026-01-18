/**
 * Tests for lib/position-service.ts
 * 
 * These tests verify the position reconciliation and trade grouping logic.
 */

import {
  groupSimilarTrades,
  groupSimilarCompletedTrades,
  calculateHoldingDuration,
  calculateHoldingDurationBetween,
  parseAlpacaPosition,
  calculateStatistics,
} from '@/lib/position-service'

describe('groupSimilarTrades', () => {
  it('should return empty array for empty input', () => {
    expect(groupSimilarTrades([])).toEqual([])
  })
  
  it('should group single trade as single group', () => {
    const trades = [
      { symbol: 'AAPL', buy_price: 150, qty: 10, timestamp: '2024-01-15T10:00:00Z' }
    ]
    
    const groups = groupSimilarTrades(trades)
    expect(groups.length).toBe(1)
    expect(groups[0].length).toBe(1)
  })
  
  it('should group trades with similar price and close timestamps', () => {
    const trades = [
      { symbol: 'AAPL', buy_price: 150.00, qty: 10, timestamp: '2024-01-15T10:00:00Z' },
      { symbol: 'AAPL', buy_price: 150.50, qty: 5, timestamp: '2024-01-15T10:05:00Z' }, // Within 0.5% and 10 min
    ]
    
    const groups = groupSimilarTrades(trades)
    expect(groups.length).toBe(1)
    expect(groups[0].length).toBe(2)
  })
  
  it('should not group trades with different prices', () => {
    const trades = [
      { symbol: 'AAPL', buy_price: 150.00, qty: 10, timestamp: '2024-01-15T10:00:00Z' },
      { symbol: 'AAPL', buy_price: 160.00, qty: 5, timestamp: '2024-01-15T10:05:00Z' }, // >0.5% diff
    ]
    
    const groups = groupSimilarTrades(trades)
    expect(groups.length).toBe(2)
  })
  
  it('should not group trades with timestamps far apart', () => {
    const trades = [
      { symbol: 'AAPL', buy_price: 150.00, qty: 10, timestamp: '2024-01-15T10:00:00Z' },
      { symbol: 'AAPL', buy_price: 150.00, qty: 5, timestamp: '2024-01-15T10:30:00Z' }, // >10 min apart
    ]
    
    const groups = groupSimilarTrades(trades)
    expect(groups.length).toBe(2)
  })
  
  it('should use custom tolerance values', () => {
    const trades = [
      { symbol: 'AAPL', buy_price: 150.00, qty: 10, timestamp: '2024-01-15T10:00:00Z' },
      { symbol: 'AAPL', buy_price: 153.00, qty: 5, timestamp: '2024-01-15T10:00:00Z' }, // 2% diff
    ]
    
    // Default 0.5% tolerance - should be separate groups
    const defaultGroups = groupSimilarTrades(trades)
    expect(defaultGroups.length).toBe(2)
    
    // Custom 3% tolerance - should be same group
    const customGroups = groupSimilarTrades(trades, { priceTolerance: 0.03 })
    expect(customGroups.length).toBe(1)
  })
  
  it('should handle trades with price field instead of buy_price', () => {
    const trades = [
      { symbol: 'AAPL', price: 150.00, qty: 10, timestamp: '2024-01-15T10:00:00Z' },
      { symbol: 'AAPL', price: 150.50, qty: 5, timestamp: '2024-01-15T10:05:00Z' },
    ]
    
    const groups = groupSimilarTrades(trades)
    expect(groups.length).toBe(1)
  })
})

describe('groupSimilarCompletedTrades', () => {
  it('should return empty array for empty input', () => {
    expect(groupSimilarCompletedTrades([])).toEqual([])
  })
  
  it('should group completed trades with similar buy/sell prices and timestamps', () => {
    const trades = [
      { 
        symbol: 'AAPL', 
        buy_price: 150.00, 
        sell_price: 160.00,
        buy_timestamp: '2024-01-15T10:00:00Z',
        sell_timestamp: '2024-01-15T14:00:00Z'
      },
      { 
        symbol: 'AAPL', 
        buy_price: 150.50, 
        sell_price: 160.50,
        buy_timestamp: '2024-01-15T10:05:00Z',
        sell_timestamp: '2024-01-15T14:05:00Z'
      },
    ]
    
    const groups = groupSimilarCompletedTrades(trades)
    expect(groups.length).toBe(1)
    expect(groups[0].length).toBe(2)
  })
  
  it('should not group trades with different sell prices', () => {
    const trades = [
      { 
        symbol: 'AAPL', 
        buy_price: 150.00, 
        sell_price: 160.00,
        buy_timestamp: '2024-01-15T10:00:00Z',
        sell_timestamp: '2024-01-15T14:00:00Z'
      },
      { 
        symbol: 'AAPL', 
        buy_price: 150.00, 
        sell_price: 170.00, // Different sell price
        buy_timestamp: '2024-01-15T10:00:00Z',
        sell_timestamp: '2024-01-15T14:00:00Z'
      },
    ]
    
    const groups = groupSimilarCompletedTrades(trades)
    expect(groups.length).toBe(2)
  })
})

describe('calculateHoldingDuration', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2024-01-15T15:00:00Z'))
  })
  
  afterEach(() => {
    jest.useRealTimers()
  })
  
  it('should return "Unknown" for null timestamp', () => {
    expect(calculateHoldingDuration(null)).toBe('Unknown')
  })
  
  it('should return "Unknown" for invalid timestamp', () => {
    expect(calculateHoldingDuration('invalid')).toBe('Unknown')
  })
  
  it('should calculate hours and minutes for same-day trades', () => {
    const result = calculateHoldingDuration('2024-01-15T10:00:00Z')
    expect(result).toBe('5h 0m')
  })
  
  it('should calculate days and hours for multi-day trades', () => {
    const result = calculateHoldingDuration('2024-01-13T15:00:00Z')
    expect(result).toBe('2d 0h')
  })
  
  it('should show 0h Xm for very short durations', () => {
    const result = calculateHoldingDuration('2024-01-15T14:30:00Z')
    expect(result).toBe('0h 30m')
  })
})

describe('calculateHoldingDurationBetween', () => {
  it('should calculate duration between two timestamps', () => {
    const result = calculateHoldingDurationBetween(
      '2024-01-15T10:00:00Z',
      '2024-01-15T14:30:00Z'
    )
    expect(result).toBe('04:30:00')
  })
  
  it('should handle multi-day duration', () => {
    const result = calculateHoldingDurationBetween(
      '2024-01-13T10:00:00Z',
      '2024-01-15T14:30:00Z'
    )
    expect(result).toBe('2 days 04:30:00')
  })
  
  it('should return 0:0:0 for invalid buy timestamp', () => {
    const result = calculateHoldingDurationBetween(
      'invalid',
      '2024-01-15T14:30:00Z'
    )
    expect(result).toBe('0:0:0')
  })
  
  it('should return 0:0:0 for invalid sell timestamp', () => {
    const result = calculateHoldingDurationBetween(
      '2024-01-15T10:00:00Z',
      'invalid'
    )
    expect(result).toBe('0:0:0')
  })
})

describe('parseAlpacaPosition', () => {
  it('should parse Alpaca position with snake_case fields', () => {
    const pos = {
      symbol: 'aapl',
      qty: '10',
      avg_entry_price: '150.50',
      current_price: '155.00',
      market_value: '1550.00',
      unrealized_pl: '45.00',
      unrealized_plpc: '0.03',
      cost_basis: '1505.00'
    }
    
    const result = parseAlpacaPosition(pos)
    
    expect(result.symbol).toBe('AAPL')
    expect(result.qty).toBe(10)
    expect(result.avg_entry_price).toBe(150.50)
    expect(result.current_price).toBe(155.00)
    expect(result.market_value).toBe(1550.00)
    expect(result.unrealized_pl).toBe(45.00)
    expect(result.unrealized_plpc).toBe(3) // Converted to percentage
    expect(result.cost_basis).toBe(1505.00)
  })
  
  it('should parse Alpaca position with camelCase fields', () => {
    const pos = {
      symbol: 'AAPL',
      qty: '10',
      avgEntryPrice: '150.50',
      currentPrice: '155.00',
      marketValue: '1550.00',
      unrealizedPl: '45.00',
      unrealizedPlpc: '0.03',
      costBasis: '1505.00'
    }
    
    const result = parseAlpacaPosition(pos)
    
    expect(result.symbol).toBe('AAPL')
    expect(result.avg_entry_price).toBe(150.50)
    expect(result.current_price).toBe(155.00)
  })
  
  it('should handle missing fields with defaults', () => {
    const pos = { symbol: 'AAPL' }
    
    const result = parseAlpacaPosition(pos)
    
    expect(result.symbol).toBe('AAPL')
    expect(result.qty).toBe(0)
    expect(result.avg_entry_price).toBe(0)
  })
  
  it('should uppercase symbol', () => {
    const pos = { symbol: 'aapl', qty: '10' }
    
    const result = parseAlpacaPosition(pos)
    expect(result.symbol).toBe('AAPL')
  })
})

describe('calculateStatistics', () => {
  it('should calculate statistics for empty arrays', () => {
    const stats = calculateStatistics([], [])
    
    expect(stats.total_trades).toBe(0)
    expect(stats.open_trades).toBe(0)
    expect(stats.closed_trades).toBe(0)
    expect(stats.winning_trades).toBe(0)
    expect(stats.losing_trades).toBe(0)
    expect(stats.total_profit_loss).toBe(0)
    expect(stats.avg_profit_loss).toBe(0)
    expect(stats.win_rate).toBe(0)
  })
  
  it('should calculate correct win rate', () => {
    const completedTrades = [
      { profit_loss: 100, holding_duration: '1h' },
      { profit_loss: -50, holding_duration: '2h' },
      { profit_loss: 75, holding_duration: '1h' },
      { profit_loss: 200, holding_duration: '3h' },
    ] as any[]
    
    const stats = calculateStatistics([], completedTrades)
    
    expect(stats.closed_trades).toBe(4)
    expect(stats.winning_trades).toBe(3)
    expect(stats.losing_trades).toBe(1)
    expect(stats.win_rate).toBe(75) // 3/4 = 75%
  })
  
  it('should calculate total profit/loss', () => {
    const completedTrades = [
      { profit_loss: 100, holding_duration: '1h' },
      { profit_loss: -50, holding_duration: '2h' },
      { profit_loss: 75, holding_duration: '1h' },
    ] as any[]
    
    const stats = calculateStatistics([], completedTrades)
    
    expect(stats.total_profit_loss).toBe(125) // 100 - 50 + 75
    expect(stats.avg_profit_loss).toBeCloseTo(41.67, 1) // 125 / 3
  })
  
  it('should calculate best and worst trades', () => {
    const completedTrades = [
      { profit_loss: 100, holding_duration: '1h' },
      { profit_loss: -50, holding_duration: '2h' },
      { profit_loss: 200, holding_duration: '1h' },
      { profit_loss: -100, holding_duration: '3h' },
    ] as any[]
    
    const stats = calculateStatistics([], completedTrades)
    
    expect(stats.best_trade).toBe(200)
    expect(stats.worst_trade).toBe(-100)
  })
  
  it('should count open positions', () => {
    const currentPositions = [
      { symbol: 'AAPL' },
      { symbol: 'GOOGL' },
    ] as any[]
    
    const stats = calculateStatistics(currentPositions, [])
    
    expect(stats.open_trades).toBe(2)
    expect(stats.total_trades).toBe(2)
  })
  
  it('should count both open and closed trades in total', () => {
    const currentPositions = [
      { symbol: 'AAPL' },
    ] as any[]
    
    const completedTrades = [
      { profit_loss: 100, holding_duration: '1h' },
      { profit_loss: 50, holding_duration: '2h' },
    ] as any[]
    
    const stats = calculateStatistics(currentPositions, completedTrades)
    
    expect(stats.open_trades).toBe(1)
    expect(stats.closed_trades).toBe(2)
    expect(stats.total_trades).toBe(3)
  })
})
