-- Add support for multiple paper trading accounts per user
-- This migration creates a new table for managing multiple paper trading accounts
-- and updates trade_logs to track which account each trade belongs to

-- Ensure pgcrypto extension is available for encryption
create extension if not exists pgcrypto;

-- 1. Create paper_trading_accounts table
create table if not exists paper_trading_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  
  -- User-provided account name
  account_name text not null,
  
  -- Alpaca account information (fetched from Alpaca API)
  alpaca_account_number text,
  
  -- Encrypted API keys
  alpaca_api_key_encrypted bytea,
  alpaca_api_secret_encrypted bytea,
  
  -- Timestamps
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  
  -- Ensure unique account names per user
  constraint unique_user_account_name unique (user_id, account_name)
);

-- Create indexes for performance
create index if not exists idx_paper_accounts_user_id on paper_trading_accounts(user_id);
create index if not exists idx_paper_accounts_account_number on paper_trading_accounts(alpaca_account_number);

-- Enable RLS
alter table paper_trading_accounts enable row level security;

-- RLS Policies for paper_trading_accounts
create policy "Users can view own paper accounts" on paper_trading_accounts
  for select using (auth.uid() = user_id);

create policy "Users can insert own paper accounts" on paper_trading_accounts
  for insert with check (auth.uid() = user_id);

create policy "Users can update own paper accounts" on paper_trading_accounts
  for update using (auth.uid() = user_id);

create policy "Users can delete own paper accounts" on paper_trading_accounts
  for delete using (auth.uid() = user_id);

-- 2. Add account tracking to trade_logs
alter table trade_logs add column if not exists account_id uuid references paper_trading_accounts(id) on delete set null;
alter table trade_logs add column if not exists account_name text;

-- Add indexes for account filtering
create index if not exists idx_trade_logs_account_id on trade_logs(account_id);
create index if not exists idx_trade_logs_user_account_status on trade_logs(user_id, account_id, status);

-- Add comment explaining the account fields
comment on column trade_logs.account_id is 'References the paper trading account used for this trade. NULL for legacy trades or live trading.';
comment on column trade_logs.account_name is 'Stores the account name at time of trade for historical tracking.';

-- 3. Functions for managing paper trading accounts

-- Function to get user's paper trading accounts
create or replace function get_user_paper_accounts(user_uuid uuid)
returns table(
  id uuid,
  account_name text,
  alpaca_account_number text,
  created_at timestamptz,
  updated_at timestamptz
) as $$
begin
  return query
  select 
    pta.id,
    pta.account_name,
    pta.alpaca_account_number,
    pta.created_at,
    pta.updated_at
  from paper_trading_accounts pta
  where pta.user_id = user_uuid
  order by pta.created_at asc;
end;
$$ language plpgsql security definer;

-- Function to encrypt and store paper account keys
create or replace function create_paper_account(
  user_uuid uuid,
  p_account_name text,
  p_alpaca_account_number text,
  p_alpaca_api_key text,
  p_alpaca_api_secret text
)
returns uuid as $$
declare
  new_account_id uuid;
begin
  insert into paper_trading_accounts (
    user_id,
    account_name,
    alpaca_account_number,
    alpaca_api_key_encrypted,
    alpaca_api_secret_encrypted
  ) values (
    user_uuid,
    p_account_name,
    p_alpaca_account_number,
    encrypt_api_key(p_alpaca_api_key),
    encrypt_api_key(p_alpaca_api_secret)
  )
  returning id into new_account_id;
  
  return new_account_id;
end;
$$ language plpgsql security definer;

-- Function to get decrypted paper account keys
create or replace function get_paper_account_keys(account_uuid uuid, user_uuid uuid)
returns table(
  alpaca_api_key text,
  alpaca_api_secret text,
  account_name text,
  alpaca_account_number text
) as $$
begin
  -- Verify user owns this account
  if not exists (
    select 1 from paper_trading_accounts 
    where id = account_uuid and user_id = user_uuid
  ) then
    raise exception 'Account not found or access denied';
  end if;
  
  return query
  select 
    decrypt_api_key(pta.alpaca_api_key_encrypted) as alpaca_api_key,
    decrypt_api_key(pta.alpaca_api_secret_encrypted) as alpaca_api_secret,
    pta.account_name,
    pta.alpaca_account_number
  from paper_trading_accounts pta
  where pta.id = account_uuid and pta.user_id = user_uuid;
end;
$$ language plpgsql security definer;

-- Function to update paper account
create or replace function update_paper_account(
  account_uuid uuid,
  user_uuid uuid,
  p_account_name text default null,
  p_alpaca_account_number text default null,
  p_alpaca_api_key text default null,
  p_alpaca_api_secret text default null
)
returns void as $$
begin
  -- Verify user owns this account
  if not exists (
    select 1 from paper_trading_accounts 
    where id = account_uuid and user_id = user_uuid
  ) then
    raise exception 'Account not found or access denied';
  end if;
  
  update paper_trading_accounts
  set
    account_name = coalesce(p_account_name, account_name),
    alpaca_account_number = coalesce(p_alpaca_account_number, alpaca_account_number),
    alpaca_api_key_encrypted = case 
      when p_alpaca_api_key is not null then encrypt_api_key(p_alpaca_api_key)
      else alpaca_api_key_encrypted
    end,
    alpaca_api_secret_encrypted = case 
      when p_alpaca_api_secret is not null then encrypt_api_key(p_alpaca_api_secret)
      else alpaca_api_secret_encrypted
    end,
    updated_at = now()
  where id = account_uuid and user_id = user_uuid;
end;
$$ language plpgsql security definer;

-- Function to delete paper account (with trade check)
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
  
  -- Check if account has trades
  select count(*) into trade_count
  from trade_logs
  where account_id = account_uuid;
  
  if trade_count > 0 then
    return jsonb_build_object(
      'success', false,
      'trade_count', trade_count,
      'message', format('Cannot delete account with %s existing trades', trade_count)
    );
  end if;
  
  -- Delete the account
  delete from paper_trading_accounts
  where id = account_uuid and user_id = user_uuid;
  
  return jsonb_build_object(
    'success', true,
    'message', 'Account deleted successfully'
  );
end;
$$ language plpgsql security definer;

-- 4. Update existing trade log functions to support account filtering

-- Update get_current_trades_optimized to filter by account_id
create or replace function get_current_trades_optimized(
  user_uuid uuid,
  account_type_param text default 'paper',
  account_uuid uuid default null
)
returns table(
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
) as $$
begin
  return query
  select 
    tl.id,
    tl.symbol,
    tl.qty,
    tl.buy_price,
    tl.buy_timestamp,
    coalesce(tl.buy_price, tl.price) as current_price,
    tl.qty * coalesce(tl.buy_price, tl.price) as current_value,
    (tl.qty * coalesce(tl.buy_price, tl.price)) - (tl.qty * tl.buy_price) as unrealized_pl,
    case 
      when tl.buy_price > 0 then 
        (((tl.qty * coalesce(tl.buy_price, tl.price)) - (tl.qty * tl.buy_price)) / (tl.qty * tl.buy_price)) * 100
      else 0
    end as unrealized_pl_percent,
    now() - tl.buy_timestamp as holding_duration,
    tl.buy_decision_metrics,
    tl.strategy,
    tl.account_type,
    tl.trade_pair_id,
    tl.account_id,
    tl.account_name,
    tl.user_id
  from trade_logs tl
  where tl.user_id = user_uuid
    and tl.status = 'open'
    and tl.action = 'buy'
    and tl.account_type = account_type_param
    and (account_uuid is null or tl.account_id = account_uuid)
  order by tl.buy_timestamp desc;
end;
$$ language plpgsql security definer;

-- Update get_completed_trades to filter by account_id
create or replace function get_completed_trades(
  user_uuid uuid,
  limit_count integer default 100,
  offset_count integer default 0,
  account_uuid uuid default null
)
returns table(
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
  account_name text
) as $$
begin
  return query
  select 
    tl.id,
    tl.symbol,
    tl.qty,
    tl.buy_price,
    tl.buy_timestamp,
    tl.sell_price,
    tl.sell_timestamp,
    tl.profit_loss,
    tl.profit_loss_percent,
    tl.holding_duration,
    tl.buy_decision_metrics,
    tl.sell_decision_metrics,
    tl.strategy,
    tl.account_type,
    tl.trade_pair_id,
    tl.account_id,
    tl.account_name
  from trade_logs tl
  where tl.user_id = user_uuid
    and tl.status = 'closed'
    and (account_uuid is null or tl.account_id = account_uuid)
  order by tl.sell_timestamp desc
  limit limit_count
  offset offset_count;
end;
$$ language plpgsql security definer;

-- Update get_trade_statistics to filter by account_id
create or replace function get_trade_statistics(
  user_uuid uuid,
  account_uuid uuid default null
)
returns table(
  total_trades bigint,
  open_trades bigint,
  closed_trades bigint,
  winning_trades bigint,
  losing_trades bigint,
  total_profit_loss numeric,
  avg_profit_loss numeric,
  win_rate numeric,
  avg_holding_duration interval,
  best_trade numeric,
  worst_trade numeric
) as $$
begin
  return query
  select 
    count(*)::bigint as total_trades,
    count(*) filter (where status = 'open')::bigint as open_trades,
    count(*) filter (where status = 'closed')::bigint as closed_trades,
    count(*) filter (where status = 'closed' and profit_loss > 0)::bigint as winning_trades,
    count(*) filter (where status = 'closed' and profit_loss < 0)::bigint as losing_trades,
    coalesce(sum(profit_loss) filter (where status = 'closed'), 0) as total_profit_loss,
    coalesce(avg(profit_loss) filter (where status = 'closed'), 0) as avg_profit_loss,
    case 
      when count(*) filter (where status = 'closed') > 0 
      then (count(*) filter (where status = 'closed' and profit_loss > 0)::numeric / count(*) filter (where status = 'closed')::numeric) * 100
      else 0
    end as win_rate,
    avg(holding_duration) filter (where status = 'closed') as avg_holding_duration,
    coalesce(max(profit_loss) filter (where status = 'closed'), 0) as best_trade,
    coalesce(min(profit_loss) filter (where status = 'closed'), 0) as worst_trade
  from trade_logs
  where user_id = user_uuid
    and (account_uuid is null or account_id = account_uuid);
end;
$$ language plpgsql security definer;

-- Add trigger to update updated_at on paper_trading_accounts
create or replace function update_paper_accounts_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trigger_update_paper_accounts_updated_at
  before update on paper_trading_accounts
  for each row
  execute function update_paper_accounts_updated_at();

-- Grant execute permissions on new functions
grant execute on function get_user_paper_accounts to authenticated;
grant execute on function get_user_paper_accounts to service_role;
grant execute on function create_paper_account to authenticated;
grant execute on function create_paper_account to service_role;
grant execute on function get_paper_account_keys to authenticated;
grant execute on function get_paper_account_keys to service_role;
grant execute on function update_paper_account to authenticated;
grant execute on function update_paper_account to service_role;
grant execute on function delete_paper_account to authenticated;
grant execute on function delete_paper_account to service_role;

-- Add comment to migration
comment on table paper_trading_accounts is 'Stores multiple paper trading accounts per user with encrypted API keys';

