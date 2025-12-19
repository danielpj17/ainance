# Trading Algorithms Verification Guide

## Overview
This guide explains how each rule-based algorithm makes buy/sell decisions and how to verify they work correctly.

## ⚠️ IMPORTANT: Confidence Thresholds Apply to ALL Algorithms

**Your configured confidence thresholds work for:**
- ✅ ML Model (Random Forest)
- ✅ Simple Rule-Based Algorithm
- ✅ Advanced Rule-Based Algorithm

**How it works:**
1. Algorithm generates signal with confidence (e.g., "BUY at 75%")
2. Signal is filtered by YOUR thresholds:
   - **BUY Threshold** (default 65%) - adjusted by market risk
   - **SELL Threshold** (default 50%) - adjusted by market risk
3. Only signals above threshold are executed

**Example:**
```
Your Settings: BUY=70%, SELL=55%
Market Risk: 30% (moderate)

Algorithm says: BUY AAPL at 68% confidence
→ Threshold after risk adjustment: 70% + (30% × 15%) = 74.5%
→ Result: BLOCKED (68% < 74.5%)

Algorithm says: SELL TSLA at 60% confidence  
→ Threshold after risk adjustment: 55% - (30% × 15%) = 50.5%
→ Result: EXECUTED (60% > 50.5%)
```

---

## 1. Simple Rule-Based Algorithm

### Buy Conditions (Priority Order):
1. **RSI < 30** → BUY (70% confidence)
   - Stock is oversold, likely to bounce back
   
2. **MACD > 0 AND EMA Trend = 1** → BUY (65% confidence)
   - Bullish momentum with upward trend

### Sell Conditions (Priority Order):
1. **RSI > 70** → SELL (70% confidence)
   - Stock is overbought, likely to pull back
   
2. **MACD < 0 AND EMA Trend = -1** → SELL (65% confidence)
   - Bearish momentum with downward trend

### Confidence Adjustments:
- **Positive News + Buy Signal**: +15% confidence (max 95%)
- **Negative News + Sell Signal**: +15% confidence (max 95%)
- **Conflicting News**: -15% confidence (min 40%)

### Example:
```typescript
RSI = 25 (oversold)
→ Action: BUY, Confidence: 70%

News Sentiment = 0.3 (positive)
→ Adjusted Confidence: 85% (70% + 15%)
```

---

## 2. Advanced Rule-Based Algorithm

### Scoring System (Points = Buy/Sell Strength):

| Indicator | Condition | Points | Reasoning |
|-----------|-----------|--------|-----------|
| **RSI** | > 70 | -2 | Overbought |
| **RSI** | < 30 | +2 | Oversold |
| **MACD Histogram** | > 0 | +1.5 | Bullish momentum |
| **MACD Histogram** | < 0 | -1.5 | Bearish momentum |
| **Bollinger Bands** | Position > 0.9 | -1 | Near upper band |
| **Bollinger Bands** | Position < 0.1 | +1 | Near lower band |
| **Volume Ratio** | < 0.5 | -0.5 | Low volume weakens signal |
| **Stochastic** | > 80 | -1 | Overbought |
| **Stochastic** | < 20 | +1 | Oversold |
| **EMA Trend** | = 1 | +0.5 | Bullish trend |
| **EMA Trend** | = -1 | -0.5 | Bearish trend |
| **News Sentiment** | abs() > 0.2 | ±0.5 | Sentiment influence |

### Decision Logic:
- **Score ≥ +2** → BUY (confidence = 60% + (score-2) × 10%)
- **Score ≤ -2** → SELL (confidence = 60% + abs(score+2) × 10%)
- **-2 < Score < +2** → HOLD (confidence = 60%)

### Example Strong Buy:
```
RSI = 28 (oversold)          → +2 points
MACD Histogram = 0.5         → +1.5 points  
BB Position = 0.08           → +1 point
Stochastic = 18              → +1 point
EMA Trend = 1                → +0.5 points
News Sentiment = 0.6         → +0.3 points
────────────────────────────────────────
Total Score = +6.3

Decision: BUY
Confidence: 60% + (6.3-2) × 10% = 103% → capped at 95%
```

---

## How to Test the Algorithms

### Option 1: Run the Test Script (Recommended)

1. Install dependencies:
```bash
npm install tsx --save-dev
```

2. Run the test:
```bash
npx tsx test-algorithms.ts
```

This will test both algorithms with 7 different market scenarios and show:
- What action each algorithm takes (BUY/SELL/HOLD)
- The confidence level
- The reasoning behind each decision
- Whether it matches expected behavior

### Option 2: Manual Testing via API

1. **Create a test endpoint** to call the algorithms directly with custom features
2. **Or** check the bot logs when it runs - look for:
   - Algorithm type being used
   - Signals generated
   - Actions taken

### Option 3: Check Bot Diagnostics

When the bot runs, check the diagnostics to see:
```
Algorithm Type: rule_based_simple (or rule_based_advanced)
Total ML Signals: 20
Buy Signals: 5
Sell Signals: 3
```

---

## Real-World Verification Checklist

### ✅ For Simple Rule-Based:

- [ ] **Test Oversold Stock (RSI < 30)**
  - Should generate BUY signal with 70% confidence
  - Check: Does it actually place a buy order?

- [ ] **Test Overbought Stock (RSI > 70)**
  - Should generate SELL signal with 70% confidence
  - Check: Does it sell if you have a position?

- [ ] **Test Bullish Momentum (MACD+ & EMA↑)**
  - Should generate BUY signal with 65% confidence
  - Check: Confidence adjusts with news sentiment

- [ ] **Test Neutral Market (RSI ~50)**
  - Should generate HOLD signal
  - Check: No trades executed

### ✅ For Advanced Rule-Based:

- [ ] **Test Multiple Buy Signals**
  - RSI < 30, MACD+, Stochastic < 20, BB near lower
  - Should generate BUY with high confidence (75-95%)

- [ ] **Test Multiple Sell Signals**
  - RSI > 70, MACD-, Stochastic > 80, BB near upper
  - Should generate SELL with high confidence (75-95%)

- [ ] **Test Conflicting Signals**
  - RSI oversold but MACD bearish
  - Score should be near zero → HOLD

- [ ] **Test Volume Impact**
  - Low volume (< 0.5) should reduce score by 0.5
  - Weakens both buy and sell signals

---

## Common Issues & Solutions

### Issue: Algorithm generates signals but no trades execute

**Possible Causes:**
1. **Confidence Below Threshold**
   - Check your account settings in the Strategy Modal
   - Default: BUY=65%, SELL=50%
   - Market risk adjustment can increase BUY threshold by up to 15%
   - Signal confidence must exceed adjusted threshold
   - **This applies to ALL algorithms equally**
   
2. **Market Closed**
   - Trading only happens during market hours (9:30 AM - 4:00 PM ET)
   
3. **Last 30 Minutes of Trading**
   - Bot prevents new BUY orders in last 30 minutes
   - Only SELL orders allowed

4. **Capital Allocation**
   - Not enough buying power available
   - Max exposure limit reached

### Issue: Too many HOLD signals

**For Simple:**
- RSI between 30-70 with neutral MACD → Expected behavior
- Increase sensitivity by adjusting RSI thresholds in code

**For Advanced:**
- Score between -2 and +2 → Expected behavior  
- Multiple indicators canceling each other out
- This is actually good - prevents overtrading

### Issue: Wrong action taken (BUY when should SELL)

**Check:**
1. Algorithm type in database matches what you selected
2. Bot diagnostics shows correct algorithm_type
3. No errors in bot logs

---

## Monitoring Algorithm Performance

### View in Bot Logs:
```sql
SELECT 
  data->>'algorithm_type' as algorithm,
  data->'diagnostics'->>'total_ml_signals' as total_signals,
  data->'diagnostics'->>'final_buy_signals' as buy_signals,
  data->'diagnostics'->>'final_sell_signals' as sell_signals,
  created_at
FROM bot_logs 
WHERE action = 'execute' 
ORDER BY created_at DESC 
LIMIT 10;
```

### Compare Algorithm Performance:
Track win rate by algorithm type:
```sql
SELECT 
  algorithm_type,
  COUNT(*) as total_trades,
  SUM(CASE WHEN profit_loss > 0 THEN 1 ELSE 0 END) as winning_trades,
  ROUND(AVG(profit_loss_percent), 2) as avg_profit_pct
FROM (
  SELECT 
    buy_decision_metrics->>'algorithm_type' as algorithm_type,
    profit_loss,
    profit_loss_percent
  FROM trade_logs 
  WHERE status = 'closed'
) t
GROUP BY algorithm_type;
```

---

## Quick Verification Commands

### Test that functions exist:
```bash
npx tsx test-algorithms.ts
```

### Check which algorithm is selected:
```sql
SELECT 
  pta.account_name,
  ass.algorithm_type,
  ass.confidence_threshold
FROM paper_trading_accounts pta
JOIN account_strategy_settings ass ON ass.account_id = pta.id
WHERE pta.user_id = 'your-user-id';
```

### Verify bot is using correct algorithm:
```sql
SELECT 
  data->'diagnostics'->>'algorithm_type' as algorithm_used,
  message,
  created_at
FROM bot_logs 
WHERE user_id = 'your-user-id'
ORDER BY created_at DESC 
LIMIT 5;
```

---

## Expected Behavior Summary

| Scenario | Simple Algorithm | Advanced Algorithm |
|----------|------------------|-------------------|
| RSI = 25 | BUY (70%) | BUY (70-85%) |
| RSI = 75 | SELL (70%) | SELL (70-85%) |
| RSI = 50, MACD+ | BUY (65%) | Depends on other indicators |
| RSI = 50, MACD- | SELL (65%) | Depends on other indicators |
| All neutral | HOLD (50-60%) | HOLD (60%) |
| Multiple bullish | BUY (65-85%) | BUY (75-95%) |
| Multiple bearish | SELL (65-85%) | SELL (75-95%) |

**Key Difference:**
- **Simple**: Relies on 1-2 primary indicators
- **Advanced**: Considers all indicators with weighted scoring

---

## Need Help?

If algorithms aren't behaving as expected:
1. Run `npx tsx test-algorithms.ts` to verify core logic
2. Check bot logs for algorithm_type being used
3. Verify confidence thresholds in settings
4. Check trade_logs for actual trades executed
5. Look for errors in bot_logs table

The test script will confirm the algorithms work correctly in isolation - any issues are likely in configuration or market conditions.

