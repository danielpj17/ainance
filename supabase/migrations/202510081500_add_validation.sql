-- Add validation constraints and update user_settings table
-- This migration adds validation for strategy selection rules

-- Add check constraints for strategy validation
alter table user_settings 
add constraint check_strategy 
check (strategy in ('cash', '25k_plus'));

-- Add check constraints for account_type validation
alter table user_settings 
add constraint check_account_type 
check (account_type in ('cash', 'margin'));

-- Add check constraints for numeric ranges
alter table user_settings 
add constraint check_max_trade_size 
check (max_trade_size > 0);

alter table user_settings 
add constraint check_daily_loss_limit 
check (daily_loss_limit <= 0);

alter table user_settings 
add constraint check_take_profit 
check (take_profit > 0);

alter table user_settings 
add constraint check_stop_loss 
check (stop_loss > 0);

-- Add check constraint for $25k+ rules validation
-- If strategy is '25k_plus', max_trade_size must be >= 5000
alter table user_settings 
add constraint check_25k_plus_min_trade_size 
check (
  (strategy = 'cash') or 
  (strategy = '25k_plus' and max_trade_size >= 5000)
);

-- Add trigger function for validation warnings
create or replace function validate_user_settings()
returns trigger as $$
begin
  -- Warn if margin account is selected with under $25k strategy
  if new.account_type = 'margin' and new.strategy = 'cash' then
    raise warning 'Margin account selected with cash trading strategy - PDT risks apply';
  end if;
  
  return new;
end;
$$ language plpgsql;

-- Create trigger for validation
create trigger trigger_validate_user_settings
  before insert or update on user_settings
  for each row
  execute function validate_user_settings();

-- Add updated_at trigger
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trigger_update_user_settings_updated_at
  before update on user_settings
  for each row
  execute function update_updated_at_column();
