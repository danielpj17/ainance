# Always-On Bot Setup Guide

## How It Works

The always-on bot system ensures your trading bot runs continuously during market hours, even if:
- The server restarts
- No one has the page open
- The browser is closed

## Components

### 1. Daily Cron Job (Vercel)
- **Schedule**: Runs once per day at 13:30 UTC (9:30 AM EDT / 8:30 AM EST)
- **Endpoint**: `/api/trading/auto-start`
- **Purpose**: Starts all bots with always-on enabled when market opens
- **Note**: Due to Vercel Hobby plan limitations, this runs once daily. For continuous operation during market hours, use the health check endpoint (see below).

### 2. Health Check Endpoint (CRITICAL for Always-On)
- **Endpoint**: `/api/trading/health-check`
- **Purpose**: Executes trading loop directly for always-on bots
- **How it works**: 
  - Gets all users with always-on enabled
  - Executes trading loop for each user
  - Updates last_run timestamp
  - Keeps the bot running continuously
- **IMPORTANT**: This endpoint must be called frequently (every 2-5 minutes) during market hours to ensure bots keep running. The daily cron alone is not sufficient - if a bot stops during trading hours, it won't restart until the next day without the health check.

### 3. Client-Side Health Check
- **Frequency**: Every 60 seconds (when page is open)
- **Purpose**: Calls health check endpoint to keep bot running
- **Limitation**: Only works when someone has the page open

## Keeping Bot Running When Page is Closed (REQUIRED)

**CRITICAL**: The daily cron job only runs once per day at market open. If your bot stops during trading hours (due to server restart, error, etc.), it will NOT automatically restart until the next day's cron run. 

**You MUST set up one of the following options to ensure continuous operation:**

### Option A: Use External Cron Service (Recommended)

Set up a free external cron service to call the health check endpoint every 2-5 minutes during market hours:

**Recommended Services:**
- [Cron-job.org](https://cron-job.org) (free) ✅ **Currently configured**
- [EasyCron](https://www.easycron.com) (free tier)
- [UptimeRobot](https://uptimerobot.com) (free)

**Current Setup (cron-job.org):**
- **URL**: `https://your-app.vercel.app/api/trading/health-check`
- **Method**: GET
- **Schedule**: Every weekday, every 2 minutes from 7:00 AM to 3:00 PM MDT
- **Coverage**: 
  - Starts before market opens (returns early until 9:30 AM ET)
  - Covers full trading day (9:30 AM - 4:00 PM ET) in both summer and winter
  - Continues slightly after market close (harmless, will just return early)

**Setup Instructions:**
1. Create account on cron-job.org
2. Add new cron job with custom timeline:
   - **URL**: `https://your-app.vercel.app/api/trading/health-check`
   - **Method**: GET
   - **Schedule**: Custom - Every weekday, every 2 minutes from 7:00 AM to 3:00 PM MDT
   - **Headers** (optional): `Authorization: Bearer YOUR_CRON_SECRET` (if you set CRON_SECRET env var)

**Alternative Cron Schedule Examples (if using standard cron syntax):**
- Every 2 minutes during market hours: `*/2 13-20 * * 1-5` (1:00 PM - 8:00 PM UTC = 9:00 AM - 4:00 PM ET, Mon-Fri)
- Every 5 minutes during market hours: `*/5 13-20 * * 1-5`
- **Note**: Times vary by timezone. MDT (Mountain Daylight Time) is UTC-6, so 7 AM MDT = 1 PM UTC = 9 AM EDT.

### Option B: Keep Browser Tab Open

The client-side health check runs every 60 seconds when the page is open. Simply:
1. Open your trading dashboard
2. Keep the tab open during market hours
3. The health check will automatically keep the bot running

## Environment Variables

Optional: Set `CRON_SECRET` in Vercel environment variables to secure the health check endpoint:
- Go to Vercel Dashboard → Your Project → Settings → Environment Variables
- Add `CRON_SECRET` with a random secure value
- Use this in your external cron service headers

## How to Enable Always-On

1. Go to your trading bot page
2. Click the "Always-On" button to enable it
3. The bot will now:
   - Start automatically when market opens (via daily cron)
   - Run continuously during market hours (via health check)
   - Restart automatically if it stops (via health check)

## Troubleshooting

**Bot stops running:**
- Check if always-on is enabled (green button)
- Verify external cron service is calling health check (if using Option A)
- Check Vercel logs for errors
- Ensure API keys are configured correctly

**Bot not starting at market open:**
- Verify daily cron job is configured in `vercel.json`
- Check Vercel dashboard → Crons tab to see if cron is running
- Check server logs for errors

**WebSocket/API connection errors (e.g., "ERR_NAME_NOT_RESOLVED" or WebSocket failures):**
- **Most common cause**: Supabase URL mismatch in Vercel environment variables
- Check browser console for error messages showing old project URL (e.g., `hukefaaxifspkybahqux.supabase.co`)
- **Fix**: 
  1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
  2. Update `NEXT_PUBLIC_SUPABASE_URL` to match your current Supabase project (e.g., `https://rffnvtzhnferhrqzvhw.supabase.co`)
  3. Click "Redeploy" to rebuild with new environment variables
  4. Hard refresh your browser (Ctrl+Shift+R or Cmd+Shift+R) to clear cached JavaScript
- The console will show a warning if URL and token project IDs don't match

## Notes

- The health check executes the full trading loop, so it will make trades if signals are generated
- The bot respects market hours and won't trade when market is closed
- The bot won't open new positions in the last 30 minutes (3:30 PM - 4:00 PM ET)
- Existing positions remain open (not automatically closed)

