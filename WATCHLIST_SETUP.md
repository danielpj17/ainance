# Watchlist Setup Guide

## Prerequisites
✅ You have Alpaca Paper Trading API keys  
✅ You have Supabase API credentials  

## Step-by-Step Setup

### 1. Apply Database Migrations

First, ensure all migrations are applied to your Supabase database. Run these SQL files in order in your Supabase SQL Editor:

```sql
-- Navigate to Supabase Dashboard > SQL Editor > New Query
-- Run each migration file in order:

1. supabase/migrations/202510081400_create_tables.sql
2. supabase/migrations/202510081500_add_validation.sql
3. supabase/migrations/202510081600_add_trading_tables.sql
4. supabase/migrations/202510081700_add_encryption.sql
5. supabase/migrations/20251011000_add_ml_cache.sql
6. supabase/migrations/20251011001_add_watchlists.sql  ← REQUIRED FOR WATCHLIST
7. supabase/migrations/20251011002_add_rate_limits.sql
```

**Quick Method:** You can also run the all-in-one migration:
```sql
-- Copy contents of supabase/all_migrations.sql
-- Paste into Supabase SQL Editor and run
```

### 2. Configure Environment Variables

Ensure your `.env.local` file contains:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Optional: For ML Service
ML_SERVICE_URL=your_ml_service_url (if using ML predictions)
```

### 3. Set Up API Keys in the App

1. **Start your Next.js app:**
   ```bash
   npm run dev
   ```

2. **Navigate to Settings:**
   - Open `http://localhost:3000/auth` and log in (or sign up if you don't have an account)
   - Go to `http://localhost:3000/settings`
   - Click on the "API Keys" tab

3. **Add Your Alpaca Paper Trading Keys:**
   - **Alpaca Paper Key:** Your Alpaca paper trading API key (starts with `PK...`)
   - **Alpaca Paper Secret:** Your Alpaca paper trading secret key (starts with `...`)
   - Leave Live Trading keys empty (not needed for paper trading)
   - Optionally add News API key for sentiment analysis
   - Click "Save API Keys"

### 4. Access the Watchlist

1. Navigate to `http://localhost:3000/dashboard/watchlist`
2. The watchlist will automatically:
   - Create a default watchlist with AAPL, MSFT, GOOGL
   - Fetch real-time market data from Alpaca
   - Display current prices, changes, and volume

### 5. Using the Watchlist

**Search for Stocks:**
- Type a stock symbol (e.g., "TSLA") or company name (e.g., "Tesla") in the search bar
- Click "Add" to add it to your watchlist

**View Real-Time Data:**
- The watchlist automatically fetches market data from Alpaca
- Prices update when you refresh the page
- Green = price up, Red = price down

**Remove Stocks:**
- Click the trash icon next to any stock to remove it from your watchlist

## Troubleshooting

### Issue: "Alpaca API keys not configured"
**Solution:** Go to Settings → API Keys and add your Alpaca Paper Trading keys

### Issue: "Failed to load watchlists" or database errors
**Solution:** Ensure migrations are applied. Run the watchlist migration:
```sql
-- In Supabase SQL Editor, run:
-- supabase/migrations/20251011001_add_watchlists.sql
```

### Issue: No price data showing (loading spinners)
**Possible causes:**
1. Market is closed (Alpaca data may be delayed/unavailable)
2. API keys are invalid
3. Rate limiting from Alpaca

**Solution:** 
- Verify your API keys are correct in Settings
- Check Alpaca dashboard to ensure keys are active
- Try during market hours (9:30 AM - 4:00 PM ET, Monday-Friday)

### Issue: Unauthorized errors
**Solution:** Make sure you're logged in. Navigate to `/auth` to sign in.

### Issue: "No stocks found" when searching
**Solution:** The search uses a built-in database of popular stocks. Try searching for:
- Common stocks: AAPL, MSFT, GOOGL, AMZN, TSLA, NVDA
- ETFs: SPY, QQQ, VTI
- See the full list in `app/api/stocks/search/route.ts`

## What Data Is Displayed?

The watchlist shows:
- **Symbol:** Stock ticker (e.g., AAPL)
- **Price:** Current market price
- **Change:** Dollar change from open
- **Change %:** Percentage change with trend indicator
- **Volume:** Trading volume (formatted as K/M)
- **High:** Day's high price
- **Low:** Day's low price

## Data Source

All market data comes from **Alpaca Markets** via their paper trading API:
- Real-time data during market hours
- 1-minute bars (most recent)
- No additional fees for paper trading accounts

## Next Steps

Once your watchlist is working:
1. Explore the **Dashboard** (`/dashboard`) for trading overview
2. Set up **Strategy Settings** in Settings → Strategy Settings
3. Try **Paper Trading** at `/dashboard/paper`
4. View **Live Trading** at `/dashboard/live`

## Support

If you encounter issues:
1. Check browser console for detailed error messages
2. Verify Supabase database has all tables created
3. Ensure Alpaca API keys are for **paper trading** (not live)
4. Check that you're authenticated (logged in)

---

**Quick Checklist:**
- [ ] Database migrations applied
- [ ] Environment variables set
- [ ] Logged into the app
- [ ] Alpaca Paper Trading API keys added in Settings
- [ ] Navigated to `/dashboard/watchlist`
- [ ] Can search and add stocks
- [ ] Seeing real price data

