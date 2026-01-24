-- ============================================================================
-- ALLOW ACCOUNT DELETION WITH TRADES
-- Run this SQL in your Supabase SQL Editor
-- Go to: https://supabase.com/dashboard → Your Project → SQL Editor
-- ============================================================================
-- This migration allows deletion of paper trading accounts even when they have
-- associated trades. The trades will remain but their account_id will be set to null.

-- Update delete_paper_account function to allow deletion regardless of trades
create or replace function delete_paper_account(
  account_uuid uuid,
  user_uuid uuid
)
returns jsonb as $$
declare
  trade_count integer;
begin
  -- Verify user owns this account
  if not exists (
    select 1 from paper_trading_accounts 
    where id = account_uuid and user_id = user_uuid
  ) then
    raise exception 'Account not found or access denied';
  end if;
  
  -- Count trades for informational purposes (but don't block deletion)
  select count(*) into trade_count
  from trade_logs
  where account_id = account_uuid;
  
  -- Delete the account (trades will have account_id set to null due to foreign key constraint)
  delete from paper_trading_accounts
  where id = account_uuid and user_id = user_uuid;
  
  -- Return success message with trade count info
  return jsonb_build_object(
    'success', true,
    'message', format('Account deleted successfully. %s trades had their account_id set to null.', trade_count),
    'trade_count', trade_count
  );
end;
$$ language plpgsql security definer;
