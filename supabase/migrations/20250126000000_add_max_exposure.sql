-- Add max_exposure column to user_settings table
-- This controls the maximum percentage of capital that can be deployed across all positions

alter table user_settings 
add column if not exists max_exposure numeric default 90;

comment on column user_settings.max_exposure is 'Maximum percentage of capital that can be deployed across all positions (default 90%)';

