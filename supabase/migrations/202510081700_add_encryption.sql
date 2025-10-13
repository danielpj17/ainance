-- Add encryption support for API keys and enhance user settings
-- This migration adds pgcrypto encryption for sensitive API keys

-- Ensure pgcrypto extension is available
create extension if not exists pgcrypto;

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
  update user_settings set
    alpaca_paper_key_encrypted = encrypt_api_key(alpaca_paper_key),
    alpaca_paper_secret_encrypted = encrypt_api_key(alpaca_paper_secret),
    alpaca_live_key_encrypted = encrypt_api_key(alpaca_live_key),
    alpaca_live_secret_encrypted = encrypt_api_key(alpaca_live_secret),
    news_api_key_encrypted = encrypt_api_key(news_api_key),
    updated_at = now()
  where user_id = user_uuid;
  
  -- Insert if user doesn't exist
  if not found then
    insert into user_settings (
      user_id,
      alpaca_paper_key_encrypted,
      alpaca_paper_secret_encrypted,
      alpaca_live_key_encrypted,
      alpaca_live_secret_encrypted,
      news_api_key_encrypted,
      updated_at
    ) values (
      user_uuid,
      encrypt_api_key(alpaca_paper_key),
      encrypt_api_key(alpaca_paper_secret),
      encrypt_api_key(alpaca_live_key),
      encrypt_api_key(alpaca_live_secret),
      encrypt_api_key(news_api_key),
      now()
    );
  end if;
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
    decrypt_api_key(us.alpaca_paper_key_encrypted) as alpaca_paper_key,
    decrypt_api_key(us.alpaca_paper_secret_encrypted) as alpaca_paper_secret,
    decrypt_api_key(us.alpaca_live_key_encrypted) as alpaca_live_key,
    decrypt_api_key(us.alpaca_live_secret_encrypted) as alpaca_live_secret,
    decrypt_api_key(us.news_api_key_encrypted) as news_api_key
  from user_settings us
  where us.user_id = user_uuid;
end;
$$ language plpgsql security definer;

-- Add RLS policies for encrypted API keys
create policy "Users can view own encrypted API keys" on user_settings 
for select using (auth.uid() = user_id);

create policy "Users can update own encrypted API keys" on user_settings 
for update using (auth.uid() = user_id);

-- Add function to get user trades with pagination
create or replace function get_user_trades(
  user_uuid uuid,
  limit_count integer default 50,
  offset_count integer default 0,
  symbol_filter text default null
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
    t.created_at
  from trades t
  where t.user_id = user_uuid
    and (symbol_filter is null or t.symbol ilike '%' || symbol_filter || '%')
  order by t.trade_timestamp desc
  limit limit_count
  offset offset_count;
end;
$$ language plpgsql security definer;

-- Add function to get user predictions with pagination
create or replace function get_user_predictions(
  user_uuid uuid,
  limit_count integer default 50,
  offset_count integer default 0
)
returns table(
  id bigint,
  symbol text,
  signal text,
  confidence numeric,
  prediction_timestamp timestamptz,
  signal_count integer,
  strategy text,
  account_type text,
  created_at timestamptz
) as $$
begin
  return query
  select 
    p.id,
    p.symbol,
    p.signal,
    p.confidence,
    p.prediction_timestamp,
    p.signal_count,
    p.strategy,
    p.account_type,
    p.created_at
  from predictions p
  where p.user_id = user_uuid
  order by p.created_at desc
  limit limit_count
  offset offset_count;
end;
$$ language plpgsql security definer;

-- Add function to get user backtests with pagination
create or replace function get_user_backtests(
  user_uuid uuid,
  limit_count integer default 20,
  offset_count integer default 0
)
returns table(
  id bigint,
  strategy text,
  date_range jsonb,
  metrics jsonb,
  created_at timestamptz
) as $$
begin
  return query
  select 
    b.id,
    b.strategy,
    b.date_range,
    b.metrics,
    b.created_at
  from backtests b
  where b.user_id = user_uuid
  order by b.created_at desc
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
create index if not exists idx_trades_user_trade_timestamp on trades(user_id, trade_timestamp desc);
create index if not exists idx_predictions_user_created on predictions(user_id, created_at desc);
create index if not exists idx_backtests_user_created on backtests(user_id, created_at desc);
create index if not exists idx_trades_symbol on trades(symbol);
create index if not exists idx_trades_strategy on trades(strategy);

-- Add function to clean old data
create or replace function clean_old_trading_data()
returns void as $$
begin
  -- Delete trades older than 1 year
  delete from trades where created_at < now() - interval '1 year';
  
  -- Delete predictions older than 6 months
  delete from predictions where created_at < now() - interval '6 months';
  
  -- Delete backtests older than 6 months
  delete from backtests where created_at < now() - interval '6 months';
  
  -- Delete old sentiment data
  delete from news_sentiment where updated_at < now() - interval '7 days';
end;
$$ language plpgsql;

-- Create a scheduled job to clean old data (if pg_cron is available)
-- select cron.schedule('clean-old-data', '0 2 * * *', 'select clean_old_trading_data();');
