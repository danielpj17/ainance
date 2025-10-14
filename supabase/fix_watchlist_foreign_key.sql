-- Fix watchlist foreign key constraint for testing
-- Run this in Supabase SQL Editor

-- Option 1: Temporarily drop the foreign key constraint
ALTER TABLE user_watchlists DROP CONSTRAINT IF EXISTS user_watchlists_user_id_fkey;

-- Option 2: Create a test user if it doesn't exist
INSERT INTO auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  recovery_sent_at,
  last_sign_in_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'test@example.com',
  crypt('testpassword123', gen_salt('bf')),
  NOW(),
  NOW(),
  NOW(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  NOW(),
  NOW(),
  '',
  '',
  '',
  ''
) ON CONFLICT (id) DO NOTHING;

-- Option 3: If you want to re-add the foreign key constraint later, run:
-- ALTER TABLE user_watchlists ADD CONSTRAINT user_watchlists_user_id_fkey 
-- FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
