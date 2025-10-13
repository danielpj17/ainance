-- Disable foreign key constraint for testing
-- Run this in Supabase SQL Editor

-- Drop the foreign key constraint completely
ALTER TABLE user_watchlists DROP CONSTRAINT IF EXISTS user_watchlists_user_id_fkey;

-- Verify it's gone
SELECT conname, contype 
FROM pg_constraint 
WHERE conrelid = 'user_watchlists'::regclass 
AND contype = 'f';
