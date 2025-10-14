-- Add P&L tracking columns to trades table
alter table trades add column if not exists realized_pl numeric default 0;
alter table trades add column if not exists unrealized_pl numeric default 0;
alter table trades add column if not exists cost_basis numeric default 0;
alter table trades add column if not exists is_closed boolean default false;
alter table trades add column if not exists position_size numeric default 0;
alter table trades add column if not exists alpaca_order_id text;
alter table trades add column if not exists order_status text;

-- Create index for faster queries
create index if not exists idx_trades_user_symbol on trades(user_id, symbol);
create index if not exists idx_trades_is_closed on trades(user_id, is_closed);

-- Function to calculate trade metrics for a user
create or replace function calculate_trade_metrics(user_uuid uuid)
returns table(
  total_spent numeric,
  total_received numeric,
  realized_pl numeric,
  unrealized_pl numeric,
  open_positions bigint,
  closed_positions bigint
) as $$
declare
  v_total_spent numeric := 0;
  v_total_received numeric := 0;
  v_realized_pl numeric := 0;
  v_unrealized_pl numeric := 0;
  v_open_positions bigint := 0;
  v_closed_positions bigint := 0;
begin
  -- Calculate total spent (all buy orders)
  select coalesce(sum(price * qty), 0)
  into v_total_spent
  from trades
  where user_id = user_uuid and action = 'buy';
  
  -- Calculate total received (all sell orders)
  select coalesce(sum(price * qty), 0)
  into v_total_received
  from trades
  where user_id = user_uuid and action = 'sell';
  
  -- Calculate realized P&L (closed positions)
  select coalesce(sum(realized_pl), 0)
  into v_realized_pl
  from trades
  where user_id = user_uuid and is_closed = true;
  
  -- Calculate unrealized P&L (open positions)
  select coalesce(sum(unrealized_pl), 0)
  into v_unrealized_pl
  from trades
  where user_id = user_uuid and is_closed = false and position_size > 0;
  
  -- Count open positions
  select count(distinct symbol)
  into v_open_positions
  from trades
  where user_id = user_uuid and is_closed = false and position_size > 0;
  
  -- Count closed positions
  select count(*)
  into v_closed_positions
  from trades
  where user_id = user_uuid and is_closed = true;
  
  return query select 
    v_total_spent,
    v_total_received,
    v_realized_pl,
    v_unrealized_pl,
    v_open_positions,
    v_closed_positions;
end;
$$ language plpgsql;

-- Function to get open positions with aggregated data
create or replace function get_open_positions(user_uuid uuid)
returns table(
  symbol text,
  total_qty numeric,
  avg_cost numeric,
  total_cost numeric,
  first_trade_date timestamptz,
  trade_count bigint
) as $$
begin
  return query
  select 
    t.symbol,
    sum(case when t.action = 'buy' then t.qty else -t.qty end) as total_qty,
    sum(case when t.action = 'buy' then t.price * t.qty else 0 end) / 
      nullif(sum(case when t.action = 'buy' then t.qty else 0 end), 0) as avg_cost,
    sum(case when t.action = 'buy' then t.price * t.qty else -t.price * t.qty end) as total_cost,
    min(t.trade_timestamp) as first_trade_date,
    count(*) as trade_count
  from trades t
  where t.user_id = user_uuid
  group by t.symbol
  having sum(case when t.action = 'buy' then t.qty else -t.qty end) > 0
  order by first_trade_date desc;
end;
$$ language plpgsql;

-- Function to get closed positions (realized P&L)
create or replace function get_closed_positions(user_uuid uuid)
returns table(
  id bigint,
  symbol text,
  entry_date timestamptz,
  exit_date timestamptz,
  qty numeric,
  entry_price numeric,
  exit_price numeric,
  cost numeric,
  proceeds numeric,
  realized_pl numeric,
  pl_percent numeric
) as $$
begin
  return query
  select 
    t.id,
    t.symbol,
    t.trade_timestamp as entry_date,
    t.trade_timestamp as exit_date,
    t.qty,
    t.cost_basis as entry_price,
    t.price as exit_price,
    t.cost_basis * t.qty as cost,
    t.price * t.qty as proceeds,
    t.realized_pl,
    case 
      when t.cost_basis > 0 then ((t.price - t.cost_basis) / t.cost_basis * 100)
      else 0
    end as pl_percent
  from trades t
  where t.user_id = user_uuid and t.is_closed = true
  order by t.trade_timestamp desc;
end;
$$ language plpgsql;

-- Function to get all trades with computed values
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
  total_value numeric,
  trade_timestamp timestamptz,
  strategy text,
  account_type text,
  realized_pl numeric,
  unrealized_pl numeric,
  is_closed boolean,
  position_size numeric,
  cost_basis numeric,
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
    t.price * t.qty as total_value,
    t.trade_timestamp,
    t.strategy,
    t.account_type,
    t.realized_pl,
    t.unrealized_pl,
    t.is_closed,
    t.position_size,
    t.cost_basis,
    t.created_at
  from trades t
  where t.user_id = user_uuid
    and (symbol_filter is null or t.symbol = symbol_filter)
  order by t.trade_timestamp desc
  limit limit_count
  offset offset_count;
end;
$$ language plpgsql;

