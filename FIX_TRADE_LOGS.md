# Fix Trade Logs Not Showing Up

## Problem
Trades are not appearing in the Trade Logs page because the `trade_logs` table and its associated database functions haven't been created in your Supabase database yet.

## Solution

You have **two options** to fix this:

### Option 1: Apply via Supabase Dashboard (Recommended)

1. Go to your Supabase Dashboard: https://app.supabase.com
2. Select your project
3. Navigate to **SQL Editor** in the left sidebar
4. Click **New Query**
5. Copy the entire contents of the file `apply-trade-logs-fix.sql`
6. Paste it into the SQL Editor
7. Click **Run** (or press `Ctrl+Enter` / `Cmd+Enter`)
8. You should see a success message: "trade_logs table created successfully"

### Option 2: Apply via Supabase CLI

If you have the Supabase CLI installed and your project linked:

```bash
# Apply the migration
supabase db push
```

Or apply the SQL file directly:

```bash
# Make sure you're logged in
supabase login

# Link your project (if not already linked)
supabase link --project-ref your-project-ref

# Apply the SQL file
psql "your-database-connection-string" -f apply-trade-logs-fix.sql
```

## What This Does

The migration creates:

1. **`trade_logs` table** - A comprehensive table to track all buy/sell trades with:
   - Trade identification (symbol, trade_pair_id)
   - Buy/sell prices and timestamps
   - Decision metrics (confidence, reasoning, news sentiment, etc.)
   - Profit/loss calculations
   - Strategy and account info

2. **Database Functions**:
   - `get_current_trades(user_uuid)` - Fetches all open positions
   - `get_completed_trades(user_uuid, limit, offset)` - Fetches closed trades
   - `get_trade_statistics(user_uuid)` - Calculates win rate, P&L, etc.
   - `close_trade_position(...)` - Updates a trade when selling

3. **Security Policies** - Row Level Security (RLS) to ensure users can only see their own trades

4. **Indexes** - For fast queries on common fields

## Verification

After applying the migration:

1. Start your trading bot
2. Wait for it to execute some trades
3. Go to the **Trade Logs** page in your dashboard
4. You should now see:
   - Current open positions in the "Current Trades" tab
   - Completed trades in the "Completed" tab
   - Statistics cards showing win rate, total P&L, etc.

## How Trades Are Logged

When the bot executes trades:

- **BUY orders**: Creates a new row in `trade_logs` with status='open'
  - Stores buy price, quantity, timestamp
  - Stores decision metrics (ML confidence, news sentiment, reasoning)
  
- **SELL orders**: Finds the matching open trade and updates it
  - Sets status='closed'
  - Adds sell price, timestamp, sell decision metrics
  - Calculates profit/loss and holding duration

## Fallback Data

If you've already executed trades before applying this fix:

The Trade Logs API will also check:
1. Your Alpaca positions (for current trades)
2. The legacy `trades` table (for historical trades)

So you won't lose any trade data!

## Troubleshooting

### Error: "relation 'trade_logs' already exists"
This is fine - the migration uses `create table if not exists`, so it won't fail if the table already exists.

### Error: "permission denied"
Make sure you're running the SQL as a user with sufficient permissions (the Supabase service role should work).

### Trades still not showing up
1. Check your browser console for errors
2. Verify the migration ran successfully by checking the Supabase table editor
3. Make sure your bot is actually executing trades (check bot logs)
4. Verify your user ID matches the trades' user_id in the database

### Check if table exists

Run this query in Supabase SQL Editor:

```sql
select * from trade_logs limit 10;
```

If it returns results (even if empty), the table exists and is working.

## Next Steps

Once the migration is applied:
1. The trade logs page will start showing trades
2. All future bot trades will be properly logged
3. You'll see detailed decision metrics for each trade
4. Statistics will be calculated automatically

