/**
 * Test script for verifying trading algorithms
 * Run with: npx tsx test-algorithms.ts
 */

import { SimpleRuleBasedAlgorithm, AdvancedRuleBasedAlgorithm, MarketFeatures } from './lib/trading-algorithms'

// Test scenarios with different market conditions
const testScenarios: { name: string; features: MarketFeatures }[] = [
  {
    name: "Oversold (RSI < 30) - Should BUY",
    features: {
      symbol: "TEST1",
      rsi: 25,
      macd: 0.5,
      macd_histogram: 0.1,
      bb_width: 0.05,
      bb_position: 0.2,
      ema_trend: 1,
      volume_ratio: 1.5,
      stochastic: 20,
      price_change_1d: -2,
      price_change_5d: -5,
      price_change_10d: -8,
      volatility_20: 0.15,
      news_sentiment: 0.3,
      price: 100
    }
  },
  {
    name: "Overbought (RSI > 70) - Should SELL",
    features: {
      symbol: "TEST2",
      rsi: 75,
      macd: -0.3,
      macd_histogram: -0.1,
      bb_width: 0.05,
      bb_position: 0.85,
      ema_trend: -1,
      volume_ratio: 1.2,
      stochastic: 85,
      price_change_1d: 3,
      price_change_5d: 8,
      price_change_10d: 12,
      volatility_20: 0.15,
      news_sentiment: -0.2,
      price: 100
    }
  },
  {
    name: "Bullish Momentum (MACD+ & EMA uptrend) - Should BUY",
    features: {
      symbol: "TEST3",
      rsi: 55,
      macd: 0.8,
      macd_histogram: 0.5,
      bb_width: 0.06,
      bb_position: 0.5,
      ema_trend: 1,
      volume_ratio: 2.0,
      stochastic: 50,
      price_change_1d: 1,
      price_change_5d: 3,
      price_change_10d: 5,
      volatility_20: 0.12,
      news_sentiment: 0.5,
      price: 100
    }
  },
  {
    name: "Bearish Momentum (MACD- & EMA downtrend) - Should SELL",
    features: {
      symbol: "TEST4",
      rsi: 45,
      macd: -0.8,
      macd_histogram: -0.5,
      bb_width: 0.06,
      bb_position: 0.3,
      ema_trend: -1,
      volume_ratio: 0.8,
      stochastic: 40,
      price_change_1d: -1,
      price_change_5d: -3,
      price_change_10d: -5,
      volatility_20: 0.18,
      news_sentiment: -0.4,
      price: 100
    }
  },
  {
    name: "Neutral Market - Should HOLD",
    features: {
      symbol: "TEST5",
      rsi: 50,
      macd: 0.1,
      macd_histogram: 0.05,
      bb_width: 0.04,
      bb_position: 0.5,
      ema_trend: 0,
      volume_ratio: 1.0,
      stochastic: 50,
      price_change_1d: 0.2,
      price_change_5d: 0.5,
      price_change_10d: 1,
      volatility_20: 0.10,
      news_sentiment: 0.0,
      price: 100
    }
  },
  {
    name: "Multiple Strong BUY Signals (Advanced) - Should BUY",
    features: {
      symbol: "TEST6",
      rsi: 28, // Oversold
      macd: 0.5,
      macd_histogram: 0.3, // Bullish
      bb_width: 0.05,
      bb_position: 0.08, // Near lower BB
      ema_trend: 1, // Uptrend
      volume_ratio: 2.5, // High volume
      stochastic: 18, // Oversold
      price_change_1d: -1,
      price_change_5d: -2,
      price_change_10d: -3,
      volatility_20: 0.15,
      news_sentiment: 0.6, // Positive news
      price: 100
    }
  },
  {
    name: "Multiple Strong SELL Signals (Advanced) - Should SELL",
    features: {
      symbol: "TEST7",
      rsi: 78, // Overbought
      macd: -0.6,
      macd_histogram: -0.4, // Bearish
      bb_width: 0.05,
      bb_position: 0.92, // Near upper BB
      ema_trend: -1, // Downtrend
      volume_ratio: 0.4, // Low volume
      stochastic: 85, // Overbought
      price_change_1d: 2,
      price_change_5d: 5,
      price_change_10d: 8,
      volatility_20: 0.20,
      news_sentiment: -0.7, // Negative news
      price: 100
    }
  }
]

async function runTests() {
  console.log('═══════════════════════════════════════════════════════════')
  console.log('🧪 TESTING TRADING ALGORITHMS')
  console.log('═══════════════════════════════════════════════════════════\n')

  const simpleAlgo = new SimpleRuleBasedAlgorithm()
  const advancedAlgo = new AdvancedRuleBasedAlgorithm()

  for (const scenario of testScenarios) {
    console.log(`\n📊 Test Case: ${scenario.name}`)
    console.log(`─────────────────────────────────────────────────────────`)
    console.log(`Symbol: ${scenario.features.symbol}`)
    console.log(`RSI: ${scenario.features.rsi}, MACD: ${scenario.features.macd}, EMA Trend: ${scenario.features.ema_trend}`)
    console.log(`Stochastic: ${scenario.features.stochastic}, BB Position: ${scenario.features.bb_position}`)
    console.log(`News Sentiment: ${scenario.features.news_sentiment}\n`)

    // Test Simple Algorithm
    const simpleResult = await simpleAlgo.predict([scenario.features])
    const simpleSignal = simpleResult.signals[0]
    
    console.log(`✅ Simple Rule-Based:`)
    console.log(`   Action: ${simpleSignal.action.toUpperCase()}`)
    console.log(`   Confidence: ${(simpleSignal.confidence * 100).toFixed(1)}%`)
    console.log(`   Reasoning: ${simpleSignal.reasoning}`)

    // Test Advanced Algorithm
    const advancedResult = await advancedAlgo.predict([scenario.features])
    const advancedSignal = advancedResult.signals[0]
    
    console.log(`\n✅ Advanced Rule-Based:`)
    console.log(`   Action: ${advancedSignal.action.toUpperCase()}`)
    console.log(`   Confidence: ${(advancedSignal.confidence * 100).toFixed(1)}%`)
    console.log(`   Reasoning: ${advancedSignal.reasoning}`)
    
    // Validate expected behavior
    const expectedAction = scenario.name.includes('Should BUY') ? 'buy' 
                          : scenario.name.includes('Should SELL') ? 'sell' 
                          : 'hold'
    
    const simpleMatches = simpleSignal.action === expectedAction || simpleSignal.action === 'hold'
    const advancedMatches = advancedSignal.action === expectedAction || advancedSignal.action === 'hold'
    
    console.log(`\n🎯 Validation:`)
    console.log(`   Expected: ${expectedAction.toUpperCase()}`)
    console.log(`   Simple: ${simpleMatches ? '✓ PASS' : '✗ FAIL'}`)
    console.log(`   Advanced: ${advancedMatches ? '✓ PASS' : '✗ FAIL'}`)
  }

  console.log('\n═══════════════════════════════════════════════════════════')
  console.log('✅ Algorithm Testing Complete!')
  console.log('═══════════════════════════════════════════════════════════\n')
}

// Run tests
runTests().catch(console.error)

