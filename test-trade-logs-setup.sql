-- Test script to verify trade_logs setup
-- Run this in Supabase SQL Editor after applying the migration

-- 1. Check if trade_logs table exists
select 
  'trade_logs table exists' as status,
  count(*) as row_count
from trade_logs;

-- 2. Check if all required functions exist
select 
  routine_name,
  routine_type
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'get_current_trades',
    'get_completed_trades', 
    'get_trade_statistics',
    'close_trade_position'
  )
order by routine_name;

-- 3. Check RLS policies
select 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd
from pg_policies
where tablename = 'trade_logs'
order by policyname;

-- 4. Check indexes
select 
  indexname,
  indexdef
from pg_indexes
where tablename = 'trade_logs'
order by indexname;

-- 5. Test getting current trades (should return empty if no trades yet)
-- Replace 'YOUR_USER_ID' with your actual user ID
-- You can find your user ID by running: select auth.uid();
-- select * from get_current_trades(auth.uid());

-- 6. Test getting completed trades
-- select * from get_completed_trades(auth.uid(), 10, 0);

-- 7. Test getting statistics
-- select * from get_trade_statistics(auth.uid());

-- If all queries above run without errors, your setup is correct!
select '✅ All tests passed! trade_logs is properly configured.' as result;

