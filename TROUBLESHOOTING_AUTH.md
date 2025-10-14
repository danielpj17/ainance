# Authentication Troubleshooting Guide

## Issue: 401 Unauthorized Error on Watchlist

### Quick Diagnosis

**Are you logged in?**
1. Go to `https://your-app.vercel.app/auth`
2. If you see a login form, you're NOT logged in
3. If you're redirected to dashboard, you ARE logged in

---

## Solution 1: Login First

### Step 1: Create Account or Login

1. **Go to auth page:**
   ```
   https://your-app.vercel.app/auth
   ```

2. **Sign up (if you don't have an account):**
   - Enter your email
   - Enter a password (minimum 6 characters)
   - Click "Sign Up"
   - Check your email for verification link
   - Click the verification link

3. **Or Sign in (if you have an account):**
   - Enter your email
   - Enter your password
   - Click "Sign In"

4. **After successful login:**
   - You should be redirected to the dashboard
   - Now try accessing the watchlist again

---

## Solution 2: Verify Supabase Environment Variables

If login doesn't work, check your Vercel environment variables:

### In Vercel Dashboard

1. Go to **Vercel Dashboard** → Your Project → **Settings** → **Environment Variables**

2. **Verify these exist and are correct:**

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

### Get Correct Values from Supabase

1. Go to **Supabase Dashboard** → https://supabase.com/dashboard
2. Select your project
3. Go to **Settings** → **API**
4. Copy these values:
   - **URL** → use for `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → use for `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** key → use for `SUPABASE_SERVICE_ROLE_KEY`

### Update in Vercel

1. If values are wrong or missing, update/add them in Vercel
2. **IMPORTANT:** After updating, you MUST redeploy:
   - Go to **Deployments** tab
   - Click "..." on latest deployment
   - Click "Redeploy"

---

## Solution 3: Check Browser Console for Specific Errors

### Open Browser Console
- Press F12 (Windows/Linux) or Cmd+Option+I (Mac)
- Go to **Console** tab

### Look for these specific errors:

#### Error 1: "Invalid JWT"
**Cause:** Session expired or Supabase keys mismatch  
**Solution:** 
- Clear browser cookies and local storage
- Login again
- Verify Supabase env vars in Vercel match your Supabase project

#### Error 2: "Failed to fetch" or "Network error"
**Cause:** CORS issues or API route not accessible  
**Solution:**
- Check if your Vercel deployment succeeded
- Check function logs in Vercel → Deployments → Functions

#### Error 3: "Unauthorized"
**Cause:** Not logged in or session expired  
**Solution:**
- Go to `/auth` and login again
- Check if cookies are enabled in browser

---

## Solution 4: Clear Browser Cache & Cookies

Sometimes old auth tokens cause issues:

### Chrome/Edge
1. Press F12
2. Right-click the refresh button
3. Select "Empty Cache and Hard Reload"
4. Or go to Settings → Privacy → Clear browsing data
5. Select "Cookies" and "Cached images"
6. Clear for "Last hour"

### Firefox
1. Press Ctrl+Shift+Delete
2. Select "Cookies" and "Cache"
3. Time range: "Last hour"
4. Click "Clear Now"

### After Clearing
1. Go to `https://your-app.vercel.app/auth`
2. Login again
3. Try watchlist again

---

## Solution 5: Check Supabase Auth Settings

In your Supabase Dashboard:

1. Go to **Authentication** → **URL Configuration**
2. Add your Vercel URL to **Redirect URLs**:
   ```
   https://your-app.vercel.app/*
   https://your-app.vercel.app/auth
   https://your-app.vercel.app/dashboard
   ```

3. Add to **Site URL**:
   ```
   https://your-app.vercel.app
   ```

4. Save changes

---

## Solution 6: Test Authentication Directly

### Test API Endpoint
Open this in your browser (while logged in):
```
https://your-app.vercel.app/api/debug-auth
```

If you don't have this endpoint, create it:

**Create: `app/api/debug-auth/route.ts`**
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/utils/supabase/server';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    
    return NextResponse.json({
      authenticated: !!user,
      userId: user?.id,
      email: user?.email,
      error: error?.message,
      env: {
        hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
        hasAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      }
    });
  } catch (error: any) {
    return NextResponse.json({
      authenticated: false,
      error: error.message
    });
  }
}
```

This will tell you:
- ✅ If you're authenticated
- ✅ Your user ID and email
- ✅ If environment variables are set
- ❌ Any specific error messages

---

## Common Causes & Quick Fixes

| Symptom | Cause | Fix |
|---------|-------|-----|
| Not redirected to `/auth` when not logged in | AuthGuard not working | Check browser console for errors |
| Login form not submitting | Supabase keys wrong | Verify `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| Login succeeds but APIs return 401 | Server-side auth failing | Verify `SUPABASE_SERVICE_ROLE_KEY` and redeploy |
| "Invalid JWT" errors | Session expired or keys mismatch | Clear cookies and login again |
| Redirected to `/auth` immediately after login | Auth check failing | Check middleware.ts and AuthGuard |

---

## Checklist

Before accessing watchlist, verify:

- [ ] Logged in at `/auth`
- [ ] Can see your email/profile somewhere in the UI
- [ ] Browser console shows no auth errors
- [ ] Supabase environment variables are correct in Vercel
- [ ] Redeployed after changing environment variables
- [ ] Cookies enabled in browser
- [ ] Not in incognito/private mode (sessions don't persist)

---

## Still Not Working?

### Check Vercel Function Logs

1. **Go to Vercel Dashboard** → Your Project
2. Click **Deployments** → Latest deployment
3. Click **Functions** tab
4. Click on `/api/watchlists` function
5. Look at the logs for specific error messages

Common logs to look for:
- `Unauthorized` - Not logged in
- `Invalid JWT` - Token expired or wrong keys
- `Connection refused` - Can't connect to Supabase

### Enable Debug Mode

Add this to your environment variables in Vercel:
```
NEXT_PUBLIC_DEBUG=true
```

This will show more detailed error messages in the browser console.

---

## Test Sequence

Follow this in order:

1. ✅ **Clear browser cache/cookies**
2. ✅ **Go to `/auth`** - Can you see the login form?
3. ✅ **Sign up or sign in** - Does it succeed?
4. ✅ **Check browser console** - Any errors?
5. ✅ **Go to `/dashboard`** - Do you see the dashboard?
6. ✅ **Go to `/dashboard/watchlist`** - Do you see the watchlist?
7. ✅ **Open browser console** - Check for 401 errors

If any step fails, that's where the issue is. Check the relevant solution above.

---

## Quick Copy-Paste: Environment Variables

For your reference, here are ALL the environment variables you need in Vercel:

```bash
# Supabase (Required)
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Alpaca (Required for watchlist data)
ALPACA_PAPER_KEY=PKxxxxxxxxxxxxxxxxxx
ALPACA_PAPER_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Optional
NEWS_API_KEY=your_newsapi_key_if_you_have_one
```

---

## Need More Help?

If none of these solutions work:

1. **Check Vercel deployment logs** for build/runtime errors
2. **Check Supabase logs** in Dashboard → Logs
3. **Try creating a new account** on your deployed site
4. **Verify your Supabase project is active** (not paused/deleted)
5. **Check if you're on a corporate network** with restrictive firewall rules

The most common cause is simply **not being logged in** - so start with that! 🔐

