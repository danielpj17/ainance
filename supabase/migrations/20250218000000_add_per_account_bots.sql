-- Migration: Add per-account bot state and strategy settings
-- This enables independent bots and settings for each paper trading account

-- 1. Create account_bot_state table for per-account bot management
create table if not exists account_bot_state (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references paper_trading_accounts(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  
  -- Bot state
  is_running boolean default false not null,
  always_on boolean default false not null,
  
  -- Bot configuration (symbols, interval, etc.)
  config jsonb,
  
  -- Tracking
  last_run timestamptz,
  error text,
  
  -- Timestamps
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  
  -- Ensure one bot state per account
  constraint unique_account_bot_state unique (account_id)
);

-- Create indexes for performance
create index if not exists idx_account_bot_state_account_id on account_bot_state(account_id);
create index if not exists idx_account_bot_state_user_id on account_bot_state(user_id);
create index if not exists idx_account_bot_state_always_on on account_bot_state(always_on) where always_on = true;
create index if not exists idx_account_bot_state_is_running on account_bot_state(is_running) where is_running = true;

-- Enable RLS
alter table account_bot_state enable row level security;

-- RLS Policies for account_bot_state
create policy "Users can view own account bot state" on account_bot_state
  for select using (auth.uid() = user_id);

create policy "Users can insert own account bot state" on account_bot_state
  for insert with check (auth.uid() = user_id);

create policy "Users can update own account bot state" on account_bot_state
  for update using (auth.uid() = user_id);

create policy "Users can delete own account bot state" on account_bot_state
  for delete using (auth.uid() = user_id);

-- 2. Create account_strategy_settings table for per-account trading strategies
create table if not exists account_strategy_settings (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references paper_trading_accounts(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  
  -- Trading strategy
  strategy text default 'cash' not null check (strategy in ('cash', '25k_plus')),
  account_type text default 'cash' not null check (account_type in ('cash', 'margin')),
  
  -- Confidence thresholds
  confidence_threshold numeric default 0.65 check (confidence_threshold >= 0 and confidence_threshold <= 1),
  sell_confidence_threshold numeric default 0.50 check (sell_confidence_threshold >= 0 and sell_confidence_threshold <= 1),
  
  -- Risk management
  max_exposure numeric default 90 check (max_exposure >= 0 and max_exposure <= 100),
  
  -- Timestamps
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  
  -- Ensure one settings per account
  constraint unique_account_strategy_settings unique (account_id)
);

-- Create indexes
create index if not exists idx_account_strategy_settings_account_id on account_strategy_settings(account_id);
create index if not exists idx_account_strategy_settings_user_id on account_strategy_settings(user_id);

-- Enable RLS
alter table account_strategy_settings enable row level security;

-- RLS Policies for account_strategy_settings
create policy "Users can view own account strategy settings" on account_strategy_settings
  for select using (auth.uid() = user_id);

create policy "Users can insert own account strategy settings" on account_strategy_settings
  for insert with check (auth.uid() = user_id);

create policy "Users can update own account strategy settings" on account_strategy_settings
  for update using (auth.uid() = user_id);

create policy "Users can delete own account strategy settings" on account_strategy_settings
  for delete using (auth.uid() = user_id);

-- 3. Add triggers to update updated_at timestamps

-- Trigger for account_bot_state
create or replace function update_account_bot_state_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trigger_update_account_bot_state_updated_at
  before update on account_bot_state
  for each row
  execute function update_account_bot_state_updated_at();

-- Trigger for account_strategy_settings
create or replace function update_account_strategy_settings_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trigger_update_account_strategy_settings_updated_at
  before update on account_strategy_settings
  for each row
  execute function update_account_strategy_settings_updated_at();

-- 4. Create default strategy settings for existing accounts
insert into account_strategy_settings (account_id, user_id, strategy, account_type, confidence_threshold, sell_confidence_threshold, max_exposure)
select 
  pta.id as account_id,
  pta.user_id,
  'cash' as strategy,
  'cash' as account_type,
  0.65 as confidence_threshold,
  0.50 as sell_confidence_threshold,
  90 as max_exposure
from paper_trading_accounts pta
where not exists (
  select 1 from account_strategy_settings ass
  where ass.account_id = pta.id
);

-- Add comments
comment on table account_bot_state is 'Per-account bot state - enables independent bots for each paper trading account';
comment on table account_strategy_settings is 'Per-account strategy settings - enables different trading strategies for each account';

