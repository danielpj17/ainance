-- Create bot_logs table for tracking bot activity
create table if not exists bot_logs (
  id bigint primary key generated always as identity,
  user_id uuid references auth.users not null,
  action text not null,
  message text,
  data jsonb,
  config jsonb,
  created_at timestamptz default now()
);

-- Create bot_state table for persisting bot configuration
create table if not exists bot_state (
  user_id uuid primary key references auth.users not null,
  is_running boolean default false,
  config jsonb,
  last_run timestamptz,
  error text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Enable RLS
alter table bot_logs enable row level security;
alter table bot_state enable row level security;

-- RLS Policies for bot_logs
create policy "Users can view own bot logs" on bot_logs 
  for select using (auth.uid() = user_id);
  
create policy "Users can insert own bot logs" on bot_logs 
  for insert with check (auth.uid() = user_id);

-- RLS Policies for bot_state
create policy "Users can view own bot state" on bot_state 
  for select using (auth.uid() = user_id);
  
create policy "Users can insert own bot state" on bot_state 
  for insert with check (auth.uid() = user_id);
  
create policy "Users can update own bot state" on bot_state 
  for update using (auth.uid() = user_id);

-- Create indexes
create index if not exists idx_bot_logs_user_created on bot_logs(user_id, created_at desc);
create index if not exists idx_bot_logs_action on bot_logs(action);

-- Function to update bot state
create or replace function update_bot_state(
  user_uuid uuid,
  is_running_param boolean,
  config_param jsonb,
  error_param text default null
)
returns void as $$
begin
  insert into bot_state (user_id, is_running, config, last_run, error, updated_at)
  values (user_uuid, is_running_param, config_param, now(), error_param, now())
  on conflict (user_id)
  do update set
    is_running = is_running_param,
    config = config_param,
    last_run = now(),
    error = error_param,
    updated_at = now();
end;
$$ language plpgsql security definer;

-- Function to get bot state
create or replace function get_bot_state(user_uuid uuid)
returns table(
  is_running boolean,
  config jsonb,
  last_run timestamptz,
  error text
) as $$
begin
  return query
  select 
    bs.is_running,
    bs.config,
    bs.last_run,
    bs.error
  from bot_state bs
  where bs.user_id = user_uuid;
end;
$$ language plpgsql security definer;

-- Add trigger to update updated_at timestamp
create or replace function update_bot_state_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trigger_update_bot_state_updated_at
  before update on bot_state
  for each row
  execute function update_bot_state_updated_at();

-- Enable realtime for bot_logs
alter publication supabase_realtime add table bot_logs;
alter publication supabase_realtime add table bot_state;

