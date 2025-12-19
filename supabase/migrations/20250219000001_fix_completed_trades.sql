-- Fix completed trades to only return trades with valid sell data
-- and ensure they're sorted by most recent first

-- Drop ALL existing versions of the function using a DO block
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN 
        SELECT proname, oidvectortypes(proargtypes) as args
        FROM pg_proc 
        INNER JOIN pg_namespace ON pg_proc.pronamespace = pg_namespace.oid
        WHERE proname = 'get_completed_trades_optimized' 
        AND nspname = 'public'
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS public.get_completed_trades_optimized(' || r.args || ') CASCADE';
    END LOOP;
END $$;

-- Recreate with stricter validation
CREATE OR REPLACE FUNCTION get_completed_trades_optimized(
  user_uuid uuid,
  account_type_param text DEFAULT NULL,
  account_uuid uuid DEFAULT NULL
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
  trade_pair_id uuid,
  account_id uuid,
  account_name text,
  user_id uuid
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
    t.trade_pair_id,
    t.account_id,
    t.account_name,
    t.user_id
  FROM trade_logs t
  WHERE t.user_id = user_uuid
    AND t.action = 'buy'
    -- ONLY return trades with VALID sell data (not null and not zero)
    AND t.sell_price IS NOT NULL 
    AND t.sell_price > 0
    AND t.sell_timestamp IS NOT NULL
    -- Exclude Unix epoch timestamp (1969/1970) - indicates invalid data
    AND t.sell_timestamp > '1971-01-01'::timestamptz
    AND t.status = 'closed'
    AND (account_type_param IS NULL OR t.account_type = account_type_param)
    AND (account_uuid IS NULL OR t.account_id = account_uuid)
  ORDER BY t.sell_timestamp DESC; -- Most recent first
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_completed_trades_optimized TO authenticated;
GRANT EXECUTE ON FUNCTION get_completed_trades_optimized TO service_role;

-- Add comment
COMMENT ON FUNCTION get_completed_trades_optimized IS 'Returns completed trades with valid sell data, sorted by most recent first. Filters out trades with missing or invalid sell price/timestamp.';

