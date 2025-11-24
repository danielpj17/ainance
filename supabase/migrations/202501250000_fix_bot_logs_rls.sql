-- Fix bot_logs RLS to allow service role inserts
-- Create a security definer function to insert bot logs

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

