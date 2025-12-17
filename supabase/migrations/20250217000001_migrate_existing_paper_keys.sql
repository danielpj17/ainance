-- Migrate existing paper trading keys from user_settings to paper_trading_accounts
-- This migration creates a default paper account for users who already have paper keys saved

-- Migration function to create default paper accounts for existing users
create or replace function migrate_existing_paper_keys()
returns void as $$
declare
  user_record record;
  paper_key text;
  paper_secret text;
  account_number text;
begin
  -- Loop through all users who have paper keys in user_settings
  for user_record in 
    select 
      user_id,
      decrypt_api_key(alpaca_paper_key_encrypted) as paper_key,
      decrypt_api_key(alpaca_paper_secret_encrypted) as paper_secret
    from user_settings
    where alpaca_paper_key_encrypted is not null 
      and alpaca_paper_secret_encrypted is not null
  loop
    -- Check if user already has a paper account (skip if they do)
    if not exists (
      select 1 from paper_trading_accounts 
      where user_id = user_record.user_id
    ) then
      -- Create default account for this user
      -- Note: alpaca_account_number will be populated when the user first logs in
      -- and the system validates the keys with Alpaca API
      insert into paper_trading_accounts (
        user_id,
        account_name,
        alpaca_api_key_encrypted,
        alpaca_api_secret_encrypted
      ) values (
        user_record.user_id,
        'Default Paper Account',
        encrypt_api_key(user_record.paper_key),
        encrypt_api_key(user_record.paper_secret)
      );
      
      raise notice 'Migrated paper keys for user: %', user_record.user_id;
    end if;
  end loop;
end;
$$ language plpgsql;

-- Run the migration
select migrate_existing_paper_keys();

-- Drop the migration function (no longer needed after migration)
drop function if exists migrate_existing_paper_keys();

-- Add comment
comment on table paper_trading_accounts is 'Stores multiple paper trading accounts per user. Migrated from user_settings.';

