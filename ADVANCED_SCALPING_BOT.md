# 🤖 Advanced Scalping Bot - Documentation

## Overview

The Advanced Scalping Bot is an intelligent trading system that:
- 🔍 **Scans 70+ liquid stocks** dynamically every cycle
- 📊 **Uses macro-economic data** (FRED) to adjust risk
- 📰 **Integrates news sentiment** to boost confidence
- 🧠 **Leverages ML predictions** from Random Forest model
- 💰 **Intelligently allocates capital** based on confidence + market conditions

## Features

### 1. Dynamic Stock Scanning 🔍
- Scans a curated universe of 70+ high-liquidity stocks
- Evaluates candidates based on:
  - **Volume ratio** (current vs 20-period average)
  - **Volatility** (optimal range: 1-3%)
  - **Spread** (bid-ask spread < 1%)
  - **Liquidity** (minimum average volume)
- Selects top 20 candidates each cycle
- Fallback to default stocks if scanning fails

### 2. FRED Economic Integration 📊
Fetches real-time economic indicators:
- **VIX** (Volatility Index) - market fear gauge
- **Yield Curve** (10Y - 2Y) - recession indicator
- **Fed Funds Rate** - monetary policy stance
- **Unemployment Rate** - economic health
- **CPI & PCE** - inflation metrics

**Market Risk Score:**
- Calculated from FRED indicators (0-1 scale)
- Adjusts confidence thresholds dynamically
- Reduces position sizes in high-risk environments

### 3. News Sentiment Analysis 📰
- Fetches news for all scanned stocks
- Uses VADER sentiment analysis
- Boosts/reduces ML confidence by up to 15%
- Caches results to respect API rate limits

### 4. ML Model Integration 🧠
- Calls Google Cloud Run ML service
- Uses Random Forest model trained on 100 stocks
- 14 technical indicators + news sentiment
- Returns BUY/SELL/HOLD with confidence scores

### 5. Intelligent Capital Allocation 💰
Dynamic position sizing based on:
- **Confidence scores** - higher confidence = larger position
- **Market risk** - reduces positions in volatile markets
- **Risk limits:**
  - Max 15% per position (adjusted for risk)
  - Max 70% total exposure (adjusted for risk)
- Prevents over-leveraging

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    TRADING BOT CYCLE                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
        ┌──────────────────────────────────────┐
        │  1. Get FRED Economic Indicators     │
        │     → Calculate Market Risk (0-1)     │
        │     → Adjust confidence threshold     │
        └──────────────────────────────────────┘
                              │
                              ▼
        ┌──────────────────────────────────────┐
        │  2. Dynamic Stock Scanning           │
        │     → Scan 70+ stocks                 │
        │     → Score by volume, volatility     │
        │     → Select top 20 candidates        │
        └──────────────────────────────────────┘
                              │
                              ▼
        ┌──────────────────────────────────────┐
        │  3. Get Technical Indicators         │
        │     → RSI, MACD, Bollinger Bands     │
        │     → Volume ratios, EMA trends       │
        │     → Volatility, price changes       │
        └──────────────────────────────────────┘
                              │
                              ▼
        ┌──────────────────────────────────────┐
        │  4. Get News Sentiment               │
        │     → Fetch recent news               │
        │     → VADER sentiment analysis        │
        │     → Cache results (rate limiting)   │
        └──────────────────────────────────────┘
                              │
                              ▼
        ┌──────────────────────────────────────┐
        │  5. Enhance Features                 │
        │     → Add news_sentiment              │
        │     → Add market_risk, VIX            │
        │     → Add yield_curve, fed_funds      │
        └──────────────────────────────────────┘
                              │
                              ▼
        ┌──────────────────────────────────────┐
        │  6. Get ML Predictions               │
        │     → Call Google Cloud Run           │
        │     → Random Forest model             │
        │     → Returns BUY/SELL/HOLD signals   │
        └──────────────────────────────────────┘
                              │
                              ▼
        ┌──────────────────────────────────────┐
        │  7. Filter & Enhance Signals         │
        │     → Boost with news sentiment       │
        │     → Filter by confidence threshold  │
        │     → Sort by adjusted confidence     │
        └──────────────────────────────────────┘
                              │
                              ▼
        ┌──────────────────────────────────────┐
        │  8. Intelligent Capital Allocation   │
        │     → Calculate position sizes        │
        │     → Respect risk limits             │
        │     → Adjust for market risk          │
        └──────────────────────────────────────┘
                              │
                              ▼
        ┌──────────────────────────────────────┐
        │  9. Execute Trades                   │
        │     → Place orders via Alpaca         │
        │     → Log to database                 │
        │     → Error handling & retries        │
        └──────────────────────────────────────┘
```

## Setup

### 1. Get API Keys

#### FRED API Key (Free)
1. Visit: https://fred.stlouisfed.org/docs/api/api_key.html
2. Click "Request an API Key"
3. Fill out the form (takes 2 minutes)
4. Copy your API key

#### News API Key (Free - 100 requests/day)
1. Visit: https://newsapi.org/register
2. Sign up for free account
3. Copy your API key

### 2. Update Environment Variables

Add to your `.env.local`:

```bash
# FRED API Key (Federal Reserve Economic Data)
FRED_API_KEY=your_fred_api_key_here

# News API Key (for sentiment analysis)
NEWS_API_KEY=your_news_api_key_here
```

Also add these to your **Vercel** environment variables:
1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Add `FRED_API_KEY`
3. Add `NEWS_API_KEY`
4. **Redeploy** your app

### 3. Verify Installation

Run the bot and check logs for:
```
✅ FRED service initialized
✅ News analyzer initialized
📊 Market Risk Score: 32.5% | Min Confidence: 60%
🔍 Scanning 70 stocks for scalping opportunities...
🎯 Top 5 candidates: NVDA(85.3), AAPL(82.1), SPY(79.8), ...
```

## Configuration

### Stock Universe
Edit `lib/stock-scanner.ts`:
```typescript
const SCALPING_UNIVERSE = [
  'AAPL', 'MSFT', 'NVDA', // Add/remove stocks
  // ...
];
```

### Risk Parameters
Edit `app/api/trading/route.ts`:
```typescript
const maxPositionPct = 0.15 // 15% max per position
const maxTotalExposure = 0.7 // 70% max total exposure
```

### Confidence Thresholds
```typescript
const minConfidence = 0.55 + (marketRisk * 0.15)
// Low risk (20%): 58% min confidence
// High risk (80%): 67% min confidence
```

## Usage

### Start the Bot
1. Go to Paper Trading page (`/dashboard/paper`)
2. Click "Start Bot"
3. Monitor logs in Vercel Functions dashboard

### Monitor Performance
The bot logs comprehensive information:
- 🔍 Stock scanning results
- 📊 Market risk assessment
- 🧠 ML predictions
- 💰 Capital allocation
- 📝 Trade execution

### Example Output
```
═══════════════════════════════════════════════════════════
🤖 STARTING ADVANCED SCALPING BOT CYCLE
═══════════════════════════════════════════════════════════
✅ Alpaca client initialized ( PAPER trading)
📊 Market Risk: 32.5% | Min Confidence: 60%
🔍 Scanning 70 stocks for scalping opportunities...
✅ Found 68 valid scalping candidates
🎯 Top 5 candidates:
   1. NVDA: Score 85.3, Vol 2.15x, Volatility 2.34%
   2. AAPL: Score 82.1, Vol 1.89x, Volatility 1.98%
   3. SPY: Score 79.8, Vol 1.45x, Volatility 1.23%
   4. QQQ: Score 78.4, Vol 1.67x, Volatility 1.87%
   5. TSLA: Score 77.2, Vol 2.34x, Volatility 3.12%
📈 Fetching technical indicators...
✅ Technical indicators received for 20 symbols
📰 Fetching news sentiment...
✅ News sentiment received for 18 symbols
🔬 Enhancing features with macro data...
🧠 Calling ML prediction service...
✅ ML predictions received for 20 symbols
🎯 Generated 8 high-confidence signals (filtered from 20)
💰 Allocating capital: $100000.00 available
   Risk Adjustment: 84%
   Max Per Position: 12.6%
   Max Total Exposure: 58.8%
   ✅ Allocated $45678.90 (45.7%) across 7 positions
═══════════════════════════════════════════════════════════
💰 CAPITAL ALLOCATION COMPLETE: 7 positions
═══════════════════════════════════════════════════════════
1. BUY NVDA @ $188.34
   Confidence: 72.3% | Shares: 35 | Capital: $6591.90
   Reasoning: Bullish momentum (MACD+, EMA+)
   News: 📈 12.5%
2. BUY AAPL @ $178.92
   Confidence: 68.7% | Shares: 40 | Capital: $7156.80
   Reasoning: Oversold (RSI<30)
   News: 📈 8.2%
...
```

## Key Features

### Adaptive Risk Management
- Automatically reduces position sizes in volatile markets
- Raises confidence thresholds during high risk periods
- Respects maximum exposure limits

### News-Enhanced Predictions
- ML confidence boosted by up to 15% with positive news
- Filtered for trading-relevant keywords
- Cached to respect API rate limits (100/day)

### Dynamic Stock Selection
- Always trades the most liquid, volatile stocks
- Adapts to market conditions in real-time
- No static symbol list

## Troubleshooting

### FRED API Errors
```
⚠️ FRED not initialized, using default risk parameters
```
**Solution:** Check `FRED_API_KEY` in environment variables

### News API Errors
```
⚠️ News sentiment unavailable
```
**Solution:** 
- Check `NEWS_API_KEY` in environment variables
- Verify you haven't exceeded 100 requests/day (free tier)

### Stock Scanner Errors
```
⚠️ Stock scanning failed, using default stocks
```
**Solution:** This is normal during market hours when data might be unavailable. The bot falls back to default stocks (AAPL, MSFT, NVDA, etc.)

### ML Service Errors
```
❌ ML service returned 503
```
**Solution:** Check Google Cloud Run service is running and `ML_SERVICE_URL` is correct

## Performance Tips

1. **Market Hours**: Bot works best during regular trading hours (9:30 AM - 4:00 PM ET)
2. **API Rate Limits**: 
   - FRED: No strict limit (daily updates)
   - News API: 100 requests/day (free tier)
   - Alpaca: 200 requests/minute
3. **Interval**: Recommended 30-60 seconds per cycle
4. **Paper Trading**: Always test thoroughly before live trading

## Next Steps

- [ ] Add backtesting with FRED data
- [ ] Implement stop-loss based on market risk
- [ ] Add email/SMS alerts for high-confidence trades
- [ ] Create dashboard for economic indicators
- [ ] Optimize scanning parameters based on performance

## Support

For issues or questions:
1. Check Vercel function logs
2. Review this documentation
3. Check environment variables are set correctly
4. Verify API keys are valid and have remaining quota

