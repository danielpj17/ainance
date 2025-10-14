# 🚦 Alpaca Rate Limit Solution

## The Problem

When the bot tried to scan 70+ stocks, it was making **~140 API requests per cycle** (2 requests per stock: quote + bars). With a 10-second interval, this exceeded Alpaca's rate limit of **200 requests per minute**.

**Error:** `code: 429, message: too many requests`

## The Solution

### Current Configuration (DEFAULT)

**Stock Scanning:** DISABLED by default  
**Stock Selection:** Uses curated list of 10 high-quality stocks  
**Rate Limit Risk:** SAFE - Only ~20 requests per cycle

**Default Stocks:**
- AAPL, MSFT, NVDA, TSLA, SPY, QQQ, AMD, META, AMZN, GOOGL

These are carefully selected for:
- High liquidity (easy to buy/sell)
- High volume (tight spreads)
- Good volatility (scalping opportunities)
- Diverse sectors

### How the Bot Works Now

**Every Cycle (10-60 seconds):**

1. ✅ Use curated 10-stock list
2. ✅ Get technical indicators (10 stocks = ~10 requests)
3. ✅ Get news sentiment (with caching)
4. ✅ Get FRED data (cached for 24 hours)
5. ✅ Get ML predictions for all 10 stocks
6. ✅ Check current positions
7. ✅ SELL existing positions if ML says to
8. ✅ BUY new opportunities if ML says to
9. ✅ Smart capital allocation

**Result:** Full continuous adaptive trading WITHOUT rate limit issues!

### Enabling Advanced Scanning (OPTIONAL)

If you want to enable the 70+ stock scanning, you need to:

**1. Increase bot interval to avoid rate limits:**
```typescript
// In TradingBot component
interval: 60 // Change from 10 to 60 seconds
```

**2. Add environment variable in Vercel:**
```
ENABLE_STOCK_SCANNING=true
```

**3. Understand the trade-off:**
- ✅ Scans more stocks (70+ vs 10)
- ❌ Slower cycles (60s vs 10s to respect rate limits)
- ❌ Higher risk of rate limit errors

**Recommendation:** Keep scanning disabled for now. The curated 10-stock list includes the most liquid, high-volume stocks that are perfect for scalping.

## Current Bot Capabilities (With 10 Stocks)

### Continuous Adaptive Trading ✅

**Example Session:**
```
Cycle 1: Trading AAPL, NVDA, SPY (top 10 list)
  ML: BUY AAPL (72%), BUY NVDA (68%)
  Execute: BUY AAPL, NVDA
  Portfolio: AAPL, NVDA

Cycle 2: Re-evaluate all 10 stocks
  ML: SELL AAPL (65%), BUY TSLA (74%)
  Execute: SELL AAPL, BUY TSLA
  Portfolio: NVDA, TSLA

Cycle 3: Re-evaluate all 10 stocks
  ML: HOLD NVDA, SELL TSLA (68%), BUY QQQ (70%)
  Execute: SELL TSLA, BUY QQQ
  Portfolio: NVDA, QQQ
```

**The revolving door still works!** Money flows between the 10 stocks based on ML predictions.

### Why 10 Stocks is Good for Scalping

**Quality > Quantity:**
- These 10 stocks have the highest liquidity in the market
- Tightest spreads (lowest transaction costs)
- Highest volume (easy entry/exit)
- Most predictable (more historical data)

**Famous Scalpers** often focus on just 5-10 stocks they know well!

## Rate Limit Details

### Alpaca Free Tier Limits:
- **200 requests per minute**
- **Market data requests count separately**

### Our Request Usage:

**With Scanning (DISABLED):**
- Stock scanning: ~140 requests
- Technical indicators: ~10 requests
- ML predictions: 1 request
- Trade execution: ~5 requests
- **Total: ~156 requests per cycle**
- At 10s interval: **~936 requests/minute** ❌ OVER LIMIT

**Without Scanning (DEFAULT):**
- Technical indicators: ~10 requests  
- ML predictions: 1 request
- Trade execution: ~5 requests
- **Total: ~16 requests per cycle**
- At 10s interval: **~96 requests/minute** ✅ SAFE

## Alternatives for More Stocks

### Option 1: Rotate Stock Universe (FUTURE)
Instead of scanning all 70 every cycle, rotate:
- Cycle 1: Scan stocks 1-10
- Cycle 2: Scan stocks 11-20
- Cycle 3: Scan stocks 21-30
- Etc.

Spreads the API calls over time.

### Option 2: Paid Alpaca Plan
Upgrade to Alpaca's paid tier:
- Unlimited API requests
- Better market data
- No rate limits

### Option 3: Cache Scanning Results
- Scan all 70 stocks once per 5 minutes
- Cache the top 20 candidates
- Use cached list for 5 minutes
- Reduces API calls dramatically

## Current Recommendation

**Keep scanning DISABLED** (default):
- Trade the curated 10-stock list
- Full continuous adaptive trading
- No rate limit issues
- Still get ML predictions, news sentiment, FRED data
- Smart capital allocation
- Buy/sell based on ML signals

**After you see the bot working well with 10 stocks, we can implement one of the alternatives above to scale up!**

## Summary

✅ **Bot now works without rate limit errors**  
✅ **Trades 10 high-quality stocks continuously**  
✅ **Buys new opportunities when ML says to**  
✅ **Sells existing positions when ML says to**  
✅ **Smart capital allocation based on confidence**  
✅ **Integrates news sentiment and FRED data**  

The bot is fully functional! Just with 10 stocks instead of 70+ to respect rate limits. 🎉

