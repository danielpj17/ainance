/**
 * Consolidated trading types used across the application.
 * This eliminates duplicate interface definitions in:
 * - app/dashboard/paper/page.tsx
 * - app/dashboard/live/page.tsx
 * - app/api/trade-logs/route.ts
 */

// ============================================================================
// Account Types
// ============================================================================

/**
 * Alpaca brokerage account information
 */
export interface AlpacaAccount {
  id: string
  account_number: string
  status: string
  currency: string
  buying_power: string
  cash: string
  portfolio_value: string
  equity: string
  last_equity: string
  long_market_value: string
  short_market_value: string
  initial_margin: string
  maintenance_margin: string
  daytrade_count: number
  daytrading_buying_power: string
  pattern_day_trader: boolean
}

/**
 * Paper trading account configuration
 */
export interface PaperAccount {
  id: string
  account_name: string
  alpaca_account_number: string | null
  created_at: string
  updated_at?: string
}

// ============================================================================
// Trade Types
// ============================================================================

/**
 * Simple trade record (from trades table)
 */
export interface Trade {
  id: number
  symbol: string
  action: string
  qty: number
  price: number
  trade_timestamp: string
  strategy: string
  account_type: string
  created_at: string
  alpaca_order_id?: string
  order_status?: string
}

/**
 * Full trade log record (from trade_logs table)
 */
export interface TradeLog {
  id: number | string
  symbol: string
  trade_pair_id: string
  action: string
  qty: number
  price: number
  total_value: number
  timestamp: string
  status: 'open' | 'closed'
  buy_timestamp?: string
  buy_price?: number
  buy_decision_metrics?: DecisionMetrics
  sell_timestamp?: string
  sell_price?: number
  sell_decision_metrics?: DecisionMetrics
  profit_loss?: number
  profit_loss_percent?: number
  holding_duration?: string
  strategy: string
  account_type: 'paper' | 'live'
  account_id?: string
  alpaca_order_id?: string
  order_status?: string
  created_at: string
  updated_at: string
  user_id?: string
}

// ============================================================================
// Position Types
// ============================================================================

/**
 * Current open position with live pricing
 */
export interface CurrentPosition {
  id: number | string
  symbol: string
  qty: number
  buy_price: number
  buy_timestamp: string
  current_price: number
  current_value: number
  unrealized_pl: number
  unrealized_pl_percent: number
  holding_duration: string
  buy_decision_metrics?: DecisionMetrics
  strategy: string
  account_type: 'paper' | 'live'
  trade_pair_id?: string
  // Aggregation metadata (when multiple orders combined)
  transaction_ids?: string[]
  transaction_count?: number
}

/**
 * Completed trade with full buy/sell information
 */
export interface CompletedTrade {
  id: number | string
  symbol: string
  qty: number
  buy_price: number
  buy_timestamp: string
  sell_price: number
  sell_timestamp: string
  profit_loss: number
  profit_loss_percent: number
  holding_duration: string
  buy_decision_metrics?: DecisionMetrics
  sell_decision_metrics?: DecisionMetrics
  strategy: string
  account_type: 'paper' | 'live'
  trade_pair_id?: string
  // Aggregation metadata
  transaction_ids?: string[]
  transaction_count?: number
}

// ============================================================================
// Decision Metrics Types
// ============================================================================

/**
 * ML/Rule-based decision metrics attached to trades
 */
export interface DecisionMetrics {
  confidence: number
  adjusted_confidence?: number
  reasoning?: string
  indicators?: TechnicalIndicators
  probabilities?: {
    buy?: number
    sell?: number
    hold?: number
  }
  news_sentiment?: number
  sentiment_boost?: number
  market_risk?: number
  news_headlines?: string[]
}

/**
 * Technical indicators snapshot
 */
export interface TechnicalIndicators {
  rsi?: number
  macd?: number
  macd_histogram?: number
  stochastic?: number
  bb_position?: number
  bb_width?: number
  volume_ratio?: number
  ema_trend?: number
  price_change_1d?: number
  price_change_5d?: number
  price_change_10d?: number
  volatility_20?: number
}

// ============================================================================
// Statistics Types
// ============================================================================

/**
 * Aggregated trading statistics
 */
export interface TradeStatistics {
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
}

/**
 * Portfolio history for charting
 */
export interface PortfolioHistory {
  timestamp: number[]
  equity: number[]
  profit_loss: number[]
  profit_loss_pct: number[]
  base_value: number
  timeframe: string
}

// ============================================================================
// API Request/Response Types
// ============================================================================

/**
 * Trade execution request
 */
export interface TradeExecuteRequest {
  action: 'buy' | 'sell' | 'close'
  symbol: string
  qty: number
  type?: 'market' | 'limit'
  time_in_force?: 'day' | 'gtc' | 'ioc' | 'fok'
  limit_price?: number
  strategy: string
  account_type: 'paper' | 'live'
  account_id?: string
  trade_pair_id?: string
  decision_metrics?: DecisionMetrics
  force_queue?: boolean
}

/**
 * Trade execution response
 */
export interface TradeExecuteResponse {
  success: boolean
  trade?: {
    id: string
    symbol: string
    side: string
    qty: number
    price: number
    status: string
    created_at: string
    trade_log_id?: number
  }
  error?: string
}

/**
 * Trade logs API response
 */
export interface TradeLogsResponse {
  success: boolean
  data?: {
    currentTrades: CurrentPosition[]
    completedTrades: CompletedTrade[]
    statistics?: TradeStatistics
  }
  error?: string
}

// ============================================================================
// Alpaca Position Types (from API)
// ============================================================================

/**
 * Raw Alpaca position data
 */
export interface AlpacaPosition {
  symbol: string
  qty: number
  avg_entry_price: number
  current_price: number
  market_value: number
  unrealized_pl: number
  unrealized_plpc: number
  cost_basis: number
}

// ============================================================================
// Utility Types
// ============================================================================

export type AccountType = 'paper' | 'live'
export type TradeAction = 'buy' | 'sell'
export type TradeStatus = 'open' | 'closed'
export type OrderType = 'market' | 'limit'
export type TimeInForce = 'day' | 'gtc' | 'ioc' | 'fok'
