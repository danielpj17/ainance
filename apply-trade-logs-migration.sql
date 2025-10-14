-- Apply this migration to your Supabase database
-- You can run this in the Supabase SQL Editor or via the Supabase CLI

-- Create trade_logs table for comprehensive trade tracking
create table if not exists trade_logs (
  id bigint primary key generated always as identity,
  user_id uuid references auth.users not null,
  
  -- Trade identification
  symbol text not null,
  trade_pair_id uuid default gen_random_uuid(), -- Links buy and sell together
  
  -- Trade details
  action text not null check (action in ('buy', 'sell')),
  qty numeric not null,
  price numeric not null,
  total_value numeric not null,
  timestamp timestamptz not null default now(),
  
  -- Trade status
  status text not null default 'open' check (status in ('open', 'closed')),
  
  -- Buy decision metrics (stored when buying)
  buy_timestamp timestamptz,
  buy_price numeric,
  buy_decision_metrics jsonb, -- Stores all metrics that led to buy decision
  
  -- Sell decision metrics (stored when selling)
  sell_timestamp timestamptz,
  sell_price numeric,
  sell_decision_metrics jsonb, -- Stores all metrics that led to sell decision
  
  -- Performance metrics (calculated when closed)
  profit_loss numeric,
  profit_loss_percent numeric,
  holding_duration interval,
  
  -- Strategy and account info
  strategy text not null,
  account_type text not null,
  
  -- Alpaca order tracking
  alpaca_order_id text,
  order_status text,
  
  -- Metadata
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Create indexes for better performance
create index if not exists idx_trade_logs_user_id on trade_logs(user_id);
create index if not exists idx_trade_logs_symbol on trade_logs(symbol);
create index if not exists idx_trade_logs_pair_id on trade_logs(trade_pair_id);
create index if not exists idx_trade_logs_status on trade_logs(status);
create index if not exists idx_trade_logs_timestamp on trade_logs(timestamp desc);
create index if not exists idx_trade_logs_user_timestamp on trade_logs(user_id, timestamp desc);
create index if not exists idx_trade_logs_user_status on trade_logs(user_id, status);

-- Enable RLS
alter table trade_logs enable row level security;

-- RLS Policies
create policy "Users can view own trade logs" on trade_logs 
  for select using (auth.uid() = user_id);
  
create policy "Users can insert own trade logs" on trade_logs 
  for insert with check (auth.uid() = user_id);
  
create policy "Users can update own trade logs" on trade_logs 
  for update using (auth.uid() = user_id);

-- Function to get current/open trades
create or replace function get_current_trades(user_uuid uuid)
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
  trade_pair_id uuid
) as $$
begin
  return query
  select 
    tl.id,
    tl.symbol,
    tl.qty,
    tl.buy_price,
    tl.buy_timestamp,
    tl.price as current_price, -- Will be updated with real-time price in API
    tl.qty * tl.price as current_value,
    (tl.qty * tl.price) - (tl.qty * tl.buy_price) as unrealized_pl,
    (((tl.qty * tl.price) - (tl.qty * tl.buy_price)) / (tl.qty * tl.buy_price)) * 100 as unrealized_pl_percent,
    now() - tl.buy_timestamp as holding_duration,
    tl.buy_decision_metrics,
    tl.strategy,
    tl.account_type,
    tl.trade_pair_id
  from trade_logs tl
  where tl.user_id = user_uuid
    and tl.status = 'open'
    and tl.action = 'buy'
  order by tl.buy_timestamp desc;
end;
$$ language plpgsql security definer;

-- Function to get completed trades
create or replace function get_completed_trades(
  user_uuid uuid,
  limit_count integer default 100,
  offset_count integer default 0
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
  trade_pair_id uuid
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
    tl.trade_pair_id
  from trade_logs tl
  where tl.user_id = user_uuid
    and tl.status = 'closed'
  order by tl.sell_timestamp desc
  limit limit_count
  offset offset_count;
end;
$$ language plpgsql security definer;

-- Function to get trade statistics
create or replace function get_trade_statistics(user_uuid uuid)
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
  where user_id = user_uuid;
end;
$$ language plpgsql security definer;

-- Function to update trade log when selling
create or replace function close_trade_position(
  user_uuid uuid,
  symbol_param text,
  sell_qty numeric,
  sell_price_param numeric,
  sell_metrics jsonb
)
returns void as $$
declare
  open_trade record;
  pl numeric;
  pl_percent numeric;
  duration interval;
begin
  -- Find the oldest open trade for this symbol
  select * into open_trade
  from trade_logs
  where user_id = user_uuid
    and symbol = symbol_param
    and status = 'open'
    and action = 'buy'
  order by buy_timestamp asc
  limit 1;
  
  if open_trade is null then
    raise exception 'No open position found for symbol %', symbol_param;
  end if;
  
  -- Calculate profit/loss
  pl := (sell_price_param - open_trade.buy_price) * sell_qty;
  pl_percent := ((sell_price_param - open_trade.buy_price) / open_trade.buy_price) * 100;
  duration := now() - open_trade.buy_timestamp;
  
  -- Update the trade log
  update trade_logs
  set 
    status = 'closed',
    sell_timestamp = now(),
    sell_price = sell_price_param,
    sell_decision_metrics = sell_metrics,
    profit_loss = pl,
    profit_loss_percent = pl_percent,
    holding_duration = duration,
    updated_at = now()
  where id = open_trade.id;
end;
$$ language plpgsql security definer;

-- Add trigger to update updated_at timestamp
create or replace function update_trade_logs_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trigger_update_trade_logs_updated_at
  before update on trade_logs
  for each row
  execute function update_trade_logs_updated_at();

-- Enable realtime for trade_logs
alter publication supabase_realtime add table trade_logs;

