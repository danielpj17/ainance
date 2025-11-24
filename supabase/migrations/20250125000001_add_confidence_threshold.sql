-- Add confidence_threshold column to user_settings
alter table user_settings 
add column if not exists confidence_threshold numeric default 0.55;

-- Add check constraint for confidence threshold (0.0 to 1.0)
alter table user_settings 
add constraint check_confidence_threshold 
check (confidence_threshold >= 0.0 and confidence_threshold <= 1.0);

-- Update comment
comment on column user_settings.confidence_threshold is 'Minimum confidence threshold (0.0-1.0) for ML trading signals. Default: 0.55 (55%)';

