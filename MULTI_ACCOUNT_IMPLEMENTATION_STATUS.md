# Multiple Paper Trading Accounts - Implementation Status

## ✅ Completed Components

### 1. Database Schema (DONE)
- Created `paper_trading_accounts` table with encrypted API keys
- Added `account_id` and `account_name` to `trade_logs` table
- Updated database functions to support account filtering
- Created migration scripts

### 2. Backend APIs (DONE)
- `/api/paper-accounts` - Full CRUD for paper accounts
- `/api/account` - Updated to accept account_id
- `/api/trade-logs` - Updated to filter by account_id
- `/api/trade` - Updated to accept account_id
- `getAlpacaKeysForUser` - Updated to fetch from paper_trading_accounts

### 3. Settings UI (DONE)
- `PaperAccountManager` component created
- `ApiKeysForm` updated to show paper account manager
- Users can add/edit/delete paper accounts

### 4. Paper Trading Page (IN PROGRESS)
- Account dropdown added ✅
- Data loading updated to use account_id ✅
- Completed trades loading added ✅
- **REMAINING**: Need to replace Current Positions section with Tabs

## 📋 Remaining Tasks

### 1. Complete Paper Trading Page UI
**File:** `app/dashboard/paper/page.tsx`
**Location:** Lines 920-1045 (Current Positions section)

Replace the entire "Current Positions" card with:
```tsx
{/* Positions and Trades Tabs */}
<div className="mb-8">
  <Tabs defaultValue="current" className="space-y-4">
    <TabsList className="glass-card">
      <TabsTrigger value="current">Current Positions</TabsTrigger>
      <TabsTrigger value="completed">Completed Trades</TabsTrigger>
    </TabsList>

    <TabsContent value="current">
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-white">Current Positions</CardTitle>
          <CardDescription className="text-gray-400">
            Active paper trading positions for selected account
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Keep existing current positions rendering code */}
        </CardContent>
      </Card>
    </TabsContent>

    <TabsContent value="completed">
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-white">Completed Trades</CardTitle>
          <CardDescription className="text-gray-400">
            Closed positions for selected account
          </CardDescription>
        </CardHeader>
        <CardContent>
          {completedTrades.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No completed trades yet
            </div>
          ) : (
            <div className="space-y-4">
              {completedTrades.map((trade) => (
                <div key={trade.id.toString()} className="p-4 bg-[#252838] rounded-lg border border-gray-700">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="text-2xl font-bold text-white">{trade.symbol}</div>
                      <Badge className="bg-green-400">CLOSED</Badge>
                      <Badge variant="outline">{trade.qty} shares</Badge>
                    </div>
                    <div className="text-right">
                      <div className={`text-xl font-bold ${trade.profit_loss >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {formatCurrency(trade.profit_loss)}
                      </div>
                      <div className={`text-sm ${trade.profit_loss_percent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {trade.profit_loss_percent >= 0 ? '+' : ''}{trade.profit_loss_percent.toFixed(2)}%
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <div className="text-gray-500 mb-1">Buy Price</div>
                      <div className="font-semibold text-white">{formatCurrency(trade.buy_price)}</div>
                    </div>
                    <div>
                      <div className="text-gray-500 mb-1">Sell Price</div>
                      <div className="font-semibold text-white">{formatCurrency(trade.sell_price)}</div>
                    </div>
                    <div>
                      <div className="text-gray-500 mb-1">Holding Time</div>
                      <div className="font-semibold text-white">{formatDuration(trade.holding_duration)}</div>
                    </div>
                    <div>
                      <div className="text-gray-500 mb-1">Closed</div>
                      <div className="font-semibold text-white">{new Date(trade.sell_timestamp).toLocaleDateString()}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </TabsContent>
  </Tabs>
</div>
```

### 2. Update TradingBot Component
**File:** `components/TradingBot.tsx`

Find where trades are executed and add `account_id` to the request:
```tsx
account_id: selectedAccountId // Pass from parent
```

The Paper Trading page needs to pass `selectedAccountId` prop to TradingBot component.

## 🗄️ Database Setup

Run these SQL commands in Supabase SQL Editor:

### Step 1: Create Tables and Functions
```sql
-- Run the main migration
\i supabase/migrations/20250217000000_add_multiple_paper_accounts.sql
```

### Step 2: Migrate Existing Keys (Optional)
```sql
-- Run the migration for existing users
\i supabase/migrations/20250217000001_migrate_existing_paper_keys.sql
```

### Step 3: Verify Setup
```sql
-- Check that tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('paper_trading_accounts', 'trade_logs');

-- Check that account_id column was added to trade_logs
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'trade_logs' 
AND column_name IN ('account_id', 'account_name');

-- Check that functions exist
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name LIKE '%paper%account%';
```

## ✅ Testing Checklist

### 1. Settings Page
- [ ] Can add new paper trading account
- [ ] Account name is required
- [ ] API keys are validated against Alpaca
- [ ] Can see list of accounts with account numbers
- [ ] Can edit account name
- [ ] Can update API keys
- [ ] Cannot delete account with trades
- [ ] Can delete account without trades

### 2. Paper Trading Page
- [ ] Account dropdown shows all accounts
- [ ] Selecting account loads correct data
- [ ] Account info (equity, cash, etc.) matches selected account
- [ ] Current positions only show for selected account
- [ ] Completed trades only show for selected account
- [ ] No cross-account data leakage (verify by switching accounts)
- [ ] Trading bot uses correct account
- [ ] Real-time updates work per account

### 3. Data Isolation
- [ ] User A cannot see User B's accounts
- [ ] Account 1 data never appears when Account 2 is selected
- [ ] Trade logs are properly filtered
- [ ] Account history chart is account-specific

## 🔧 Manual Steps Required

1. **Run Database Migrations**
   - Open Supabase SQL Editor
   - Copy content from `supabase/migrations/20250217000000_add_multiple_paper_accounts.sql`
   - Execute the SQL
   - Copy content from `supabase/migrations/20250217000001_migrate_existing_paper_keys.sql`
   - Execute the SQL

2. **Complete Paper Trading Page Tabs**
   - Edit `app/dashboard/paper/page.tsx`
   - Replace lines 920-1045 with the Tabs code from section above
   - Ensure `formatCurrency` and `formatDuration` functions are accessible

3. **Update TradingBot Component**
   - Add `accountId` prop to TradingBot interface
   - Pass `account_id` in trade execution requests
   - Update Paper Trading page to pass `selectedAccountId` to TradingBot

4. **Test Thoroughly**
   - Create 2-3 test paper accounts
   - Execute trades on different accounts
   - Verify data isolation
   - Check that switching accounts shows correct data

## 📝 Notes

- All API keys are encrypted using pgcrypto
- Account numbers are fetched from Alpaca API automatically
- Legacy single-account support maintained for backward compatibility
- Demo users continue to use environment variables

## 🚨 Important Security Notes

- Each account is isolated by `account_id` at database level
- RLS policies ensure users only see their own accounts
- All API endpoints validate account ownership
- No cross-account data leakage possible due to strict filtering

