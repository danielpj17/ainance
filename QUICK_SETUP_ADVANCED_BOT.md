# 🚀 Quick Setup: Advanced Scalping Bot

## Get Your API Keys (5 minutes)

### 1. FRED API Key (FREE - No Credit Card)
1. Go to: **https://fred.stlouisfed.org/docs/api/api_key.html**
2. Click **"Request an API Key"**
3. Fill out quick form (Name, Email, Purpose: "Personal Trading Bot")
4. Copy your API key from email

### 2. News API Key (FREE - 100 requests/day)
1. Go to: **https://newsapi.org/register**
2. Sign up with email
3. Verify email
4. Copy API key from dashboard

---

## Add to Local Environment (1 minute)

Create or update `.env.local`:

```bash
# Add these new lines:
FRED_API_KEY=your_fred_api_key_here
NEWS_API_KEY=your_news_api_key_here
```

---

## Add to Vercel (2 minutes)

1. Go to **Vercel Dashboard** → Your Project
2. Click **Settings** → **Environment Variables**
3. Add:
   - `FRED_API_KEY` = `your_fred_api_key`
   - `NEWS_API_KEY` = `your_news_api_key`
4. Click **Save**
5. **Redeploy** (click Deployments → ... → Redeploy)

---

## Test It! (1 minute)

Wait for Vercel deployment to complete, then:

1. Go to `/dashboard/paper`
2. Click **"Start Bot"**
3. Check Vercel Function Logs for:
   ```
   ✅ FRED service initialized
   ✅ News analyzer initialized
   📊 Market Risk Score: 32.5%
   🔍 Scanning 70 stocks...
   🎯 Top 5 candidates: NVDA(85.3), AAPL(82.1)...
   ```

---

## What Changed?

### Before:
- Bot traded only 4 fixed stocks (AAPL, MSFT, TSLA, SPY)
- Simple sentiment-based signals
- No risk adjustment
- Fixed position sizes

### After:
- 🔍 **Scans 70+ stocks dynamically** for best opportunities
- 📊 **Uses FRED economic data** (VIX, yield curve, Fed rates)
- 📰 **Integrates news sentiment** to boost ML confidence
- 💰 **Intelligent capital allocation** based on confidence + market risk
- 🎯 **Adapts to market conditions** automatically

---

## Example Bot Cycle

```
═══════════════════════════════════════════════════════════
🤖 STARTING ADVANCED SCALPING BOT CYCLE
═══════════════════════════════════════════════════════════
📊 Market Risk: 32.5% | Min Confidence: 60%
🔍 Scanning 70 stocks...
🎯 Top 5: NVDA(85.3), AAPL(82.1), SPY(79.8), QQQ(78.4), TSLA(77.2)
📈 Technical indicators: 20 symbols ✅
📰 News sentiment: 18 symbols ✅
🧠 ML predictions: 20 symbols ✅
🎯 Generated 8 high-confidence signals
💰 Allocated $45,678.90 across 7 positions

1. BUY NVDA @ $188.34
   Confidence: 72.3% | Shares: 35 | $6,591.90
   Reasoning: Bullish momentum (MACD+, EMA+)
   News: 📈 12.5%

2. BUY AAPL @ $178.92
   Confidence: 68.7% | Shares: 40 | $7,156.80
   Reasoning: Oversold (RSI<30)
   News: 📈 8.2%
...
```

---

## Features

✅ **Dynamic Stock Universe**: Automatically finds best scalping candidates  
✅ **Macro Risk Adjustment**: Reduces positions when VIX is high, yield curve inverts  
✅ **News-Boosted Confidence**: Positive news = larger positions  
✅ **Intelligent Allocation**: Higher confidence = more capital  
✅ **Risk Limits**: Max 15% per position, 70% total (adjusted for market risk)  

---

## Troubleshooting

**FRED not working?**
```
⚠️ FRED not initialized, using default risk parameters
```
→ Check environment variable `FRED_API_KEY` is set in Vercel

**News not working?**
```
⚠️ News sentiment unavailable
```
→ Check `NEWS_API_KEY` is set
→ Free tier = 100 requests/day

**Scanner failing?**
```
⚠️ Stock scanning failed, using default stocks
```
→ Normal during market hours, falls back gracefully

---

## Next Steps

1. ✅ Set up API keys (above)
2. ✅ Test in paper trading
3. 📊 Monitor performance for a few days
4. 🎯 Adjust parameters if needed (see `ADVANCED_SCALPING_BOT.md`)
5. 🚀 Consider live trading (test thoroughly first!)

---

## Support

Full documentation: **`ADVANCED_SCALPING_BOT.md`**

Questions? Check:
- Vercel function logs
- Environment variables are set correctly
- API keys are valid

**Enjoy your intelligent scalping bot!** 🎉

