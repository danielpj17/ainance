-- Create demo user for single-user demo mode
-- This user is shared across all devices/sessions

-- Insert demo user into auth.users (if not exists)
-- Note: In production Supabase, you may need to create this user manually via the dashboard
-- or use the Supabase Management API, as direct inserts to auth.users may not be allowed

-- For local development, we'll create user settings directly
-- The demo user ID is: 00000000-0000-0000-0000-000000000001

-- Create or update user_settings for demo user
insert into user_settings (
  user_id,
  api_mode,
  strategy,
  account_type,
  max_trade_size,
  daily_loss_limit,
  take_profit,
  stop_loss
) values (
  '00000000-0000-0000-0000-000000000001',
  'paper',
  'cash',
  'cash',
  5000,
  -100,
  5,
  -3
)
on conflict (user_id) 
do update set
  updated_at = now();

-- Add a comment to identify this as the demo user
comment on table user_settings is 'User settings table. Demo user ID: 00000000-0000-0000-0000-000000000001';

-- Create a function to get demo user data (for easy reference)
create or replace function get_demo_user_stats()
returns table(
  total_trades bigint,
  open_positions bigint,
  total_spent numeric,
  total_received numeric,
  realized_pl numeric
) as $$
begin
  return query
  select 
    count(*) as total_trades,
    count(*) filter (where is_closed = false and position_size > 0) as open_positions,
    coalesce(sum(price * qty) filter (where action = 'buy'), 0) as total_spent,
    coalesce(sum(price * qty) filter (where action = 'sell'), 0) as total_received,
    coalesce(sum(realized_pl) filter (where is_closed = true), 0) as realized_pl
  from trades
  where user_id = '00000000-0000-0000-0000-000000000001';
end;
$$ language plpgsql;

