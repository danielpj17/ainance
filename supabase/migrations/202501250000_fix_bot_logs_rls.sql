-- Fix bot_logs RLS to allow service role inserts
-- This migration ensures bot_logs table exists and creates a security definer function

-- Create bot_logs table if it doesn't exist (in case the base migration wasn't run)
create table if not exists bot_logs (
  id bigint primary key generated always as identity,
  user_id uuid references auth.users not null,
  action text not null,
  message text,
  data jsonb,
  config jsonb,
  created_at timestamptz default now()
);

-- Enable RLS if not already enabled
alter table bot_logs enable row level security;

-- Create indexes if they don't exist
create index if not exists idx_bot_logs_user_created on bot_logs(user_id, created_at desc);
create index if not exists idx_bot_logs_action on bot_logs(action);

-- Create RLS policies if they don't exist
do $$
begin
  if not exists (
    select 1 from pg_policies 
    where schemaname = 'public'
    and tablename = 'bot_logs' 
    and policyname = 'Users can view own bot logs'
  ) then
    create policy "Users can view own bot logs" on bot_logs 
      for select using (auth.uid() = user_id);
  end if;
  
  if not exists (
    select 1 from pg_policies 
    where schemaname = 'public'
    and tablename = 'bot_logs' 
    and policyname = 'Users can insert own bot logs'
  ) then
    create policy "Users can insert own bot logs" on bot_logs 
      for insert with check (auth.uid() = user_id);
  end if;
end $$;

-- Create a security definer function to insert bot logs (bypasses RLS)
create or replace function insert_bot_log(
  user_uuid uuid,
  action_param text,
  message_param text default null,
  data_param jsonb default null,
  config_param jsonb default null
)
returns void as $$
begin
  insert into bot_logs (user_id, action, message, data, config, created_at)
  values (user_uuid, action_param, message_param, data_param, config_param, now());
end;
$$ language plpgsql security definer;

-- Grant execute permission
grant execute on function insert_bot_log(uuid, text, text, jsonb, jsonb) to authenticated;
grant execute on function insert_bot_log(uuid, text, text, jsonb, jsonb) to anon;
grant execute on function insert_bot_log(uuid, text, text, jsonb, jsonb) to service_role;

-- Enable realtime for bot_logs if not already enabled
do $$
begin
  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' 
    and schemaname = 'public' 
    and tablename = 'bot_logs'
  ) then
    alter publication supabase_realtime add table bot_logs;
  end if;
end $$;

