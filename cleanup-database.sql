-- ============================================================================
-- CLEANUP SCRIPT - Run this FIRST if you get "already exists" errors
-- This removes all existing tables, functions, and policies
-- Uses exception handling to ignore errors
-- ============================================================================

do $$
begin
  -- Drop all tables (this will delete all data!)
  drop table if exists bot_logs cascade;
  drop table if exists backtests cascade;
  drop table if exists predictions cascade;
  drop table if exists news_sentiment cascade;
  drop table if exists trades cascade;
  drop table if exists user_settings cascade;
  
  -- Drop all functions
  drop function if exists update_updated_at_column() cascade;
  drop function if exists encrypt_api_key(text, text) cascade;
  drop function if exists decrypt_api_key(bytea, text) cascade;
  drop function if exists update_user_api_keys(uuid, text, text, text, text, text) cascade;
  drop function if exists get_user_api_keys(uuid) cascade;
  drop function if exists get_user_trades(uuid, integer, integer, text) cascade;
  drop function if exists get_user_trades(uuid, integer, integer) cascade;
  drop function if exists get_user_predictions(uuid, integer, integer) cascade;
  drop function if exists get_user_backtests(uuid, integer, integer) cascade;
  drop function if exists get_portfolio_summary(uuid) cascade;
  drop function if exists can_place_trade(uuid, text, text) cascade;
  drop function if exists get_sentiment_stats() cascade;
  drop function if exists clean_old_sentiment_data() cascade;
  
  -- Remove tables from realtime publication
  begin
    alter publication supabase_realtime drop table trades;
  exception when others then
    null;
  end;
  
  begin
    alter publication supabase_realtime drop table predictions;
  exception when others then
    null;
  end;
  
  begin
    alter publication supabase_realtime drop table backtests;
  exception when others then
    null;
  end;
  
  raise notice 'Cleanup completed successfully!';
end $$;

-- ============================================================================
-- CLEANUP COMPLETE!
-- Now run apply-migrations.sql to create everything fresh
-- ============================================================================

