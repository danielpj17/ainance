-- Force assign all NULL account_id trades to the first paper trading account
-- This migration ensures all existing trades are properly assigned

DO $$
DECLARE
  updated_rows INTEGER;
BEGIN
  -- Update all paper trades with NULL account_id
  WITH first_accounts AS (
    SELECT DISTINCT ON (user_id) 
      id, 
      user_id, 
      account_name
    FROM paper_trading_accounts
    ORDER BY user_id, created_at ASC
  )
  UPDATE trade_logs tl
  SET 
    account_id = fa.id,
    account_name = fa.account_name
  FROM first_accounts fa
  WHERE tl.user_id = fa.user_id
    AND tl.account_id IS NULL
    AND tl.account_type = 'paper';
  
  GET DIAGNOSTICS updated_rows = ROW_COUNT;
  RAISE NOTICE 'Updated % trades with account_id', updated_rows;
  
  -- Show current state
  RAISE NOTICE 'Current trade counts:';
  RAISE NOTICE '  Total paper trades: %', (SELECT COUNT(*) FROM trade_logs WHERE account_type = 'paper');
  RAISE NOTICE '  Paper trades with account_id: %', (SELECT COUNT(*) FROM trade_logs WHERE account_type = 'paper' AND account_id IS NOT NULL);
  RAISE NOTICE '  Paper trades without account_id: %', (SELECT COUNT(*) FROM trade_logs WHERE account_type = 'paper' AND account_id IS NULL);
END $$;
```

