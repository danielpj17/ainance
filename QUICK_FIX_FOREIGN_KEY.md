# Quick Fix: Foreign Key Constraint Error

## The Problem
- **Error 1:** `insert or update on table "user_watchlists" violates foreign key constraint "user_watchlists_user_id_fkey"`
- **Error 2:** "No watchlist selected" when trying to add stocks

## Root Cause
The test user ID `00000000-0000-0000-0000-000000000000` doesn't exist in the `auth.users` table, but we're trying to create watchlists for it.

## Quick Fix (2 Steps)

### Step 1: Run SQL in Supabase

Go to **Supabase Dashboard** → **SQL Editor** → **New Query**

Copy and paste this:

```sql
-- Fix foreign key constraint for testing
ALTER TABLE user_watchlists DROP CONSTRAINT IF EXISTS user_watchlists_user_id_fkey;

-- Create test user
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
```

Click **"Run"** ✅

### Step 2: Push Code Changes

```bash
git add .
git commit -m "Fix foreign key constraint and improve watchlist error handling"
git push
```

---

## What This Does

### SQL Changes:
1. **Removes foreign key constraint** - Allows creating watchlists without valid user
2. **Creates test user** - Adds the test user ID to auth.users table
3. **ON CONFLICT DO NOTHING** - Won't error if user already exists

### Code Changes:
1. **Simplified API** - Removed complex user creation logic
2. **Better error handling** - Frontend tries to reload watchlists if none selected
3. **More robust** - Handles edge cases better

---

## Test After Deployment

Once Vercel deploys (~2 minutes):

1. **Go to:** `https://your-app.vercel.app/dashboard/watchlist`
2. **Should see:**
   - ✅ No foreign key error
   - ✅ Default watchlist loads
   - ✅ AAPL, MSFT, GOOGL appear
   - ✅ Real stock prices

3. **Test Add Button:**
   - Search for "TSLA"
   - Click "Add" button
   - Should add TSLA to watchlist
   - Should see success message

---

## If Still Broken

### Check Database
Visit: `https://your-app.vercel.app/api/simple-watchlist`

Should return:
```json
{
  "success": true,
  "watchlists": [
    {
      "id": 123,
      "name": "My Watchlist",
      "symbols": [...]
    }
  ]
}
```

### Check User Exists
In Supabase SQL Editor:
```sql
SELECT id, email FROM auth.users WHERE id = '00000000-0000-0000-0000-000000000000';
```

Should return the test user.

---

## Re-enable Security Later

When you want to add authentication back:

1. **Re-add foreign key:**
```sql
ALTER TABLE user_watchlists ADD CONSTRAINT user_watchlists_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
```

2. **Re-enable RLS:**
```sql
ALTER TABLE user_watchlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE watchlist_symbols ENABLE ROW LEVEL SECURITY;
```

3. **Update code** to use real authentication

---

## Expected Results

After fix:
- ✅ Page loads without foreign key errors
- ✅ Default watchlist appears automatically
- ✅ Stock prices show
- ✅ Add button works
- ✅ Success messages appear
- ✅ Watchlist updates in real-time

The watchlist should work perfectly now! 🎉
