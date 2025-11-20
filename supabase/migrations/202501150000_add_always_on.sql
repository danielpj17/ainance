-- Create bot_state table if it doesn't exist (for users who haven't run the base migration)
create table if not exists bot_state (
  user_id uuid primary key references auth.users not null,
  is_running boolean default false,
  config jsonb,
  last_run timestamptz,
  error text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Enable RLS (safe to run even if already enabled)
alter table bot_state enable row level security;

-- Add RLS policies if they don't exist
do $$
begin
  if not exists (
    select 1 from pg_policies 
    where schemaname = 'public'
    and tablename = 'bot_state' 
    and policyname = 'Users can view own bot state'
  ) then
    create policy "Users can view own bot state" on bot_state 
      for select using (auth.uid() = user_id);
  end if;
  
  if not exists (
    select 1 from pg_policies 
    where schemaname = 'public'
    and tablename = 'bot_state' 
    and policyname = 'Users can insert own bot state'
  ) then
    create policy "Users can insert own bot state" on bot_state 
      for insert with check (auth.uid() = user_id);
  end if;
  
  if not exists (
    select 1 from pg_policies 
    where schemaname = 'public'
    and tablename = 'bot_state' 
    and policyname = 'Users can update own bot state'
  ) then
    create policy "Users can update own bot state" on bot_state 
      for update using (auth.uid() = user_id);
  end if;
end $$;

-- Create trigger function if it doesn't exist
create or replace function update_bot_state_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Create trigger if it doesn't exist
drop trigger if exists trigger_update_bot_state_updated_at on bot_state;
create trigger trigger_update_bot_state_updated_at
  before update on bot_state
  for each row
  execute function update_bot_state_updated_at();

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
returns boolean as $$
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
  
  return true;
end;
$$ language plpgsql security definer;

-- Grant execute permission to authenticated users
grant execute on function toggle_always_on(uuid, boolean) to authenticated;
grant execute on function toggle_always_on(uuid, boolean) to anon;

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

