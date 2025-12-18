-- Fix get_current_trades_optimized to include account_id and account_name
-- Drop the old function first to allow signature changes
DROP FUNCTION IF EXISTS get_current_trades_optimized(uuid, text);
DROP FUNCTION IF EXISTS get_current_trades_optimized(uuid, text, uuid);

-- Recreate with proper signature
CREATE OR REPLACE FUNCTION get_current_trades_optimized(
  user_uuid uuid,
  account_type_param text DEFAULT 'paper',
  account_uuid uuid DEFAULT NULL
)
RETURNS TABLE(
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
  account_id uuid,
  account_name text,
  user_id uuid
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    tl.id,
    tl.symbol,
    tl.qty,
    tl.buy_price,
    tl.buy_timestamp,
    COALESCE(tl.buy_price, tl.price) as current_price,
    tl.qty * COALESCE(tl.buy_price, tl.price) as current_value,
    (tl.qty * COALESCE(tl.buy_price, tl.price)) - (tl.qty * tl.buy_price) as unrealized_pl,
    CASE 
      WHEN tl.buy_price > 0 THEN 
        (((tl.qty * COALESCE(tl.buy_price, tl.price)) - (tl.qty * tl.buy_price)) / (tl.qty * tl.buy_price)) * 100
      ELSE 0
    END as unrealized_pl_percent,
    NOW() - tl.buy_timestamp as holding_duration,
    tl.buy_decision_metrics,
    tl.strategy,
    tl.account_type,
    tl.trade_pair_id,
    tl.account_id,
    tl.account_name,
    tl.user_id
  FROM trade_logs tl
  WHERE tl.user_id = user_uuid
    AND tl.status = 'open'
    AND tl.action = 'buy'
    AND tl.account_type = account_type_param
    AND (account_uuid IS NULL OR tl.account_id = account_uuid)
  ORDER BY tl.buy_timestamp DESC;
END;
$$;

