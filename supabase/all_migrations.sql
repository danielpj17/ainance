-- Enable pgcrypto for encryption
create extension if not exists pgcrypto;

-- Create tables
create table trades (
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

create table user_settings (
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

create table predictions (
id bigint primary key generated always as identity,
user_id uuid references auth.users not null,
symbol text not null,
signal text not null,
confidence numeric,
prediction_timestamp timestamptz not null,
created_at timestamptz default now()
);

create table backtests (
id bigint primary key generated always as identity,
user_id uuid references auth.users not null,
strategy text not null,
date_range jsonb not null,
metrics jsonb not null,
created_at timestamptz default now()
);

-- Enable RLS
alter table trades enable row level security;
alter table user_settings enable row level security;
alter table predictions enable row level security;
alter table backtests enable row level security;

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
-- Add validation constraints and update user_settings table
-- This migration adds validation for strategy selection rules

-- Add check constraints for strategy validation
alter table user_settings 
add constraint check_strategy 
check (strategy in ('cash', '25k_plus'));

-- Add check constraints for account_type validation
alter table user_settings 
add constraint check_account_type 
check (account_type in ('cash', 'margin'));

-- Add check constraints for numeric ranges
alter table user_settings 
add constraint check_max_trade_size 
check (max_trade_size > 0);

alter table user_settings 
add constraint check_daily_loss_limit 
check (daily_loss_limit <= 0);

alter table user_settings 
add constraint check_take_profit 
check (take_profit > 0);

alter table user_settings 
add constraint check_stop_loss 
check (stop_loss > 0);

-- Add check constraint for $25k+ rules validation
-- If strategy is '25k_plus', max_trade_size must be >= 5000
alter table user_settings 
add constraint check_25k_plus_min_trade_size 
check (
  (strategy = 'cash') or 
  (strategy = '25k_plus' and max_trade_size >= 5000)
);

-- Add trigger function for validation warnings
create or replace function validate_user_settings()
returns trigger as $$
begin
  -- Warn if margin account is selected with under $25k strategy
  if new.account_type = 'margin' and new.strategy = 'cash' then
    raise warning 'Margin account selected with cash trading strategy - PDT risks apply';
  end if;
  
  return new;
end;
$$ language plpgsql;

-- Create trigger for validation
create trigger trigger_validate_user_settings
  before insert or update on user_settings
  for each row
  execute function validate_user_settings();

-- Add updated_at trigger
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
-- Add trading-related tables for AI model and news sentiment

-- News sentiment cache table
create table news_sentiment (
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

-- Add function to clean old sentiment data
create or replace function clean_old_sentiment_data()
returns void as $$
begin
  -- Delete sentiment data older than 7 days
  delete from news_sentiment 
  where updated_at < now() - interval '7 days';
end;
$$ language plpgsql;

-- Add function to get sentiment statistics
create or replace function get_sentiment_stats()
returns table(
  avg_sentiment numeric,
  total_symbols bigint,
  last_updated timestamptz
) as $$
begin
  return query
  select 
    avg(sentiment_score) as avg_sentiment,
    count(*) as total_symbols,
    max(updated_at) as last_updated
  from news_sentiment;
end;
$$ language plpgsql;

-- Add function to get top performing strategies
create or replace function get_strategy_performance(user_uuid uuid)
returns table(
  strategy text,
  avg_return numeric,
  total_backtests bigint,
  best_return numeric
) as $$
begin
  return query
  select 
    b.strategy,
    avg((b.metrics->>'total_return')::numeric) as avg_return,
    count(*) as total_backtests,
    max((b.metrics->>'total_return')::numeric) as best_return
  from backtests b
  where b.user_id = user_uuid
  group by b.strategy
  order by avg_return desc;
end;
$$ language plpgsql;

-- Add function to validate trading limits
create or replace function validate_trading_limits(
  user_uuid uuid,
  strategy_type text,
  account_type_param text
)
returns boolean as $$
declare
  trade_count integer;
  last_trade_date timestamptz;
  cash_balance numeric;
begin
  -- Get user settings
  select max_trade_size into cash_balance
  from user_settings
  where user_id = user_uuid;
  
  -- For cash accounts, check trade limits
  if strategy_type = 'cash' and account_type_param = 'cash' then
    -- Count trades in last 5 days
    select count(*), max(trade_timestamp)
    into trade_count, last_trade_date
    from trades
    where user_id = user_uuid
      and trade_timestamp > now() - interval '5 days';
    
    -- Check if under trade limit
    if trade_count >= 3 then
      return false;
    end if;
    
    -- Check T+2 settlement
    if last_trade_date is not null and last_trade_date > now() - interval '2 days' then
      -- Check if last trade was a buy (need to wait for settlement)
      if exists (
        select 1 from trades 
        where user_id = user_uuid 
          and action = 'buy' 
          and trade_timestamp > now() - interval '2 days'
      ) then
        return false;
      end if;
    end if;
  end if;
  
  -- For $25k+ accounts, check minimum trade size
  if strategy_type = '25k_plus' and cash_balance < 25000 then
    return false;
  end if;
  
  return true;
end;
$$ language plpgsql;

-- Add function to calculate portfolio metrics
create or replace function calculate_portfolio_metrics(user_uuid uuid)
returns table(
  total_trades bigint,
  winning_trades bigint,
  losing_trades bigint,
  win_rate numeric,
  avg_return numeric,
  total_return numeric
) as $$
begin
  return query
  with trade_stats as (
    select 
      count(*) as total_trades,
      count(*) filter (where action = 'buy') as buy_trades,
      count(*) filter (where action = 'sell') as sell_trades
    from trades
    where user_id = user_uuid
  ),
  backtest_stats as (
    select 
      avg((metrics->>'total_return')::numeric) as avg_return,
      max((metrics->>'total_return')::numeric) as total_return,
      avg((metrics->>'win_rate')::numeric) as win_rate,
      avg((metrics->>'total_trades')::numeric) as avg_trades
    from backtests
    where user_id = user_uuid
  )
  select 
    coalesce(ts.total_trades, 0) as total_trades,
    coalesce(bs.avg_trades * bs.win_rate, 0)::bigint as winning_trades,
    coalesce(bs.avg_trades * (1 - bs.win_rate), 0)::bigint as losing_trades,
    coalesce(bs.win_rate, 0) as win_rate,
    coalesce(bs.avg_return, 0) as avg_return,
    coalesce(bs.total_return, 0) as total_return
  from trade_stats ts
  cross join backtest_stats bs;
end;
$$ language plpgsql;
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
-- Create ML predictions cache table
CREATE TABLE IF NOT EXISTS ml_predictions_cache (
  id BIGSERIAL PRIMARY KEY,
  symbol VARCHAR(10) NOT NULL UNIQUE,
  prediction JSONB NOT NULL,
  cached_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index on symbol for fast lookups
CREATE INDEX IF NOT EXISTS idx_ml_predictions_cache_symbol 
  ON ml_predictions_cache(symbol);

-- Create index on expires_at for efficient cleanup
CREATE INDEX IF NOT EXISTS idx_ml_predictions_cache_expires 
  ON ml_predictions_cache(expires_at);

-- Create index on composite (symbol, expires_at) for cache checks
CREATE INDEX IF NOT EXISTS idx_ml_predictions_cache_symbol_expires 
  ON ml_predictions_cache(symbol, expires_at);

-- Enable Row Level Security
ALTER TABLE ml_predictions_cache ENABLE ROW LEVEL SECURITY;

-- Policy: Allow all authenticated users to read cache
CREATE POLICY "Allow authenticated users to read ML cache"
  ON ml_predictions_cache
  FOR SELECT
  TO authenticated
  USING (true);

-- Policy: Allow service role to insert/update cache
CREATE POLICY "Allow service role to manage ML cache"
  ON ml_predictions_cache
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_ml_predictions_cache_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update updated_at on row updates
CREATE TRIGGER trigger_update_ml_predictions_cache_updated_at
  BEFORE UPDATE ON ml_predictions_cache
  FOR EACH ROW
  EXECUTE FUNCTION update_ml_predictions_cache_updated_at();

-- Function to clean up expired cache entries (run periodically)
CREATE OR REPLACE FUNCTION cleanup_expired_ml_cache()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM ml_predictions_cache
  WHERE expires_at < NOW();
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION cleanup_expired_ml_cache() TO authenticated;

COMMENT ON TABLE ml_predictions_cache IS 'Caches ML predictions to reduce load on inference service';
COMMENT ON COLUMN ml_predictions_cache.symbol IS 'Stock ticker symbol';
COMMENT ON COLUMN ml_predictions_cache.prediction IS 'Complete prediction object from ML service';
COMMENT ON COLUMN ml_predictions_cache.cached_at IS 'When the prediction was cached';
COMMENT ON COLUMN ml_predictions_cache.expires_at IS 'When the cache entry expires';

-- Create user watchlists table
CREATE TABLE IF NOT EXISTS user_watchlists (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, name)
);

-- Create watchlist symbols table
CREATE TABLE IF NOT EXISTS watchlist_symbols (
  id BIGSERIAL PRIMARY KEY,
  watchlist_id BIGINT NOT NULL REFERENCES user_watchlists(id) ON DELETE CASCADE,
  symbol VARCHAR(10) NOT NULL,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT,
  sort_order INTEGER DEFAULT 0,
  UNIQUE(watchlist_id, symbol)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_user_watchlists_user_id 
  ON user_watchlists(user_id);

CREATE INDEX IF NOT EXISTS idx_user_watchlists_default 
  ON user_watchlists(user_id, is_default);

CREATE INDEX IF NOT EXISTS idx_watchlist_symbols_watchlist_id 
  ON watchlist_symbols(watchlist_id);

CREATE INDEX IF NOT EXISTS idx_watchlist_symbols_symbol 
  ON watchlist_symbols(symbol);

-- Enable Row Level Security
ALTER TABLE user_watchlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE watchlist_symbols ENABLE ROW LEVEL SECURITY;

-- Policies for user_watchlists
CREATE POLICY "Users can view their own watchlists"
  ON user_watchlists
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own watchlists"
  ON user_watchlists
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own watchlists"
  ON user_watchlists
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own watchlists"
  ON user_watchlists
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Policies for watchlist_symbols
CREATE POLICY "Users can view symbols in their watchlists"
  ON watchlist_symbols
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_watchlists
      WHERE user_watchlists.id = watchlist_symbols.watchlist_id
      AND user_watchlists.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can add symbols to their watchlists"
  ON watchlist_symbols
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_watchlists
      WHERE user_watchlists.id = watchlist_symbols.watchlist_id
      AND user_watchlists.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update symbols in their watchlists"
  ON watchlist_symbols
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_watchlists
      WHERE user_watchlists.id = watchlist_symbols.watchlist_id
      AND user_watchlists.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_watchlists
      WHERE user_watchlists.id = watchlist_symbols.watchlist_id
      AND user_watchlists.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete symbols from their watchlists"
  ON watchlist_symbols
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_watchlists
      WHERE user_watchlists.id = watchlist_symbols.watchlist_id
      AND user_watchlists.user_id = auth.uid()
    )
  );

-- Function to update updated_at
CREATE OR REPLACE FUNCTION update_watchlist_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for watchlists
CREATE TRIGGER trigger_update_watchlist_updated_at
  BEFORE UPDATE ON user_watchlists
  FOR EACH ROW
  EXECUTE FUNCTION update_watchlist_updated_at();

-- Function to ensure only one default watchlist per user
CREATE OR REPLACE FUNCTION ensure_single_default_watchlist()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_default = true THEN
    UPDATE user_watchlists
    SET is_default = false
    WHERE user_id = NEW.user_id
      AND id != NEW.id
      AND is_default = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to enforce single default
CREATE TRIGGER trigger_ensure_single_default_watchlist
  AFTER INSERT OR UPDATE ON user_watchlists
  FOR EACH ROW
  WHEN (NEW.is_default = true)
  EXECUTE FUNCTION ensure_single_default_watchlist();

-- Function to get user's watchlist with symbols
CREATE OR REPLACE FUNCTION get_user_watchlist(watchlist_id_param BIGINT)
RETURNS TABLE (
  id BIGINT,
  name VARCHAR(100),
  description TEXT,
  is_default BOOLEAN,
  symbol VARCHAR(10),
  notes TEXT,
  sort_order INTEGER,
  added_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    w.id,
    w.name,
    w.description,
    w.is_default,
    ws.symbol,
    ws.notes,
    ws.sort_order,
    ws.added_at
  FROM user_watchlists w
  LEFT JOIN watchlist_symbols ws ON w.id = ws.watchlist_id
  WHERE w.id = watchlist_id_param
    AND w.user_id = auth.uid()
  ORDER BY ws.sort_order, ws.added_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_user_watchlist(BIGINT) TO authenticated;

COMMENT ON TABLE user_watchlists IS 'User-defined stock watchlists';
COMMENT ON TABLE watchlist_symbols IS 'Symbols in user watchlists';
COMMENT ON FUNCTION get_user_watchlist(BIGINT) IS 'Get a user watchlist with all symbols';

-- Create rate limits table
CREATE TABLE IF NOT EXISTS rate_limits (
  id BIGSERIAL PRIMARY KEY,
  key VARCHAR(255) NOT NULL UNIQUE,
  count INTEGER NOT NULL DEFAULT 0,
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_rate_limits_key 
  ON rate_limits(key);

CREATE INDEX IF NOT EXISTS idx_rate_limits_window_end 
  ON rate_limits(window_end);

-- Enable Row Level Security (but allow service role full access)
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- Policy: Allow service role to manage rate limits
CREATE POLICY "Allow service role to manage rate limits"
  ON rate_limits
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Function to clean up expired rate limits
CREATE OR REPLACE FUNCTION cleanup_expired_rate_limits()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM rate_limits
  WHERE window_end < NOW() - INTERVAL '1 hour';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create performance metrics table
CREATE TABLE IF NOT EXISTS performance_metrics (
  id BIGSERIAL PRIMARY KEY,
  endpoint VARCHAR(255) NOT NULL,
  method VARCHAR(10) NOT NULL,
  duration_ms INTEGER NOT NULL,
  status_code INTEGER NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  error_message TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for performance metrics
CREATE INDEX IF NOT EXISTS idx_performance_metrics_endpoint 
  ON performance_metrics(endpoint);

CREATE INDEX IF NOT EXISTS idx_performance_metrics_created_at 
  ON performance_metrics(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_performance_metrics_user_id 
  ON performance_metrics(user_id);

CREATE INDEX IF NOT EXISTS idx_performance_metrics_status_code 
  ON performance_metrics(status_code);

-- Partition by month for better performance
CREATE INDEX IF NOT EXISTS idx_performance_metrics_endpoint_created_at 
  ON performance_metrics(endpoint, created_at DESC);

-- Enable Row Level Security
ALTER TABLE performance_metrics ENABLE ROW LEVEL SECURITY;

-- Policy: Allow service role to manage metrics
CREATE POLICY "Allow service role to manage performance metrics"
  ON performance_metrics
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Policy: Users can view their own metrics
CREATE POLICY "Users can view their own performance metrics"
  ON performance_metrics
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Function to get performance stats
CREATE OR REPLACE FUNCTION get_performance_stats(
  endpoint_param VARCHAR DEFAULT NULL,
  hours_back INTEGER DEFAULT 24
)
RETURNS TABLE (
  endpoint VARCHAR(255),
  total_requests BIGINT,
  avg_duration_ms NUMERIC,
  p50_duration_ms NUMERIC,
  p95_duration_ms NUMERIC,
  p99_duration_ms NUMERIC,
  error_rate NUMERIC,
  success_rate NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pm.endpoint,
    COUNT(*) as total_requests,
    AVG(pm.duration_ms)::NUMERIC(10,2) as avg_duration_ms,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY pm.duration_ms)::NUMERIC(10,2) as p50_duration_ms,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY pm.duration_ms)::NUMERIC(10,2) as p95_duration_ms,
    PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY pm.duration_ms)::NUMERIC(10,2) as p99_duration_ms,
    (COUNT(*) FILTER (WHERE pm.status_code >= 400) * 100.0 / COUNT(*))::NUMERIC(10,2) as error_rate,
    (COUNT(*) FILTER (WHERE pm.status_code < 400) * 100.0 / COUNT(*))::NUMERIC(10,2) as success_rate
  FROM performance_metrics pm
  WHERE pm.created_at >= NOW() - (hours_back || ' hours')::INTERVAL
    AND (endpoint_param IS NULL OR pm.endpoint = endpoint_param)
  GROUP BY pm.endpoint
  ORDER BY total_requests DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION cleanup_expired_rate_limits() TO service_role;
GRANT EXECUTE ON FUNCTION get_performance_stats(VARCHAR, INTEGER) TO authenticated;

-- Function to clean up old performance metrics (keep last 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_performance_metrics()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM performance_metrics
  WHERE created_at < NOW() - INTERVAL '30 days';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION cleanup_old_performance_metrics() TO service_role;

COMMENT ON TABLE rate_limits IS 'API rate limiting tracking';
COMMENT ON TABLE performance_metrics IS 'API performance monitoring';
COMMENT ON FUNCTION get_performance_stats(VARCHAR, INTEGER) IS 'Get performance statistics for endpoints';

