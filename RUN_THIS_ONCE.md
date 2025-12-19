# Fix Completed Trades - Run This Once

Your completed trades are showing "Pending" because the sell prices weren't recorded in the database. Here's how to fix it:

## Step 1: Run the Database Migration

Open your **Supabase SQL Editor** and run this migration:

```sql
-- File: supabase/migrations/20250219000001_fix_completed_trades.sql
```

Copy and paste the entire contents of that file into the SQL editor and click "Run".

## Step 2: Sync the Missing Sell Prices (ONE TIME)

Run this command in your terminal:

```bash
npx tsx scripts/sync-sell-prices-once.ts
```

This will:
- ✅ Find all trades marked as "closed" but missing sell prices
- ✅ Look for matching sell orders in your database
- ✅ Update the buy records with sell price, P/L, and holding duration
- ✅ Run ONCE and stop (not constantly polling)

## Step 3: Refresh Your Page

After the sync completes, refresh your browser and check the Completed Trades tab. You should see:
- ✅ Real sell prices (not "Pending")
- ✅ Real dates (not "Pending")
- ✅ Correct profit/loss calculations
- ✅ No more constant reloading

## What This Does

The script matches buy orders with sell orders that are already in your `trade_logs` table. It uses:
- **Same symbol**
- **Same user**
- **Same account type**
- **Sell timestamp AFTER buy timestamp** (FIFO)

Then it calculates:
- Sell price
- Profit/Loss ($ and %)
- Holding duration
- Sell timestamp

And updates the database **once**. After that, the data is there permanently.

## If You Still See "Pending"

If trades still show "Pending" after running the script, it means those specific trades don't have a matching sell order in the database. This can happen if:
- The sell wasn't recorded in `trade_logs`
- The sell order has different symbol/user/account data

In that case, you can:
1. Check Alpaca dashboard to see if those positions are actually closed
2. Manually close those positions if they're still open
3. Or ignore them if they're old test data

---

**After running this once, you won't need to run it again.** The data will be in the database and displayed correctly.

