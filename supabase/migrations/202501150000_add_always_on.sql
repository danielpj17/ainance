-- Add always_on field to bot_state table
alter table bot_state 
add column if not exists always_on boolean default false;

-- Update update_bot_state function to handle always_on
create or replace function update_bot_state(
  user_uuid uuid,
  is_running_param boolean,
  config_param jsonb,
  error_param text default null,
  always_on_param boolean default null
)
returns void as $$
begin
  insert into bot_state (user_id, is_running, config, last_run, error, always_on, updated_at)
  values (user_uuid, is_running_param, config_param, now(), error_param, 
    coalesce(always_on_param, (select always_on from bot_state where user_id = user_uuid), false), now())
  on conflict (user_id)
  do update set
    is_running = is_running_param,
    config = config_param,
    last_run = now(),
    error = error_param,
    always_on = coalesce(always_on_param, bot_state.always_on),
    updated_at = now();
end;
$$ language plpgsql security definer;

-- Update get_bot_state function to return always_on
create or replace function get_bot_state(user_uuid uuid)
returns table(
  is_running boolean,
  config jsonb,
  last_run timestamptz,
  error text,
  always_on boolean
) as $$
begin
  return query
  select 
    bs.is_running,
    bs.config,
    bs.last_run,
    bs.error,
    bs.always_on
  from bot_state bs
  where bs.user_id = user_uuid;
end;
$$ language plpgsql security definer;

-- Function to toggle always_on
create or replace function toggle_always_on(
  user_uuid uuid,
  always_on_param boolean
)
returns void as $$
begin
  update bot_state
  set always_on = always_on_param,
      updated_at = now()
  where user_id = user_uuid;
  
  -- If no row exists, create one
  if not found then
    insert into bot_state (user_id, always_on, updated_at)
    values (user_uuid, always_on_param, now());
  end if;
end;
$$ language plpgsql security definer;

-- Function to get all users with always_on enabled
create or replace function get_always_on_users()
returns table(
  user_id uuid,
  config jsonb,
  always_on boolean
) as $$
begin
  return query
  select 
    bs.user_id,
    bs.config,
    bs.always_on
  from bot_state bs
  where bs.always_on = true;
end;
$$ language plpgsql security definer;

