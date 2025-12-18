-- RPC Functions for per-account bot state and strategy settings management

-- 1. Update or create account bot state
create or replace function update_account_bot_state(
  account_uuid uuid,
  user_uuid uuid,
  is_running_param boolean,
  config_param jsonb,
  error_param text default null,
  always_on_param boolean default null
)
returns void as $$
begin
  -- Verify user owns this account
  if not exists (
    select 1 from paper_trading_accounts 
    where id = account_uuid and user_id = user_uuid
  ) then
    raise exception 'Account not found or access denied';
  end if;
  
  insert into account_bot_state (account_id, user_id, is_running, config, last_run, error, always_on, updated_at)
  values (account_uuid, user_uuid, is_running_param, config_param, now(), error_param, 
    coalesce(always_on_param, (select always_on from account_bot_state where account_id = account_uuid), false), now())
  on conflict (account_id)
  do update set
    is_running = is_running_param,
    config = config_param,
    last_run = now(),
    error = error_param,
    always_on = coalesce(always_on_param, account_bot_state.always_on),
    updated_at = now();
end;
$$ language plpgsql security definer;

-- 2. Get account bot state
create or replace function get_account_bot_state(account_uuid uuid, user_uuid uuid)
returns table(
  is_running boolean,
  config jsonb,
  last_run timestamptz,
  error text,
  always_on boolean
) as $$
begin
  -- Verify user owns this account
  if not exists (
    select 1 from paper_trading_accounts 
    where id = account_uuid and user_id = user_uuid
  ) then
    raise exception 'Account not found or access denied';
  end if;
  
  return query
  select 
    abs.is_running,
    abs.config,
    abs.last_run,
    abs.error,
    abs.always_on
  from account_bot_state abs
  where abs.account_id = account_uuid and abs.user_id = user_uuid;
end;
$$ language plpgsql security definer;

-- 3. Toggle always-on for an account
create or replace function toggle_account_always_on(
  account_uuid uuid,
  user_uuid uuid,
  always_on_param boolean
)
returns boolean as $$
begin
  -- Verify user owns this account
  if not exists (
    select 1 from paper_trading_accounts 
    where id = account_uuid and user_id = user_uuid
  ) then
    raise exception 'Account not found or access denied';
  end if;
  
  update account_bot_state
  set always_on = always_on_param,
      updated_at = now()
  where account_id = account_uuid and user_id = user_uuid;
  
  -- If no row exists, create one
  if not found then
    insert into account_bot_state (account_id, user_id, always_on, updated_at)
    values (account_uuid, user_uuid, always_on_param, now());
  end if;
  
  return true;
end;
$$ language plpgsql security definer;

-- 4. Get all accounts with always_on enabled (for health check)
create or replace function get_always_on_accounts()
returns table(
  account_id uuid,
  user_id uuid,
  config jsonb,
  always_on boolean,
  account_name text,
  alpaca_account_number text
) as $$
begin
  return query
  select 
    abs.account_id,
    abs.user_id,
    abs.config,
    abs.always_on,
    pta.account_name,
    pta.alpaca_account_number
  from account_bot_state abs
  join paper_trading_accounts pta on pta.id = abs.account_id
  where abs.always_on = true;
end;
$$ language plpgsql security definer;

-- 5. Get all running accounts (for health check)
create or replace function get_running_accounts()
returns table(
  account_id uuid,
  user_id uuid,
  config jsonb,
  always_on boolean,
  is_running boolean,
  account_name text,
  alpaca_account_number text
) as $$
begin
  return query
  select 
    abs.account_id,
    abs.user_id,
    abs.config,
    abs.always_on,
    abs.is_running,
    pta.account_name,
    pta.alpaca_account_number
  from account_bot_state abs
  join paper_trading_accounts pta on pta.id = abs.account_id
  where abs.is_running = true;
end;
$$ language plpgsql security definer;

-- 6. Get account strategy settings
create or replace function get_account_strategy_settings(account_uuid uuid, user_uuid uuid)
returns table(
  strategy text,
  account_type text,
  confidence_threshold numeric,
  sell_confidence_threshold numeric,
  max_exposure numeric
) as $$
begin
  -- Verify user owns this account
  if not exists (
    select 1 from paper_trading_accounts 
    where id = account_uuid and user_id = user_uuid
  ) then
    raise exception 'Account not found or access denied';
  end if;
  
  return query
  select 
    ass.strategy,
    ass.account_type,
    ass.confidence_threshold,
    ass.sell_confidence_threshold,
    ass.max_exposure
  from account_strategy_settings ass
  where ass.account_id = account_uuid and ass.user_id = user_uuid;
end;
$$ language plpgsql security definer;

-- 7. Update account strategy settings
create or replace function update_account_strategy_settings(
  account_uuid uuid,
  user_uuid uuid,
  strategy_param text default null,
  account_type_param text default null,
  confidence_threshold_param numeric default null,
  sell_confidence_threshold_param numeric default null,
  max_exposure_param numeric default null
)
returns void as $$
begin
  -- Verify user owns this account
  if not exists (
    select 1 from paper_trading_accounts 
    where id = account_uuid and user_id = user_uuid
  ) then
    raise exception 'Account not found or access denied';
  end if;
  
  -- Validate parameters
  if strategy_param is not null and strategy_param not in ('cash', '25k_plus') then
    raise exception 'Invalid strategy. Must be cash or 25k_plus';
  end if;
  
  if account_type_param is not null and account_type_param not in ('cash', 'margin') then
    raise exception 'Invalid account_type. Must be cash or margin';
  end if;
  
  if confidence_threshold_param is not null and (confidence_threshold_param < 0 or confidence_threshold_param > 1) then
    raise exception 'Invalid confidence_threshold. Must be between 0 and 1';
  end if;
  
  if sell_confidence_threshold_param is not null and (sell_confidence_threshold_param < 0 or sell_confidence_threshold_param > 1) then
    raise exception 'Invalid sell_confidence_threshold. Must be between 0 and 1';
  end if;
  
  if max_exposure_param is not null and (max_exposure_param < 0 or max_exposure_param > 100) then
    raise exception 'Invalid max_exposure. Must be between 0 and 100';
  end if;
  
  -- Insert or update
  insert into account_strategy_settings (
    account_id, 
    user_id, 
    strategy, 
    account_type, 
    confidence_threshold, 
    sell_confidence_threshold, 
    max_exposure,
    updated_at
  )
  values (
    account_uuid,
    user_uuid,
    coalesce(strategy_param, 'cash'),
    coalesce(account_type_param, 'cash'),
    coalesce(confidence_threshold_param, 0.65),
    coalesce(sell_confidence_threshold_param, 0.50),
    coalesce(max_exposure_param, 90),
    now()
  )
  on conflict (account_id)
  do update set
    strategy = coalesce(strategy_param, account_strategy_settings.strategy),
    account_type = coalesce(account_type_param, account_strategy_settings.account_type),
    confidence_threshold = coalesce(confidence_threshold_param, account_strategy_settings.confidence_threshold),
    sell_confidence_threshold = coalesce(sell_confidence_threshold_param, account_strategy_settings.sell_confidence_threshold),
    max_exposure = coalesce(max_exposure_param, account_strategy_settings.max_exposure),
    updated_at = now();
end;
$$ language plpgsql security definer;

-- Grant execute permissions to authenticated users
grant execute on function update_account_bot_state to authenticated;
grant execute on function update_account_bot_state to service_role;
grant execute on function get_account_bot_state to authenticated;
grant execute on function get_account_bot_state to service_role;
grant execute on function toggle_account_always_on to authenticated;
grant execute on function toggle_account_always_on to service_role;
grant execute on function get_always_on_accounts to authenticated;
grant execute on function get_always_on_accounts to service_role;
grant execute on function get_always_on_accounts to anon;
grant execute on function get_running_accounts to authenticated;
grant execute on function get_running_accounts to service_role;
grant execute on function get_running_accounts to anon;
grant execute on function get_account_strategy_settings to authenticated;
grant execute on function get_account_strategy_settings to service_role;
grant execute on function update_account_strategy_settings to authenticated;
grant execute on function update_account_strategy_settings to service_role;

