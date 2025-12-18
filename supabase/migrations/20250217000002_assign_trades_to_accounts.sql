-- Migration: Assign existing trades to user's first paper trading account
-- This migration assigns all trades with NULL account_id to the user's oldest paper trading account

-- Update trades to assign them to user's first paper trading account
UPDATE trade_logs tl
SET 
  account_id = pta.id,
  account_name = pta.account_name
FROM (
  SELECT DISTINCT ON (user_id) 
    id, user_id, account_name
  FROM paper_trading_accounts
  ORDER BY user_id, created_at ASC
) pta
WHERE tl.user_id = pta.user_id
  AND tl.account_id IS NULL
  AND tl.account_type = 'paper';

-- Log the number of trades updated
DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE 'Assigned % trades to their respective paper trading accounts', updated_count;
END $$;

