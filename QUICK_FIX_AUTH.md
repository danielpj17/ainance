# Quick Fix: Disable Authentication for Testing

## Step 1: Update API Routes (Already Done ✅)

The API routes have been updated to skip authentication checks.

## Step 2: Disable Database RLS (Row Level Security)

Your Supabase database has security policies that are still blocking access. You need to temporarily disable them.

### Run This SQL in Supabase

1. **Go to Supabase Dashboard** → https://supabase.com/dashboard
2. Select your project
3. Click **SQL Editor** in the sidebar
4. Click **"New query"**
5. Copy and paste this SQL:

```sql
-- TEMPORARY: Disable RLS for testing
ALTER TABLE user_watchlists DISABLE ROW LEVEL SECURITY;
ALTER TABLE watchlist_symbols DISABLE ROW LEVEL SECURITY;
```

6. Click **"Run"** or press Cmd/Ctrl + Enter
7. You should see: "Success. No rows returned"

### That's It!

Now your watchlist should work without authentication.

---

## Step 3: Test Your Watchlist

After running the SQL:

1. **Go to your watchlist page:**
   ```
   https://your-app.vercel.app/dashboard/watchlist
   ```

2. **You should see:**
   - A default watchlist created automatically
   - Real stock prices for AAPL, MSFT, GOOGL
   - Ability to search and add more stocks
   - No more "Unauthorized" errors

---

## What Was Changed

### API Routes Modified:
- ✅ `/api/watchlists` - GET, POST, DELETE
- ✅ `/api/watchlists/symbols` - POST, DELETE  
- ✅ `/api/stocks/quotes` - GET
- ✅ `/api/stocks/search` - GET

### Changes Made:
- Removed `401 Unauthorized` responses
- Use test user ID `00000000-0000-0000-0000-000000000000` when not authenticated
- Added `// TEMPORARY: Skip auth check for testing` comments

### Database Changes:
- Disabled RLS on `user_watchlists` table
- Disabled RLS on `watchlist_symbols` table

---

## Re-enable Authentication Later

When you want to re-enable authentication:

### 1. Re-enable Database RLS

Run this SQL in Supabase:

```sql
ALTER TABLE user_watchlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE watchlist_symbols ENABLE ROW LEVEL SECURITY;
```

### 2. Revert API Changes

Search for `// TEMPORARY: Skip auth check` in these files and restore the auth checks:
- `app/api/watchlists/route.ts`
- `app/api/watchlists/symbols/route.ts`
- `app/api/stocks/quotes/route.ts`
- `app/api/stocks/search/route.ts`

Replace:
```typescript
// TEMPORARY: Skip auth check for testing
const { data: { user }, error: userError } = await supabase.auth.getUser();
const userId = user?.id || '00000000-0000-0000-0000-000000000000';
```

With:
```typescript
const { data: { user }, error: userError } = await supabase.auth.getUser();
if (userError || !user) {
  return NextResponse.json(
    { success: false, error: 'Unauthorized' },
    { status: 401 }
  );
}
const userId = user.id;
```

---

## Troubleshooting

### Still getting errors after disabling RLS?

**Check if SQL ran successfully:**
1. In Supabase SQL Editor, run:
   ```sql
   SELECT tablename, rowsecurity 
   FROM pg_tables 
   WHERE schemaname = 'public' 
   AND tablename IN ('user_watchlists', 'watchlist_symbols');
   ```
2. Both should show `rowsecurity: false`

**Clear browser cache:**
- Hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
- Or clear all browser data for the site

**Redeploy on Vercel:**
- Go to Vercel → Deployments → Latest → "..." → Redeploy
- Wait for deployment to complete

### Database errors?

Make sure the tables exist:
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('user_watchlists', 'watchlist_symbols');
```

If they don't exist, run the migrations from `supabase/all_migrations.sql`

---

## Current Status

After these changes:
- ✅ No login required
- ✅ Watchlist APIs work without authentication
- ✅ Stock data fetched from Alpaca using environment variables
- ✅ Can add/remove stocks from watchlist
- ⚠️ **WARNING:** Anyone can access and modify data (testing only!)

---

## Security Warning

**🚨 IMPORTANT:** These changes remove all security!

- Anyone can view/edit watchlists
- No user separation
- All data uses test user ID

**Only use this for testing!**

Before deploying to production or sharing the URL:
1. Re-enable RLS
2. Restore authentication checks
3. Test login flow works properly

---

## Quick Test

After running the SQL, test these:

1. **View watchlist:**
   - Go to `/dashboard/watchlist`
   - Should see default watchlist with stocks
   - Should see real prices (during market hours)

2. **Search stocks:**
   - Type "TSLA" in search box
   - Should see Tesla in results
   - Click "Add" - should add to watchlist

3. **Remove stock:**
   - Click trash icon on any stock
   - Should remove from watchlist

All of this should work **without logging in**! 🎉

