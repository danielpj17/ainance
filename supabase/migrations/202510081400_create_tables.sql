-- Enable pgcrypto for encryption
create extension if not exists pgcrypto;

-- Create tables
create table trades (
id bigint primary key generated always as identity,
user_id uuid references auth.users not null,
symbol text not null,
action text not null,
qty numeric not null,
price numeric not null,
timestamp timestamptz not null,
strategy text not null,
account_type text not null,
created_at timestamptz default now()
);

create table user_settings (
user_id uuid primary key references auth.users not null,
api_mode text default 'paper',
strategy text default 'cash',
account_type text default 'cash',
max_trade_size numeric default 5000,
daily_loss_limit numeric default -2,
take_profit numeric default 0.5,
stop_loss numeric default 0.3,
news_api_key text,
alpaca_paper_key text,
alpaca_paper_secret text,
alpaca_live_key text,
alpaca_live_secret text,
updated_at timestamptz default now()
);

create table predictions (
id bigint primary key generated always as identity,
user_id uuid references auth.users not null,
symbol text not null,
signal text not null,
confidence numeric,
timestamp timestamptz not null,
created_at timestamptz default now()
);

create table backtests (
id bigint primary key generated always as identity,
user_id uuid references auth.users not null,
strategy text not null,
date_range jsonb not null,
metrics jsonb not null,
created_at timestamptz default now()
);

-- Enable RLS
alter table trades enable row level security;
alter table user_settings enable row level security;
alter table predictions enable row level security;
alter table backtests enable row level security;

-- RLS Policies
create policy "Users can view own trades" on trades for select using (auth.uid() = user_id);
create policy "Users can insert own trades" on trades for insert with check (auth.uid() = user_id);
create policy "Users can view own settings" on user_settings for select using (auth.uid() = user_id);
create policy "Users can update own settings" on user_settings for update using (auth.uid() = user_id);
create policy "Users can insert own settings" on user_settings for insert with check (auth.uid() = user_id);
create policy "Users can view own predictions" on predictions for select using (auth.uid() = user_id);
create policy "Users can insert own predictions" on predictions for insert with check (auth.uid() = user_id);
create policy "Users can view own backtests" on backtests for select using (auth.uid() = user_id);
create policy "Users can insert own backtests" on backtests for insert with check (auth.uid() = user_id);
