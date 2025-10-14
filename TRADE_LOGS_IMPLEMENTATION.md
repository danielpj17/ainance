# Trade Logs Implementation

## Overview
A comprehensive trade logs system has been added to your trading application. This system stores all trades with complete decision metrics, separated into current (open) and completed trades.

## Features

### 1. **Comprehensive Trade Tracking**
- **Current Trades**: Shows all positions that have been bought but not yet sold
- **Completed Trades**: Shows all positions that have been both bought and sold
- **Decision Metrics**: Stores all information and metrics that led to buy and sell decisions

### 2. **Trade Information Stored**

#### Buy Decisions:
- Confidence level
- Adjusted confidence (with sentiment boost)
- AI reasoning
- News sentiment score
- News headlines
- Market risk level
- Entry price
- Timestamp

#### Sell Decisions:
- Confidence level
- Adjusted confidence
- AI reasoning  
- News sentiment score
- News headlines
- Market risk level
- Exit price
- Timestamp

#### Performance Metrics:
- Profit/Loss amount
- Profit/Loss percentage
- Holding duration
- Current/unrealized P&L for open positions

### 3. **Statistics Dashboard**
- Win rate
- Total profit/loss
- Average profit/loss
- Open positions count
- Completed trades count
- Best trade
- Worst trade
- Average holding duration

## Files Created/Modified

### New Files:
1. `app/api/trade-logs/route.ts` - API endpoint for trade logs
2. `app/dashboard/trade-logs/page.tsx` - Trade logs UI page
3. `supabase/migrations/20241014000_add_trade_logs.sql` - Database migration
4. `apply-trade-logs-migration.sql` - Standalone migration file

### Modified Files:
1. `app/api/trading/route.ts` - Updated to store decision metrics when trades are executed
2. `components/Sidebar.tsx` - Added Trade Logs navigation link

## Database Schema

### trade_logs Table
```sql
- id: bigint (primary key)
- user_id: uuid (references auth.users)
- symbol: text
- trade_pair_id: uuid (links buy and sell together)
- action: text ('buy' or 'sell')
- qty: numeric
- price: numeric
- total_value: numeric
- timestamp: timestamptz
- status: text ('open' or 'closed')
- buy_timestamp: timestamptz
- buy_price: numeric
- buy_decision_metrics: jsonb (stores all buy decision data)
- sell_timestamp: timestamptz
- sell_price: numeric
- sell_decision_metrics: jsonb (stores all sell decision data)
- profit_loss: numeric
- profit_loss_percent: numeric
- holding_duration: interval
- strategy: text
- account_type: text
- alpaca_order_id: text
- order_status: text
- created_at: timestamptz
- updated_at: timestamptz
```

### Database Functions
1. `get_current_trades(user_uuid)` - Returns all open positions
2. `get_completed_trades(user_uuid, limit, offset)` - Returns completed trades
3. `get_trade_statistics(user_uuid)` - Returns trading statistics
4. `close_trade_position(...)` - Updates trade when selling

## Installation Steps

### 1. Apply Database Migration

#### Option A: Using Supabase SQL Editor
1. Go to your Supabase project dashboard
2. Navigate to SQL Editor
3. Copy the contents of `apply-trade-logs-migration.sql`
4. Paste and run the SQL

#### Option B: Using Supabase CLI (if you have it set up)
```bash
supabase db push
```

### 2. Restart Your Application
```bash
npm run dev
```

### 3. Access Trade Logs
Navigate to the Trade Logs tab in the sidebar (FileText icon)

## How It Works

### When a Buy Trade is Executed:
1. The trading bot generates a buy signal with decision metrics
2. The trade is executed via Alpaca
3. A new record is created in `trade_logs` with:
   - Status: 'open'
   - Buy decision metrics (confidence, reasoning, sentiment, etc.)
   - Entry price and timestamp

### When a Sell Trade is Executed:
1. The trading bot generates a sell signal with decision metrics
2. The trade is executed via Alpaca
3. The existing `trade_logs` record is updated with:
   - Status: 'closed'
   - Sell decision metrics
   - Exit price and timestamp
   - Calculated profit/loss and holding duration

### Viewing Trade Logs:
1. **Current Trades Tab**: Shows all open positions with real-time P&L
2. **Completed Trades Tab**: Shows trade history with final results
3. **Click any trade**: Opens a detailed modal showing:
   - All buy decision metrics
   - All sell decision metrics (for completed trades)
   - Performance summary
   - Trade metadata

## API Endpoints

### GET /api/trade-logs
Query parameters:
- `view`: 'current', 'completed', 'all', or 'statistics'
- `limit`: Number of records (default: 100)
- `offset`: Pagination offset (default: 0)

Response:
```json
{
  "success": true,
  "data": {
    "currentTrades": [...],
    "completedTrades": [...],
    "statistics": {...}
  }
}
```

### POST /api/trade-logs
Body:
```json
{
  "action": "buy" | "sell",
  "symbol": "AAPL",
  "qty": 10,
  "price": 150.50,
  "decision_metrics": {
    "confidence": 0.85,
    "reasoning": "Strong buy signal...",
    "news_sentiment": 0.2,
    ...
  },
  "strategy": "cash",
  "account_type": "paper"
}
```

## UI Features

### Statistics Cards
- Real-time statistics at the top of the page
- Color-coded profit/loss indicators
- Win rate with wins/losses breakdown

### Trade Cards
- Click to view detailed metrics
- Color-coded profit/loss
- Holding duration display
- Real-time price updates for current trades

### Detail Modal
- Comprehensive buy decision metrics
- Comprehensive sell decision metrics (for completed trades)
- News headlines that influenced the decision
- Market risk assessment
- Trade identification information

## Data Persistence

All trade data is stored in Supabase with:
- ✅ Row Level Security (RLS) enabled
- ✅ User isolation (users can only see their own trades)
- ✅ Proper indexing for fast queries
- ✅ Real-time updates enabled
- ✅ Automatic timestamping
- ✅ Data integrity constraints

## Future Enhancements

Potential improvements you could add:
1. Export trades to CSV
2. Advanced filtering (by symbol, date range, profitability)
3. Trade performance analytics charts
4. Compare trades across different strategies
5. Trade notes/tags system
6. Trade replay/analysis tools

## Troubleshooting

### Migration Issues
If the migration fails:
1. Check that you have the latest version of Supabase
2. Verify that the `gen_random_uuid()` function is available
3. Make sure RLS is enabled on your database

### Trade Logs Not Showing
1. Verify the migration was applied successfully
2. Check that trades are being executed (Paper/Live Trading)
3. Look for errors in the browser console
4. Check that the API endpoint is accessible: `/api/trade-logs?view=all`

### Real-time Prices Not Updating
1. Verify Alpaca API keys are configured
2. Check that the market is open
3. Ensure the user has permission to access market data

## Support

If you encounter any issues:
1. Check the browser console for errors
2. Check the server logs for API errors
3. Verify the database migration was applied correctly
4. Ensure environment variables are set properly

