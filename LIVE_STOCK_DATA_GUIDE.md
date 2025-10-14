# Live Stock Data - Real-Time Prices & Market Status

## What I Fixed

### 1. **Real-Time Quotes API**
- **Before:** Used historical bar data (1-minute bars) which often returned zeros
- **After:** Uses real-time quotes with fallback to latest daily bars
- **Market Open:** Gets live bid/ask prices from Alpaca
- **Market Closed:** Shows last available price from daily bars

### 2. **Market Status Detection**
- **Checks if market is open** before fetching quotes
- **Shows market status indicator** (green "Market Open" or red "Market Closed")
- **Uses appropriate data source** based on market hours

### 3. **Auto-Refresh**
- **Updates prices every 30 seconds** when market is open
- **No unnecessary API calls** when market is closed
- **Real-time price updates** during trading hours

### 4. **Better Error Handling**
- **Fallback to daily bars** if real-time quotes fail
- **Graceful handling** of API errors
- **Shows last known price** instead of zeros

---

## How It Works Now

### During Market Hours (9:30 AM - 4:00 PM ET):
1. **Fetches real-time quotes** from Alpaca
2. **Shows live bid/ask prices** (mid-price displayed)
3. **Updates every 30 seconds** automatically
4. **Green "Market Open" indicator**

### Outside Market Hours:
1. **Fetches latest daily bar data**
2. **Shows last closing price** and day's range
3. **Red "Market Closed" indicator**
4. **No auto-refresh** (saves API calls)

### API Flow:
```
1. Check market status (isMarketOpen)
2. For each stock:
   - Try real-time quote first
   - Fallback to daily bars if quote fails
   - Calculate change from open
   - Include market status in response
3. Frontend displays with market indicator
4. Auto-refresh every 30 seconds (market open only)
```

---

## Deploy the Fix

```bash
git add .
git commit -m "Add live stock data with real-time quotes and market status"
git push
```

---

## Test After Deployment

### 1. **Check Real-Time Data**
- Visit: `https://your-app.vercel.app/dashboard/watchlist`
- Should see **real stock prices** (during market hours)
- Should see **market status indicator** (green/red)

### 2. **Test Market Open (9:30 AM - 4:00 PM ET)**
- ✅ **Green "Market Open" indicator**
- ✅ **Live stock prices** updating
- ✅ **Real-time changes** and percentages
- ✅ **Auto-refresh every 30 seconds**

### 3. **Test Market Closed**
- ✅ **Red "Market Closed" indicator**
- ✅ **Last available prices** (previous close)
- ✅ **Day's high/low** from daily bars
- ✅ **No auto-refresh** (saves API calls)

### 4. **Test API Directly**
Visit: `https://your-app.vercel.app/api/stocks/quotes?symbols=AAPL,MSFT,GOOGL`

Should return:
```json
{
  "success": true,
  "quotes": [
    {
      "symbol": "AAPL",
      "price": 175.43,
      "change": 2.15,
      "changePercent": 1.24,
      "isMarketOpen": true,
      "timestamp": "2024-01-15T15:30:00Z"
    }
  ]
}
```

---

## Expected Results

### Market Open:
- ✅ **Real-time prices** (e.g., AAPL: $175.43)
- ✅ **Live changes** (e.g., +$2.15, +1.24%)
- ✅ **Current volume** and day's range
- ✅ **Green market indicator**
- ✅ **Auto-updates every 30 seconds**

### Market Closed:
- ✅ **Last closing prices** (e.g., AAPL: $173.28)
- ✅ **Day's change** from open to close
- ✅ **Day's high/low** and volume
- ✅ **Red market indicator**
- ✅ **No auto-refresh**

---

## Data Sources

### Real-Time (Market Open):
- **Source:** Alpaca real-time quotes API
- **Data:** Live bid/ask prices
- **Update:** Every 30 seconds
- **Accuracy:** Real-time market data

### Historical (Market Closed):
- **Source:** Alpaca daily bars API
- **Data:** Previous day's close, high, low, volume
- **Update:** Static (last available)
- **Accuracy:** End-of-day data

---

## Troubleshooting

### If Still Seeing Zeros:
1. **Check market hours** - outside 9:30 AM - 4:00 PM ET
2. **Check API keys** - ensure ALPACA_PAPER_KEY/SECRET are set
3. **Check API response** - visit quotes API directly
4. **Check console logs** - look for API errors

### If No Market Status:
- Market status loads with first quote
- Should appear after page loads
- Green = open, Red = closed

### If No Auto-Refresh:
- Only refreshes during market hours
- 30-second intervals
- Check browser console for errors

---

## Benefits

### Real-Time Experience:
- ✅ **Live prices** during market hours
- ✅ **Automatic updates** every 30 seconds
- ✅ **Market status awareness**
- ✅ **Efficient API usage**

### Reliable Data:
- ✅ **Fallback to historical** when real-time fails
- ✅ **No more zeros** from failed API calls
- ✅ **Last known prices** when market closed
- ✅ **Error handling** for API issues

Your watchlist now has **live, real-time stock data** that updates automatically! 🚀📈
