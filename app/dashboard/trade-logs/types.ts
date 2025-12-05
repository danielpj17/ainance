export interface CurrentTrade {
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
  buy_decision_metrics: any
  strategy: string
  account_type: string
  trade_pair_id: string
  transaction_ids?: string[]
  transaction_count?: number
}

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
  buy_decision_metrics: any
  sell_decision_metrics: any
  strategy: string
  account_type: string
  trade_pair_id: string
  transaction_ids?: string[]
  transaction_count?: number
}

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

