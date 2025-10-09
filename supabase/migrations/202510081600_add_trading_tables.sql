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
          and timestamp > now() - interval '2 days'
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
