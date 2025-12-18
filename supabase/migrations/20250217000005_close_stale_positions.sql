-- Close all stale open positions that shouldn't be open anymore
-- This fixes the issue where old positions weren't properly closed

-- Mark all open positions as closed
UPDATE trade_logs
SET 
  status = 'closed',
  updated_at = NOW()
WHERE status = 'open'
  AND account_type = 'paper'
  AND user_id = '00000000-0000-0000-0000-000000000000';

-- Log the results
DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE 'Closed % stale open positions', updated_count;
END $$;

