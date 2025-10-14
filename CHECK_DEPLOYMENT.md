# ✅ Deployment Checklist

## Step 1: Find Your Vercel URL

Your app should be deployed at one of these:
- `https://ainance.vercel.app`
- `https://ainance-[your-username].vercel.app`

**Find it here:** https://vercel.com/dashboard

---

## Step 2: Check Environment Variables

Go to: **Vercel Dashboard → ainance → Settings → Environment Variables**

You MUST have these set:

### Required Variables:
```
✓ NEXT_PUBLIC_SUPABASE_URL
✓ NEXT_PUBLIC_SUPABASE_ANON_KEY  ← CRITICAL!
✓ SUPABASE_SERVICE_ROLE_KEY
✓ ALPACA_PAPER_KEY
✓ ALPACA_PAPER_SECRET
```

### Optional Variables:
```
- ML_SERVICE_URL (not needed until you deploy ML service)
- MARKET_UPDATE_INTERVAL
- ML_CACHE_TTL
```

---

## Step 3: Test These Pages

### `/test-ml` - NEW ML Testing Page
**URL:** `https://your-app.vercel.app/test-ml`

**What you should see:**
- 🤖 ML Model Testing header
- ML Service Status card (will show offline - that's OK!)
- Input box for stock symbols
- Model information:
  - Training Data: 100 stocks
  - Total Samples: 43,679
  - Test Accuracy: 61.8%
  - Features: 13 technical indicators

**ML Service will be offline** because we haven't deployed it to Google Cloud Run yet. That's expected!

### `/settings` - Settings Page
**URL:** `https://your-app.vercel.app/settings`

**Should show:**
- API Keys configuration form
- Trading parameters
- Save settings button

**If you see an error about Supabase**, you need to add environment variables (see Step 2)

### `/dashboard` - Dashboard
**URL:** `https://your-app.vercel.app/dashboard`

**Should show:**
- Account overview
- Trading interface

### `/auth` - Authentication
**URL:** `https://your-app.vercel.app/auth`

**Should show:**
- Login/Sign up forms

---

## Step 4: If Environment Variables Are Missing

1. Go to Vercel Dashboard
2. Click your project → Settings → Environment Variables
3. Click **Add New**
4. Add each variable:

**Get your Supabase Anon Key:**
- Go to: https://app.supabase.com/project/hukefaaxifspkybahqux/settings/api
- Copy the **`anon public`** key (NOT service_role)
- Paste as `NEXT_PUBLIC_SUPABASE_ANON_KEY`

5. After adding ALL variables, click **Redeploy** at the top

---

## What's New in This Deployment

✅ **ML Testing Page** (`/test-ml`) - NEW!
✅ **100-stock trained model** (ready but not deployed)
✅ **Enhanced prediction API** with caching
✅ **Watchlist database tables** (migrations applied)
✅ **Rate limiting system**
✅ **Performance monitoring**
✅ **Real-time price components** (ready for market data aggregator)

---

## Next Steps

1. ✅ Verify Vercel deployment works
2. ⏳ Deploy ML service to Google Cloud Run (optional)
3. ⏳ Deploy market data aggregator to Railway (optional)

---

## Troubleshooting

### "Missing Supabase environment variables"
→ Add `NEXT_PUBLIC_SUPABASE_ANON_KEY` in Vercel settings

### "Page not found" for /test-ml
→ Wait 1-2 minutes for deployment to complete, then refresh

### "ML Service Offline"
→ Expected! We haven't deployed it yet. That's fine for now.

---

## Summary

Your Vercel deployment includes:
- Complete Next.js trading app
- ML testing interface
- Database with all migrations
- Ready for ML service integration

The ML predictions will work once you deploy the ML service to Google Cloud Run!

