-- Fix the update_user_api_keys function to resolve column ambiguity
-- The issue is that parameter names conflict with column names

drop function if exists update_user_api_keys(uuid, text, text, text, text, text);

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
  insert into user_settings (
    user_id,
    alpaca_paper_key_encrypted,
    alpaca_paper_secret_encrypted,
    alpaca_live_key_encrypted,
    alpaca_live_secret_encrypted,
    news_api_key_encrypted
  ) values (
    user_uuid,
    encrypt_api_key(p_alpaca_paper_key),
    encrypt_api_key(p_alpaca_paper_secret),
    encrypt_api_key(p_alpaca_live_key),
    encrypt_api_key(p_alpaca_live_secret),
    encrypt_api_key(p_news_api_key)
  )
  on conflict (user_id) do update set
    alpaca_paper_key_encrypted = encrypt_api_key(p_alpaca_paper_key),
    alpaca_paper_secret_encrypted = encrypt_api_key(p_alpaca_paper_secret),
    alpaca_live_key_encrypted = encrypt_api_key(p_alpaca_live_key),
    alpaca_live_secret_encrypted = encrypt_api_key(p_alpaca_live_secret),
    news_api_key_encrypted = encrypt_api_key(p_news_api_key),
    updated_at = now();
end;
$$ language plpgsql security definer;
