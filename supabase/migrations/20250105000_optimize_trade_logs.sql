-- Optimize trade logs queries with database functions
-- This simplifies the logic and improves performance

-- Function to get completed trades (simplified and optimized)
CREATE OR REPLACE FUNCTION get_completed_trades_optimized(
  user_uuid uuid,
  account_type_param text DEFAULT NULL
)
RETURNS TABLE (
  id bigint,
  symbol text,
  qty numeric,
  buy_price numeric,
  buy_timestamp timestamptz,
  sell_price numeric,
  sell_timestamp timestamptz,
  profit_loss numeric,
  profit_loss_percent numeric,
  holding_duration interval,
  buy_decision_metrics jsonb,
  sell_decision_metrics jsonb,
  strategy text,
  account_type text,
  trade_pair_id uuid
) 
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.id,
    t.symbol,
    t.qty,
    t.buy_price,
    t.buy_timestamp,
    t.sell_price,
    t.sell_timestamp,
    t.profit_loss,
    t.profit_loss_percent,
    t.holding_duration,
    t.buy_decision_metrics,
    t.sell_decision_metrics,
    t.strategy,
    t.account_type,
    t.trade_pair_id
  FROM trade_logs t
  WHERE t.user_id = user_uuid
    AND t.action = 'buy'
    AND (
      (t.sell_price IS NOT NULL AND t.sell_timestamp IS NOT NULL)
      OR t.status = 'closed'
    )
    AND (account_type_param IS NULL OR t.account_type = account_type_param)
  ORDER BY COALESCE(t.sell_timestamp, t.updated_at) DESC;
END;
$$;

-- Function to get current trades (simplified and optimized)
CREATE OR REPLACE FUNCTION get_current_trades_optimized(
  user_uuid uuid,
  account_type_param text DEFAULT NULL
)
RETURNS TABLE (
  id bigint,
  symbol text,
  qty numeric,
  buy_price numeric,
  buy_timestamp timestamptz,
  current_price numeric,
  current_value numeric,
  unrealized_pl numeric,
  unrealized_pl_percent numeric,
  holding_duration interval,
  buy_decision_metrics jsonb,
  strategy text,
  account_type text,
  trade_pair_id uuid,
  status text
) 
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.id,
    t.symbol,
    t.qty,
    t.buy_price,
    t.buy_timestamp,
    t.buy_price as current_price, -- Will be updated by API with real market price
    (t.qty * t.buy_price) as current_value,
    0::numeric as unrealized_pl, -- Will be calculated by API
    0::numeric as unrealized_pl_percent, -- Will be calculated by API
    (NOW() - t.buy_timestamp) as holding_duration,
    t.buy_decision_metrics,
    t.strategy,
    t.account_type,
    t.trade_pair_id,
    t.status
  FROM trade_logs t
  WHERE t.user_id = user_uuid
    AND t.action = 'buy'
    AND t.status = 'open'
    AND t.sell_price IS NULL
    AND t.sell_timestamp IS NULL
    AND (account_type_param IS NULL OR t.account_type = account_type_param)
  ORDER BY t.timestamp DESC;
END;
$$;

-- Add composite index for faster completed trades queries
CREATE INDEX IF NOT EXISTS idx_trade_logs_completed 
ON trade_logs(user_id, action, status) 
WHERE action = 'buy' AND (sell_price IS NOT NULL OR status = 'closed');

-- Add composite index for faster current trades queries
CREATE INDEX IF NOT EXISTS idx_trade_logs_current 
ON trade_logs(user_id, action, status) 
WHERE action = 'buy' AND status = 'open' AND sell_price IS NULL;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_completed_trades_optimized(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_current_trades_optimized(uuid, text) TO authenticated;

