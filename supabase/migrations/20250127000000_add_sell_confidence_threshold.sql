-- Add sell_confidence_threshold column to user_settings
alter table user_settings 
add column if not exists sell_confidence_threshold numeric default 0.50;

-- Add check constraint for sell confidence threshold (0.0 to 1.0)
alter table user_settings 
add constraint check_sell_confidence_threshold 
check (sell_confidence_threshold >= 0.0 and sell_confidence_threshold <= 1.0);

-- Update comment
comment on column user_settings.sell_confidence_threshold is 'Minimum confidence threshold (0.0-1.0) for SELL signals. Default: 0.50 (50%). Lower than buy threshold to allow easier exits in risky markets.';

