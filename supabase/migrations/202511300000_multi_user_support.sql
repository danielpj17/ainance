-- Multi-user support migration
-- This ensures new users automatically get their settings row created
-- and that all functions work properly for any authenticated user

-- Create a trigger function to auto-create user_settings for new users
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.user_settings (user_id, api_mode, strategy, account_type)
  values (new.id, 'paper', 'cash', 'cash')
  on conflict (user_id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

-- Create trigger on auth.users to auto-create user_settings
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Update RLS policies to allow service role full access
-- This is needed because API routes use service role key

-- Drop existing policies that might conflict
drop policy if exists "Users can view own trades" on trades;
drop policy if exists "Users can insert own trades" on trades;
drop policy if exists "Users can view own settings" on user_settings;
drop policy if exists "Users can update own settings" on user_settings;
drop policy if exists "Users can insert own settings" on user_settings;
drop policy if exists "Users can view own encrypted API keys" on user_settings;
drop policy if exists "Users can update own encrypted API keys" on user_settings;

-- Create new policies that allow both user access AND service role access
-- Service role bypasses RLS by default, but we need to allow regular users too

create policy "trades_select_policy" on trades
  for select using (
    auth.uid() = user_id OR
    auth.jwt() ->> 'role' = 'service_role'
  );

create policy "trades_insert_policy" on trades
  for insert with check (
    auth.uid() = user_id OR
    auth.jwt() ->> 'role' = 'service_role'
  );

create policy "trades_update_policy" on trades
  for update using (
    auth.uid() = user_id OR
    auth.jwt() ->> 'role' = 'service_role'
  );

create policy "trades_delete_policy" on trades
  for delete using (
    auth.uid() = user_id OR
    auth.jwt() ->> 'role' = 'service_role'
  );

create policy "user_settings_select_policy" on user_settings
  for select using (
    auth.uid() = user_id OR
    auth.jwt() ->> 'role' = 'service_role'
  );

create policy "user_settings_insert_policy" on user_settings
  for insert with check (
    auth.uid() = user_id OR
    auth.jwt() ->> 'role' = 'service_role'
  );

create policy "user_settings_update_policy" on user_settings
  for update using (
    auth.uid() = user_id OR
    auth.jwt() ->> 'role' = 'service_role'
  );

-- Update the update_user_api_keys function to handle new users properly
create or replace function update_user_api_keys(
  user_uuid uuid,
  p_alpaca_paper_key text,
  p_alpaca_paper_secret text,
  p_alpaca_live_key text default null,
  p_alpaca_live_secret text default null,
  p_news_api_key text default null
)
returns void as $$
begin
  -- First ensure user_settings row exists
  insert into user_settings (user_id, api_mode, strategy, account_type)
  values (user_uuid, 'paper', 'cash', 'cash')
  on conflict (user_id) do nothing;
  
  -- Then update the API keys
  update user_settings set
    alpaca_paper_key_encrypted = encrypt_api_key(p_alpaca_paper_key),
    alpaca_paper_secret_encrypted = encrypt_api_key(p_alpaca_paper_secret),
    alpaca_live_key_encrypted = encrypt_api_key(p_alpaca_live_key),
    alpaca_live_secret_encrypted = encrypt_api_key(p_alpaca_live_secret),
    news_api_key_encrypted = encrypt_api_key(p_news_api_key),
    updated_at = now()
  where user_id = user_uuid;
end;
$$ language plpgsql security definer;

-- Update get_user_api_keys to return empty row if user doesn't have settings yet
create or replace function get_user_api_keys(user_uuid uuid)
returns table(
  alpaca_paper_key text,
  alpaca_paper_secret text,
  alpaca_live_key text,
  alpaca_live_secret text,
  news_api_key text
) as $$
begin
  -- First ensure user_settings row exists
  insert into user_settings (user_id, api_mode, strategy, account_type)
  values (user_uuid, 'paper', 'cash', 'cash')
  on conflict (user_id) do nothing;
  
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

-- Also update predictions policies
drop policy if exists "Users can view own predictions" on predictions;
drop policy if exists "Users can insert own predictions" on predictions;

create policy "predictions_select_policy" on predictions
  for select using (
    auth.uid() = user_id OR
    auth.jwt() ->> 'role' = 'service_role'
  );

create policy "predictions_insert_policy" on predictions
  for insert with check (
    auth.uid() = user_id OR
    auth.jwt() ->> 'role' = 'service_role'
  );

-- Also update backtests policies
drop policy if exists "Users can view own backtests" on backtests;
drop policy if exists "Users can insert own backtests" on backtests;

create policy "backtests_select_policy" on backtests
  for select using (
    auth.uid() = user_id OR
    auth.jwt() ->> 'role' = 'service_role'
  );

create policy "backtests_insert_policy" on backtests
  for insert with check (
    auth.uid() = user_id OR
    auth.jwt() ->> 'role' = 'service_role'
  );

-- Grant execute permissions on functions
grant execute on function update_user_api_keys to authenticated;
grant execute on function update_user_api_keys to service_role;
grant execute on function get_user_api_keys to authenticated;
grant execute on function get_user_api_keys to service_role;
grant execute on function handle_new_user to service_role;

-- Also need to update bot_state and trade_logs tables if they exist
do $$
begin
  -- Update bot_state policies if table exists
  if exists (select 1 from information_schema.tables where table_name = 'bot_state') then
    drop policy if exists "Users can view own bot state" on bot_state;
    drop policy if exists "Users can update own bot state" on bot_state;
    drop policy if exists "Users can insert own bot state" on bot_state;
    
    create policy "bot_state_select_policy" on bot_state
      for select using (auth.uid() = user_id OR auth.jwt() ->> 'role' = 'service_role');
    create policy "bot_state_insert_policy" on bot_state
      for insert with check (auth.uid() = user_id OR auth.jwt() ->> 'role' = 'service_role');
    create policy "bot_state_update_policy" on bot_state
      for update using (auth.uid() = user_id OR auth.jwt() ->> 'role' = 'service_role');
  end if;
  
  -- Update trade_logs policies if table exists
  if exists (select 1 from information_schema.tables where table_name = 'trade_logs') then
    drop policy if exists "Users can view own trade_logs" on trade_logs;
    drop policy if exists "Users can insert own trade_logs" on trade_logs;
    drop policy if exists "Users can update own trade_logs" on trade_logs;
    drop policy if exists "service_role can manage all trade_logs" on trade_logs;
    
    create policy "trade_logs_select_policy" on trade_logs
      for select using (auth.uid() = user_id OR auth.jwt() ->> 'role' = 'service_role');
    create policy "trade_logs_insert_policy" on trade_logs
      for insert with check (auth.uid() = user_id OR auth.jwt() ->> 'role' = 'service_role');
    create policy "trade_logs_update_policy" on trade_logs
      for update using (auth.uid() = user_id OR auth.jwt() ->> 'role' = 'service_role');
    create policy "trade_logs_delete_policy" on trade_logs
      for delete using (auth.uid() = user_id OR auth.jwt() ->> 'role' = 'service_role');
  end if;
  
  -- Update watchlists policies if table exists
  if exists (select 1 from information_schema.tables where table_name = 'watchlists') then
    drop policy if exists "Users can manage own watchlists" on watchlists;
    
    create policy "watchlists_select_policy" on watchlists
      for select using (auth.uid() = user_id OR auth.jwt() ->> 'role' = 'service_role');
    create policy "watchlists_insert_policy" on watchlists
      for insert with check (auth.uid() = user_id OR auth.jwt() ->> 'role' = 'service_role');
    create policy "watchlists_update_policy" on watchlists
      for update using (auth.uid() = user_id OR auth.jwt() ->> 'role' = 'service_role');
    create policy "watchlists_delete_policy" on watchlists
      for delete using (auth.uid() = user_id OR auth.jwt() ->> 'role' = 'service_role');
  end if;
end $$;

-- Log that migration completed
do $$
begin
  raise notice 'Multi-user support migration completed successfully';
end $$;

