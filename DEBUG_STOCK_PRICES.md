# Debug: Stock Prices Showing Zeros

## The Problem
The watchlist loads correctly, but all stock prices show as $0.00 instead of real market data.

## What I Found
From the API response:
```json
{
  "success": true,
  "quotes": [
    {
      "symbol": "AAPL",
      "price": 0,
      "open": 0,
      "high": 0,
      "low": 0,
      "volume": 0,
      "change": 0,
      "changePercent": 0,
      "timestamp": "2025-10-13T20:18:02.652Z",
      "isMarketOpen": false
    }
  ]
}
```

**The Issue:** The API structure is correct, but Alpaca API calls are returning zeros instead of real data.

## What I Fixed

### 1. **Better Error Handling**
Added detailed logging to see exactly what's happening with Alpaca API calls:
- Logs each step of the data fetching process
- Shows market data responses
- Catches and logs specific errors

### 2. **Improved Data Flow**
Changed the logic to prioritize daily bars (since market is closed):
- First tries to get daily bar data (last trading day)
- Falls back to real-time quotes if bars fail
- Better handling of empty responses

### 3. **Test Endpoints**
Created test endpoints to debug the Alpaca integration:
- `/api/test-alpaca` - Tests Alpaca client initialization and API calls
- `/api/test-quotes` - Tests the quotes API specifically

## Deploy and Test

```bash
git add .
git commit -m "Add debugging for stock price zeros - improve Alpaca API error handling"
git push
```

## Test After Deployment

### 1. **Test Alpaca Client**
Visit: `https://your-app.vercel.app/api/test-alpaca`

**Should return:**
```json
{
  "success": true,
  "message": "Alpaca client test successful",
  "accountId": "your-account-id",
  "isMarketOpen": false,
  "marketDataLength": 1,
  "sampleMarketData": {
    "symbol": "AAPL",
    "close": 175.43,
    "open": 173.28,
    "high": 176.12,
    "low": 172.95,
    "volume": 45678900
  }
}
```

### 2. **Test Quotes API**
Visit: `https://your-app.vercel.app/api/stocks/quotes?symbols=AAPL`

**Should now return real prices:**
```json
{
  "success": true,
  "quotes": [
    {
      "symbol": "AAPL",
      "price": 175.43,
      "open": 173.28,
      "high": 176.12,
      "low": 172.95,
      "volume": 45678900,
      "change": 2.15,
      "changePercent": 1.24,
      "isMarketOpen": false
    }
  ]
}
```

## Possible Issues

### Issue 1: API Keys Not Set
**Symptoms:** Test endpoint shows "API keys not found"
**Solution:** Check Vercel environment variables

### Issue 2: Alpaca API Error
**Symptoms:** Test endpoint shows specific error message
**Solution:** Check Alpaca account status and API limits

### Issue 3: Market Data Method Issue
**Symptoms:** Client initializes but market data returns empty
**Solution:** May need to use different Alpaca API method

### Issue 4: Rate Limiting
**Symptoms:** Works sometimes but fails with rate limit errors
**Solution:** Add delays between API calls

## Expected Results

After the fix:
- ✅ **Real stock prices** (e.g., AAPL: $175.43)
- ✅ **Day's change** from open to close
- ✅ **Volume and range** data
- ✅ **Market closed indicator** still works
- ✅ **No more zeros**

The debugging will show us exactly what's happening with the Alpaca API! 🔍📈
