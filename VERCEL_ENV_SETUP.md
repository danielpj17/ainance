# Vercel Environment Variables Setup

## Add These Environment Variables to Vercel

Go to your **Vercel Dashboard** → Your Project → **Settings** → **Environment Variables**

Add the following variables:

### Required Variables

#### 1. Supabase Configuration
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

**Where to find these:**
- Go to Supabase Dashboard → Settings → API
- Copy the URL, anon key, and service_role key

#### 2. Alpaca API Keys (Paper Trading)
```
ALPACA_PAPER_KEY=PKxxxxxxxxxxxxxxxxxx
ALPACA_PAPER_SECRET=your_alpaca_paper_secret_key
```

**Where to find these:**
- Go to https://alpaca.markets
- Sign in → Paper Trading → API Keys
- Generate new API keys if needed
- **Important:** Use PAPER trading keys, not LIVE keys

### Optional Variables

#### 3. News API (Optional - for sentiment analysis)
```
NEWS_API_KEY=your_newsapi_key
```

**Where to get:**
- Go to https://newsapi.org
- Sign up for free
- Copy your API key

---

## How to Add Variables in Vercel

### Method 1: Through Vercel Dashboard

1. **Go to Vercel Dashboard:**
   - Open https://vercel.com
   - Select your `ainance` project

2. **Navigate to Environment Variables:**
   - Click **Settings** tab
   - Click **Environment Variables** in sidebar

3. **Add Each Variable:**
   - Click **"Add New"** button
   - Enter the **Name** (e.g., `ALPACA_PAPER_KEY`)
   - Enter the **Value** (your actual API key)
   - Select environments: ✅ **Production**, ✅ **Preview**, ✅ **Development**
   - Click **"Save"**

4. **Repeat for all variables above**

5. **Redeploy your app:**
   - Go to **Deployments** tab
   - Click the **"..."** menu on your latest deployment
   - Click **"Redeploy"**
   - Wait for deployment to complete

### Method 2: Through Vercel CLI (Advanced)

```bash
# Install Vercel CLI if you haven't
npm i -g vercel

# Login to Vercel
vercel login

# Add environment variables
vercel env add ALPACA_PAPER_KEY
vercel env add ALPACA_PAPER_SECRET
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
vercel env add SUPABASE_SERVICE_ROLE_KEY

# Redeploy
vercel --prod
```

---

## After Adding Environment Variables

### 1. Verify Variables Are Set

In your Vercel project:
- Go to **Settings** → **Environment Variables**
- You should see all 5 variables listed (or more if you added optional ones)

### 2. Trigger a Redeploy

**Important:** Environment variables only take effect after redeployment!

**Option A - Redeploy existing:**
- Deployments → Latest → "..." → Redeploy

**Option B - Push new commit:**
```bash
git commit --allow-empty -m "Update environment variables"
git push
```

### 3. Test Your Deployment

Once redeployed, test your watchlist:

1. Go to `https://your-app.vercel.app/auth` and login
2. Go to `https://your-app.vercel.app/dashboard/watchlist`
3. You should see:
   - Default watchlist with stocks
   - Real prices loading from Alpaca
   - Green/red price change indicators
   - No "API keys not configured" errors

---

## Troubleshooting

### Issue: Still seeing "API keys not configured"

**Solution:**
1. Double-check variable names are exactly correct (case-sensitive)
   - ✅ `ALPACA_PAPER_KEY` (correct)
   - ❌ `ALPACA_PAPER_KEYS` (wrong - extra 'S')
2. Make sure you redeployed after adding variables
3. Check Vercel function logs for specific errors

### Issue: "Unauthorized" from Alpaca

**Solution:**
1. Verify your Alpaca API keys are active
2. Login to https://alpaca.markets and check your dashboard
3. Make sure you're using **Paper Trading** keys, not Live keys
4. Try generating new API keys

### Issue: Variables not showing in Vercel

**Solution:**
1. Make sure you clicked "Save" after entering each variable
2. Refresh the page
3. Check you're in the correct project

### Issue: Deployment fails after adding variables

**Solution:**
1. Check deployment logs in Vercel → Deployments → Latest → Build Logs
2. Look for specific error messages
3. Make sure variable values don't contain special characters that need escaping
4. Verify all Supabase variables are correct

---

## Quick Checklist

Before testing your watchlist:

- [ ] Added `NEXT_PUBLIC_SUPABASE_URL` to Vercel
- [ ] Added `NEXT_PUBLIC_SUPABASE_ANON_KEY` to Vercel
- [ ] Added `SUPABASE_SERVICE_ROLE_KEY` to Vercel
- [ ] Added `ALPACA_PAPER_KEY` to Vercel
- [ ] Added `ALPACA_PAPER_SECRET` to Vercel
- [ ] All variables set for Production, Preview, and Development
- [ ] Redeployed the app
- [ ] Deployment succeeded (check Deployments tab)
- [ ] Tested watchlist page - prices showing

---

## What Changed in Your Code

Your app now checks environment variables **first**, then falls back to the database:

```typescript
// Before: Always used database
const { data: apiKeys } = await supabase.rpc('get_user_api_keys', ...)

// After: Environment variables first, database as fallback
let alpacaApiKey = process.env.ALPACA_PAPER_KEY;
let alpacaSecretKey = process.env.ALPACA_PAPER_SECRET;

if (!alpacaApiKey || !alpacaSecretKey) {
  // Fallback to database
  const { data: apiKeys } = await supabase.rpc('get_user_api_keys', ...)
}
```

This means:
- ✅ No need to enter API keys through the Settings UI
- ✅ Keys are centrally managed in Vercel
- ✅ Easier to update (just change in Vercel and redeploy)
- ✅ Still works with database if you prefer that method

---

## Security Note

- Environment variables in Vercel are **encrypted at rest**
- Only accessible by your deployment functions
- Not exposed to the browser (except `NEXT_PUBLIC_*` variables)
- Keep your `SUPABASE_SERVICE_ROLE_KEY` and Alpaca keys secret
- Never commit `.env.local` to git

---

## Next Steps

After setup:
1. ✅ Environment variables added and redeployed
2. Test watchlist: `/dashboard/watchlist`
3. Test dashboard: `/dashboard`
4. Test paper trading: `/dashboard/paper`
5. Explore all features!

