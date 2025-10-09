-- ============================================================================
-- AINANCE TRADING PLATFORM - DATABASE SETUP
-- Run this SQL in your Supabase SQL Editor
-- Go to: https://supabase.com/dashboard → Your Project → SQL Editor
-- ============================================================================

-- Migration 1: Create Tables
-- Enable pgcrypto for encryption
create extension if not exists pgcrypto;

-- Create tables
create table if not exists trades (
id bigint primary key generated always as identity,
user_id uuid references auth.users not null,
symbol text not null,
action text not null,
qty numeric not null,
price numeric not null,
trade_timestamp timestamptz not null,
strategy text not null,
account_type text not null,
created_at timestamptz default now()
);

create table if not exists user_settings (
user_id uuid primary key references auth.users not null,
api_mode text default 'paper',
strategy text default 'cash',
account_type text default 'cash',
max_trade_size numeric default 5000,
daily_loss_limit numeric default -2,
take_profit numeric default 0.5,
stop_loss numeric default 0.3,
news_api_key text,
alpaca_paper_key text,
alpaca_paper_secret text,
alpaca_live_key text,
alpaca_live_secret text,
updated_at timestamptz default now()
);

create table if not exists predictions (
id bigint primary key generated always as identity,
user_id uuid references auth.users not null,
symbol text not null,
signal text not null,
confidence numeric,
prediction_timestamp timestamptz not null,
created_at timestamptz default now()
);

create table if not exists backtests (
id bigint primary key generated always as identity,
user_id uuid references auth.users not null,
strategy text not null,
date_range jsonb not null,
metrics jsonb not null,
created_at timestamptz default now()
);

create table if not exists bot_logs (
id bigint primary key generated always as identity,
user_id uuid references auth.users not null,
action text not null,
message text,
config jsonb,
data jsonb,
created_at timestamptz default now()
);

-- Enable RLS
alter table trades enable row level security;
alter table user_settings enable row level security;
alter table predictions enable row level security;
alter table backtests enable row level security;
alter table bot_logs enable row level security;

-- RLS Policies
create policy "Users can view own trades" on trades for select using (auth.uid() = user_id);
create policy "Users can insert own trades" on trades for insert with check (auth.uid() = user_id);
create policy "Users can view own settings" on user_settings for select using (auth.uid() = user_id);
create policy "Users can update own settings" on user_settings for update using (auth.uid() = user_id);
create policy "Users can insert own settings" on user_settings for insert with check (auth.uid() = user_id);
create policy "Users can view own predictions" on predictions for select using (auth.uid() = user_id);
create policy "Users can insert own predictions" on predictions for insert with check (auth.uid() = user_id);
create policy "Users can view own backtests" on backtests for select using (auth.uid() = user_id);
create policy "Users can insert own backtests" on backtests for insert with check (auth.uid() = user_id);
create policy "Users can view own bot logs" on bot_logs for select using (auth.uid() = user_id);
create policy "Users can insert own bot logs" on bot_logs for insert with check (auth.uid() = user_id);

-- Migration 2: Add Validation
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trigger_update_user_settings_updated_at
  before update on user_settings
  for each row
  execute function update_updated_at_column();

-- Add constraints for validation
alter table trades add constraint trades_action_check check (action in ('buy', 'sell'));
alter table trades add constraint trades_qty_positive check (qty > 0);
alter table trades add constraint trades_price_positive check (price > 0);

alter table user_settings add constraint user_settings_strategy_check check (strategy in ('cash', '25k_plus'));
alter table user_settings add constraint user_settings_account_type_check check (account_type in ('cash', 'margin'));
alter table user_settings add constraint user_settings_max_trade_size_positive check (max_trade_size > 0);
alter table user_settings add constraint user_settings_daily_loss_limit_negative check (daily_loss_limit < 0);
alter table user_settings add constraint user_settings_take_profit_positive check (take_profit > 0);
alter table user_settings add constraint user_settings_stop_loss_positive check (stop_loss > 0);

alter table predictions add constraint predictions_signal_check check (signal in ('buy', 'sell', 'hold'));

-- Migration 3: Add Trading Tables
create table if not exists news_sentiment (
  symbol text primary key,
  sentiment_score numeric not null,
  confidence numeric not null,
  article_count integer not null,
  headlines text[],
  updated_at timestamptz default now()
);

-- Update predictions table to include more fields
alter table predictions add column if not exists signal_count integer default 0;
alter table predictions add column if not exists strategy text;
alter table predictions add column if not exists account_type text;

-- Add indexes for better performance
create index if not exists idx_predictions_user_timestamp on predictions(user_id, created_at);
create index if not exists idx_backtests_user_timestamp on backtests(user_id, created_at);
create index if not exists idx_trades_user_timestamp on trades(user_id, created_at);

-- Enable RLS for news_sentiment
alter table news_sentiment enable row level security;

-- RLS Policies for news_sentiment (public read access for sentiment data)
create policy "News sentiment is publicly readable" on news_sentiment for select using (true);

-- Add trigger to update updated_at timestamp for news_sentiment
create trigger trigger_update_news_sentiment_updated_at
  before update on news_sentiment
  for each row
  execute function update_updated_at_column();

-- Add trades table fields
alter table trades add column if not exists alpaca_order_id text;
alter table trades add column if not exists order_status text;
alter table trades add column if not exists confidence numeric;
alter table trades add column if not exists reasoning text;

-- Migration 4: Add Encryption and Functions
-- Add encrypted API key columns to user_settings
alter table user_settings add column if not exists alpaca_paper_key_encrypted bytea;
alter table user_settings add column if not exists alpaca_paper_secret_encrypted bytea;
alter table user_settings add column if not exists alpaca_live_key_encrypted bytea;
alter table user_settings add column if not exists alpaca_live_secret_encrypted bytea;
alter table user_settings add column if not exists news_api_key_encrypted bytea;

-- Add function to encrypt API keys
create or replace function encrypt_api_key(key text, encryption_key text default 'ainance_encryption_key_2024')
returns bytea as $$
begin
  if key is null or key = '' then
    return null;
  end if;
  return pgp_sym_encrypt(key, encryption_key);
end;
$$ language plpgsql security definer;

-- Add function to decrypt API keys
create or replace function decrypt_api_key(encrypted_key bytea, encryption_key text default 'ainance_encryption_key_2024')
returns text as $$
begin
  if encrypted_key is null then
    return null;
  end if;
  return pgp_sym_decrypt(encrypted_key, encryption_key);
end;
$$ language plpgsql security definer;

-- Add function to update user API keys
create or replace function update_user_api_keys(
  user_uuid uuid,
  alpaca_paper_key text,
  alpaca_paper_secret text,
  alpaca_live_key text default null,
  alpaca_live_secret text default null,
  news_api_key text default null
)
returns void as $$
begin
  insert into user_settings (
    user_id,
    alpaca_paper_key_encrypted,
    alpaca_paper_secret_encrypted,
    alpaca_live_key_encrypted,
    alpaca_live_secret_encrypted,
    news_api_key_encrypted
  ) values (
    user_uuid,
    encrypt_api_key(alpaca_paper_key),
    encrypt_api_key(alpaca_paper_secret),
    encrypt_api_key(alpaca_live_key),
    encrypt_api_key(alpaca_live_secret),
    encrypt_api_key(news_api_key)
  )
  on conflict (user_id) do update set
    alpaca_paper_key_encrypted = encrypt_api_key(alpaca_paper_key),
    alpaca_paper_secret_encrypted = encrypt_api_key(alpaca_paper_secret),
    alpaca_live_key_encrypted = encrypt_api_key(alpaca_live_key),
    alpaca_live_secret_encrypted = encrypt_api_key(alpaca_live_secret),
    news_api_key_encrypted = encrypt_api_key(news_api_key),
    updated_at = now();
end;
$$ language plpgsql security definer;

-- Add function to get user API keys (decrypted)
create or replace function get_user_api_keys(user_uuid uuid)
returns table(
  alpaca_paper_key text,
  alpaca_paper_secret text,
  alpaca_live_key text,
  alpaca_live_secret text,
  news_api_key text
) as $$
begin
  return query
  select 
    decrypt_api_key(alpaca_paper_key_encrypted),
    decrypt_api_key(alpaca_paper_secret_encrypted),
    decrypt_api_key(alpaca_live_key_encrypted),
    decrypt_api_key(alpaca_live_secret_encrypted),
    decrypt_api_key(news_api_key_encrypted)
  from user_settings
  where user_id = user_uuid;
end;
$$ language plpgsql security definer;

-- Add function to get user trades
create or replace function get_user_trades(
  user_uuid uuid,
  limit_count integer default 50,
  offset_count integer default 0
)
returns table(
  id bigint,
  symbol text,
  action text,
  qty numeric,
  price numeric,
  trade_timestamp timestamptz,
  strategy text,
  account_type text,
  alpaca_order_id text,
  order_status text,
  confidence numeric,
  reasoning text,
  created_at timestamptz
) as $$
begin
  return query
  select 
    t.id,
    t.symbol,
    t.action,
    t.qty,
    t.price,
    t.trade_timestamp,
    t.strategy,
    t.account_type,
    t.alpaca_order_id,
    t.order_status,
    t.confidence,
    t.reasoning,
    t.created_at
  from trades t
  where t.user_id = user_uuid
  order by t.created_at desc
  limit limit_count
  offset offset_count;
end;
$$ language plpgsql security definer;

-- Add function to get portfolio summary
create or replace function get_portfolio_summary(user_uuid uuid)
returns table(
  total_trades bigint,
  total_pnl numeric,
  win_rate numeric,
  avg_trade_size numeric,
  last_trade_date timestamptz,
  active_strategy text
) as $$
begin
  return query
  with trade_stats as (
    select 
      count(*) as trade_count,
      sum(case when action = 'sell' then qty * price else -qty * price end) as total_pnl,
      count(*) filter (where action = 'sell') as sell_count,
      avg(qty * price) as avg_size,
      max(trade_timestamp) as last_trade
    from trades
    where user_id = user_uuid
  ),
  current_settings as (
    select strategy
    from user_settings
    where user_id = user_uuid
    limit 1
  )
  select 
    ts.trade_count,
    coalesce(ts.total_pnl, 0) as total_pnl,
    case when ts.trade_count > 0 then (ts.sell_count::numeric / ts.trade_count) else 0 end as win_rate,
    coalesce(ts.avg_size, 0) as avg_trade_size,
    ts.last_trade,
    cs.strategy
  from trade_stats ts
  cross join current_settings cs;
end;
$$ language plpgsql security definer;

-- Enable realtime for tables
alter publication supabase_realtime add table trades;
alter publication supabase_realtime add table predictions;
alter publication supabase_realtime add table backtests;

-- Add indexes for better performance
create index if not exists idx_trades_user_timestamp on trades(user_id, trade_timestamp desc);
create index if not exists idx_predictions_user_created on predictions(user_id, created_at desc);
create index if not exists idx_backtests_user_created on backtests(user_id, created_at desc);

-- ============================================================================
-- MIGRATION COMPLETE!
-- You can now use the trading platform.
-- ============================================================================

