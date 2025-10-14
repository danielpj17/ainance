# Watchlist Setup for Vercel Deployment

## Quick Setup Guide (3 Steps)

### Step 1: Apply Database Migrations to Supabase

Your database migrations need to be applied to your **production Supabase database** (this is the same database your Vercel app uses).

1. **Go to your Supabase Dashboard:**
   - Open https://supabase.com/dashboard
   - Select your project
   - Click on **SQL Editor** in the left sidebar

2. **Run the migrations:**
   - Click **"New query"** button
   - Copy the entire contents of `supabase/all_migrations.sql` from your repo
   - Paste into the SQL editor
   - Click **"Run"** (or press Cmd/Ctrl + Enter)
   - Wait for "Success. No rows returned" message

✅ This creates all necessary tables including `user_watchlists` and `watchlist_symbols`

### Step 2: Verify Vercel Environment Variables

Make sure your Vercel deployment has the correct environment variables:

1. **Go to Vercel Dashboard:**
   - Open https://vercel.com
   - Select your `ainance` project
   - Go to **Settings** → **Environment Variables**

2. **Verify these variables exist:**
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   ```

3. **If missing, add them:**
   - Get these values from your Supabase Dashboard → Settings → API
   - Add each one in Vercel with scope: **Production**, **Preview**, **Development**

4. **Redeploy if you added/changed variables:**
   - Go to **Deployments** tab
   - Click the **"..."** menu on latest deployment
   - Click **"Redeploy"**
   - Or push a new commit to trigger redeployment

### Step 3: Add API Keys Through Your Deployed App

Now use your **live Vercel app** (not localhost):

1. **Visit your deployed app:**
   ```
   https://your-app.vercel.app/auth
   ```

2. **Sign in or create an account**
   - If you don't have an account, create one
   - If you already have one, sign in

3. **Go to Settings:**
   ```
   https://your-app.vercel.app/settings
   ```

4. **Add your Alpaca Paper Trading API keys:**
   - Click the **"API Keys"** tab
   - Enter your **Alpaca Paper Key** (starts with `PK...`)
   - Enter your **Alpaca Paper Secret**
   - Leave Live Trading keys empty (not needed for paper trading)
   - Click **"Save API Keys"**
   - You should see a success message

5. **Navigate to Watchlist:**
   ```
   https://your-app.vercel.app/dashboard/watchlist
   ```

6. **Verify it works:**
   - The page should automatically create a default watchlist with AAPL, MSFT, GOOGL
   - After a few seconds, you should see real prices appear
   - Green/red indicators show price changes
   - You can search for stocks and add them

---

## Troubleshooting for Vercel Deployment

### Issue: "Unauthorized" errors

**Solution:**
1. Make sure you're logged in to your deployed app
2. Check browser console for auth errors
3. Try logging out and back in
4. Verify Supabase environment variables are set in Vercel

### Issue: "Alpaca API keys not configured"

**Solution:**
1. Go to `https://your-app.vercel.app/settings`
2. Add your API keys again through the UI
3. Make sure you clicked "Save API Keys"
4. Refresh the watchlist page

### Issue: "Failed to load watchlists" or database errors

**Solution:**
1. Verify migrations were applied successfully in Supabase
2. In Supabase Dashboard → Table Editor, check if these tables exist:
   - `user_watchlists`
   - `watchlist_symbols`
   - `user_settings`
   - `trades`
   - `predictions`
   - `backtests`
3. If tables are missing, re-run the migration from Step 1

### Issue: No price data (loading spinners forever)

**Possible causes:**
1. **Market is closed** - Alpaca data may be delayed or unavailable outside market hours
   - Market hours: 9:30 AM - 4:00 PM ET, Monday-Friday
2. **Invalid API keys** - Check your Alpaca dashboard to verify keys are active
3. **API rate limiting** - Wait a few minutes and refresh

**Solution:**
- Verify API keys in Settings
- Try during market hours
- Check browser console for specific error messages
- Check Vercel Function logs:
  - Go to Vercel Dashboard → Deployments → Latest → Functions
  - Look for errors from `/api/stocks/quotes`

### Issue: Environment variable changes don't take effect

**Solution:**
1. After changing environment variables in Vercel, you **must redeploy**
2. Go to Deployments → Latest → "..." menu → Redeploy
3. Or push a new commit to trigger automatic deployment

### Issue: Search returns no results

**Solution:**
- The search uses a built-in database of 100+ popular stocks
- Try these guaranteed-to-work stocks:
  - **Tech:** AAPL, MSFT, GOOGL, AMZN, TSLA, NVDA, META
  - **Finance:** JPM, BAC, V, MA, GS
  - **ETFs:** SPY, QQQ, VTI
- If you need more stocks, they can be added to `app/api/stocks/search/route.ts`

---

## Checking Vercel Function Logs

If you encounter errors, check your Vercel function logs:

1. **Go to Vercel Dashboard** → Your project
2. Click **Deployments** → Select latest deployment
3. Click **Functions** tab
4. Look for these functions:
   - `/api/watchlists` - Creates and fetches watchlists
   - `/api/watchlists/symbols` - Adds/removes symbols
   - `/api/stocks/quotes` - Fetches real-time prices
   - `/api/stocks/search` - Searches for stocks
5. Click on any function to see its logs and errors

---

## What Gets Stored Where

**Supabase Database (Production):**
- Your watchlist names and settings (`user_watchlists`)
- Stock symbols in your watchlists (`watchlist_symbols`)
- Your API keys (encrypted in `user_settings`)
- User authentication

**Alpaca (via API):**
- Real-time stock prices
- Market data (open, high, low, volume)
- No data is stored, only fetched on demand

**Vercel:**
- Hosts your Next.js app
- Runs API routes that fetch data
- No data storage (stateless)

---

## Data Flow

```
User visits watchlist page
    ↓
Vercel API fetches watchlist from Supabase
    ↓
Vercel API gets API keys from Supabase
    ↓
Vercel API calls Alpaca with those keys
    ↓
Alpaca returns real-time prices
    ↓
Vercel API sends prices to browser
    ↓
User sees real-time data
```

---

## Testing Your Deployment

After setup, test these features:

1. **Authentication:**
   - ✅ Can sign up / sign in
   - ✅ Settings page loads
   - ✅ Can save API keys

2. **Watchlist:**
   - ✅ Default watchlist appears with AAPL, MSFT, GOOGL
   - ✅ Real prices show up (not loading spinners)
   - ✅ Green/red indicators for price changes
   - ✅ Volume, High, Low columns show data

3. **Search:**
   - ✅ Can search for "TSLA"
   - ✅ Can add TSLA to watchlist
   - ✅ Can remove stocks from watchlist

4. **Persistence:**
   - ✅ Added stocks still there after page refresh
   - ✅ Watchlist persists across sessions

---

## Production Checklist

Before considering your watchlist production-ready:

- [ ] Database migrations applied in Supabase
- [ ] Vercel environment variables set correctly
- [ ] Can sign in to deployed app
- [ ] Can save Alpaca API keys in Settings
- [ ] Can access watchlist page
- [ ] See real price data (during market hours)
- [ ] Can search and add stocks
- [ ] Can remove stocks
- [ ] Data persists after refresh
- [ ] No console errors in browser
- [ ] No function errors in Vercel logs

---

## Getting Your Alpaca API Keys

If you don't have them yet:

1. **Go to Alpaca:**
   - Visit https://alpaca.markets
   - Sign up for a free account

2. **Get Paper Trading Keys:**
   - Go to Dashboard → Paper Trading
   - Click "Generate API Keys"
   - **Important:** Use PAPER trading keys, not LIVE trading keys
   - Copy both the API Key and Secret Key

3. **Add to Your App:**
   - Paste into your deployed app's Settings page
   - NOT in Vercel environment variables (they're stored encrypted in Supabase)

---

## Support & Next Steps

**Your deployed watchlist URL:**
```
https://your-app.vercel.app/dashboard/watchlist
```

**Other features to explore:**
- Dashboard: `/dashboard`
- Paper Trading: `/dashboard/paper`
- Live Trading View: `/dashboard/live`
- Strategy Settings: `/settings` → Strategy Settings tab

**If you need help:**
1. Check Vercel function logs for specific errors
2. Check browser console (F12) for client-side errors
3. Verify Supabase tables exist in Table Editor
4. Test API keys work at https://alpaca.markets (login and check dashboard)

---

## Migration SQL Quick Reference

If you need to check what tables should exist, here's what the migration creates:

**Core Tables:**
- `trades` - Trading history
- `user_settings` - User preferences and encrypted API keys
- `predictions` - AI model predictions
- `backtests` - Backtesting results
- `news_sentiment` - News sentiment data
- `ml_prediction_cache` - ML prediction cache

**Watchlist Tables (Required):**
- `user_watchlists` - Watchlist metadata
- `watchlist_symbols` - Symbols in watchlists

**Rate Limiting:**
- `api_rate_limits` - API rate limiting

All these are created when you run `supabase/all_migrations.sql` in Step 1.

