# Always-On Bot Setup Guide

## How It Works

The always-on bot system ensures your trading bot runs continuously during market hours, even if:
- The server restarts
- No one has the page open
- The browser is closed

## Components

### 1. Daily Cron Job (Vercel)
- **Schedule**: Runs once per day at 9:30 AM ET (market open)
- **Endpoint**: `/api/trading/auto-start`
- **Purpose**: Starts all bots with always-on enabled when market opens

### 2. Health Check Endpoint
- **Endpoint**: `/api/trading/health-check`
- **Purpose**: Executes trading loop directly for always-on bots
- **How it works**: 
  - Gets all users with always-on enabled
  - Executes trading loop for each user
  - Updates last_run timestamp
  - Keeps the bot running continuously

### 3. Client-Side Health Check
- **Frequency**: Every 60 seconds (when page is open)
- **Purpose**: Calls health check endpoint to keep bot running
- **Limitation**: Only works when someone has the page open

## Keeping Bot Running When Page is Closed

Since Vercel Hobby plan only allows daily cron jobs, you have two options:

### Option A: Use External Cron Service (Recommended)

Set up a free external cron service to call the health check endpoint every 2-5 minutes during market hours:

**Recommended Services:**
- [Cron-job.org](https://cron-job.org) (free)
- [EasyCron](https://www.easycron.com) (free tier)
- [UptimeRobot](https://uptimerobot.com) (free)

**Setup:**
1. Create account on cron service
2. Add new cron job:
   - **URL**: `https://your-app.vercel.app/api/trading/health-check`
   - **Method**: GET
   - **Schedule**: Every 2-5 minutes during market hours (9:30 AM - 4:00 PM ET, Mon-Fri)
   - **Headers** (optional): `Authorization: Bearer YOUR_CRON_SECRET` (if you set CRON_SECRET env var)

**Cron Schedule Examples:**
- Every 2 minutes: `*/2 13-20 * * 1-5` (1:00 PM - 8:00 PM UTC = 9:00 AM - 4:00 PM ET, Mon-Fri)
- Every 5 minutes: `*/5 13-20 * * 1-5`

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

## Notes

- The health check executes the full trading loop, so it will make trades if signals are generated
- The bot respects market hours and won't trade when market is closed
- The bot won't open new positions in the last 30 minutes (3:30 PM - 4:00 PM ET)
- Existing positions remain open (not automatically closed)

