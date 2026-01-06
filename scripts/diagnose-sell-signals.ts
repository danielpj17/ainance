/**
 * Diagnostic Script: Check Why Rule-Based Algorithms Aren't Selling
 * 
 * This script helps diagnose issues with sell signal generation for rule-based algorithms
 */

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { SimpleRuleBasedAlgorithm, AdvancedRuleBasedAlgorithm } from '../lib/trading-algorithms.js'

// Load environment variables
config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing required environment variables!')
  console.error('   NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? '✅' : '❌')
  console.error('   SUPABASE_SERVICE_ROLE_KEY:', supabaseKey ? '✅' : '❌')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function diagnose() {
  console.log('🔍 Diagnosing Rule-Based Algorithm Sell Signal Issues')
  console.log('═══════════════════════════════════════════════════════════\n')
  
  // 1. Check if there are any open positions
  console.log('📊 Step 1: Checking for open positions...')
  const { data: openTrades, error: tradesError } = await supabase
    .from('trade_logs')
    .select('*')
    .eq('status', 'open')
    .eq('action', 'buy')
    .order('buy_timestamp', { ascending: false })
  
  if (tradesError) {
    console.error('❌ Error fetching open trades:', tradesError)
    return
  }
  
  console.log(`   Found ${openTrades?.length || 0} open positions\n`)
  
  if (!openTrades || openTrades.length === 0) {
    console.log('⚠️  NO OPEN POSITIONS FOUND')
    console.log('   The bot cannot generate sell signals without open positions.')
    console.log('   Rule-based algorithms only generate sell signals for stocks you currently hold.\n')
    return
  }
  
  // Display open positions
  console.log('   Open Positions:')
  openTrades.forEach((trade: any) => {
    console.log(`   - ${trade.symbol}: ${trade.qty} shares @ $${trade.buy_price} (bought ${new Date(trade.buy_timestamp).toLocaleString()})`)
  })
  console.log('')
  
  // 2. Check account strategy settings
  console.log('📊 Step 2: Checking account strategy settings...')
  const { data: accounts, error: accountsError } = await supabase
    .from('paper_trading_accounts')
    .select('id, account_name')
    .limit(1)
  
  if (accountsError || !accounts || accounts.length === 0) {
    console.error('❌ Error fetching accounts or no accounts found')
    return
  }
  
  const accountId = accounts[0].id
  console.log(`   Account: ${accounts[0].account_name} (${accountId})`)
  
  const { data: strategyData, error: strategyError } = await supabase
    .from('account_strategy_settings')
    .select('*')
    .eq('account_id', accountId)
    .single()
  
  if (strategyError) {
    console.error('❌ Error fetching strategy settings:', strategyError)
    return
  }
  
  console.log(`   Algorithm: ${strategyData.algorithm_type}`)
  console.log(`   BUY Confidence Threshold: ${(strategyData.confidence_threshold * 100).toFixed(1)}%`)
  console.log(`   SELL Confidence Threshold: ${(strategyData.sell_confidence_threshold * 100).toFixed(1)}%`)
  console.log('')
  
  // 3. Simulate sell signal generation for held positions
  console.log('📊 Step 3: Simulating sell signal generation for held positions...')
  console.log('   (This will show if the algorithm would generate sell signals)\n')
  
  // Get unique symbols from open trades
  const heldSymbols = [...new Set(openTrades.map((t: any) => t.symbol))]
  console.log(`   Analyzing ${heldSymbols.length} held symbols: ${heldSymbols.join(', ')}\n`)
  
  // Fetch technical indicators for held positions
  console.log('   Fetching technical indicators...')
  try {
    const response = await fetch('http://localhost:3000/api/stocks/indicators', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbols: heldSymbols })
    })
    
    const indicatorsData = await response.json()
    
    if (!indicatorsData.success || !indicatorsData.indicators) {
      console.error('❌ Failed to fetch indicators:', indicatorsData.error)
      return
    }
    
    console.log(`   ✅ Indicators received for ${indicatorsData.indicators.length} symbols\n`)
    
    // Create algorithm instance based on strategy settings
    const algorithm = strategyData.algorithm_type === 'rule_based_simple' 
      ? new SimpleRuleBasedAlgorithm()
      : new AdvancedRuleBasedAlgorithm()
    
    console.log(`   Using algorithm: ${algorithm.name}\n`)
    
    // Generate signals
    const result = await algorithm.predict(indicatorsData.indicators)
    
    if (!result.success) {
      console.error('❌ Algorithm failed:', result.error)
      return
    }
    
    console.log('📊 Generated Signals:')
    console.log('═══════════════════════════════════════════════════════════')
    
    const sellSignals = result.signals.filter(s => s.action === 'sell')
    const holdSignals = result.signals.filter(s => s.action === 'hold')
    const buySignals = result.signals.filter(s => s.action === 'buy')
    
    console.log(`   Total Signals: ${result.signals.length}`)
    console.log(`   - SELL: ${sellSignals.length}`)
    console.log(`   - HOLD: ${holdSignals.length}`)
    console.log(`   - BUY: ${buySignals.length} (ignored for held positions)\n`)
    
    if (sellSignals.length > 0) {
      console.log('   📉 SELL Signals (would trigger if above threshold):')
      sellSignals.forEach(signal => {
        const meetsThreshold = signal.confidence >= strategyData.sell_confidence_threshold
        console.log(`   - ${signal.symbol}: ${(signal.confidence * 100).toFixed(1)}% ${meetsThreshold ? '✅ ABOVE' : '❌ BELOW'} threshold (${(strategyData.sell_confidence_threshold * 100).toFixed(1)}%)`)
        console.log(`     Reasoning: ${signal.reasoning}`)
        console.log(`     Indicators: RSI=${signal.indicators?.rsi}, MACD=${signal.indicators?.macd}, EMA=${signal.indicators?.ema_trend}`)
      })
    } else {
      console.log('   ⚠️  NO SELL SIGNALS GENERATED')
      console.log('   This means the algorithm thinks all positions should be held.')
    }
    
    console.log('')
    
    if (holdSignals.length > 0) {
      console.log('   📊 HOLD Signals (positions to keep):')
      holdSignals.forEach(signal => {
        console.log(`   - ${signal.symbol}: ${(signal.confidence * 100).toFixed(1)}% confidence`)
        console.log(`     Reasoning: ${signal.reasoning}`)
        console.log(`     Indicators: RSI=${signal.indicators?.rsi}, MACD=${signal.indicators?.macd}`)
      })
    }
    
    console.log('\n═══════════════════════════════════════════════════════════')
    
    // 4. Check bot status
    console.log('\n📊 Step 4: Checking bot status...')
    const { data: botStatus, error: botError } = await supabase
      .from('bot_status')
      .select('*')
      .limit(1)
      .single()
    
    if (botStatus) {
      console.log(`   Bot Running: ${botStatus.is_running ? 'YES ✅' : 'NO ❌'}`)
      console.log(`   Last Run: ${new Date(botStatus.last_run).toLocaleString()}`)
      
      const lastRunDate = new Date(botStatus.last_run)
      const now = new Date()
      const hoursSinceLastRun = (now.getTime() - lastRunDate.getTime()) / (1000 * 60 * 60)
      
      if (hoursSinceLastRun > 24) {
        console.log(`   ⚠️  WARNING: Bot hasn't run in ${hoursSinceLastRun.toFixed(1)} hours!`)
      }
      
      // Check if last run was during market hours (9:30 AM - 4:00 PM ET)
      const lastRunHour = lastRunDate.getHours()
      const isDuringMarketHours = lastRunHour >= 9 && lastRunHour < 16
      
      if (!isDuringMarketHours) {
        console.log(`   ⚠️  WARNING: Last run was at ${lastRunDate.toLocaleTimeString()} (outside market hours 9:30 AM - 4:00 PM ET)`)
        console.log(`   The bot needs to run during market hours to execute trades!`)
      }
    }
    
    console.log('\n═══════════════════════════════════════════════════════════')
    console.log('📋 SUMMARY & RECOMMENDATIONS')
    console.log('═══════════════════════════════════════════════════════════\n')
    
    if (sellSignals.length === 0) {
      console.log('❓ WHY NO SELL SIGNALS?')
      console.log('   The rule-based algorithm is working correctly, but it\'s not generating')
      console.log('   sell signals because your held positions don\'t meet the sell criteria:')
      console.log('')
      console.log('   Simple Rule-Based triggers SELL when:')
      console.log('   - RSI > 70 (overbought)')
      console.log('   - MACD < 0 AND EMA downtrend (bearish momentum)')
      console.log('   - RSI > 60 AND MACD < 0 (weakening momentum)')
      console.log('   - RSI > 55 AND EMA downtrend (downtrend forming)')
      console.log('')
      console.log('   Advanced Rule-Based triggers SELL when:')
      console.log('   - Score ≤ -1 (combination of bearish indicators)')
      console.log('   - Based on: RSI, MACD, Bollinger Bands, Stochastic, Volume, EMA, Sentiment')
      console.log('')
      console.log('   💡 SOLUTIONS:')
      console.log('   1. Lower the sell_confidence_threshold (currently ${(strategyData.sell_confidence_threshold * 100).toFixed(1)}%)')
      console.log('   2. Wait for market conditions to change (positions may become overbought)')
      console.log('   3. Switch to ML model which may be more aggressive with sells')
      console.log('   4. Manually close positions if you want to exit')
    } else {
      const aboveThreshold = sellSignals.filter(s => s.confidence >= strategyData.sell_confidence_threshold)
      if (aboveThreshold.length > 0) {
        console.log('✅ SELL SIGNALS ARE BEING GENERATED!')
        console.log(`   ${aboveThreshold.length} sell signal(s) above threshold`)
        console.log('')
        console.log('   If the bot is running during market hours, these should execute.')
        console.log('   Check:')
        console.log('   1. Is the bot actually running during market hours (9:30 AM - 4:00 PM ET)?')
        console.log('   2. Check the bot logs for execution details')
        console.log('   3. Verify Alpaca API keys are working')
      } else {
        console.log('⚠️  SELL SIGNALS BELOW THRESHOLD')
        console.log(`   ${sellSignals.length} sell signal(s) generated but all below ${(strategyData.sell_confidence_threshold * 100).toFixed(1)}% threshold`)
        console.log('')
        console.log('   💡 SOLUTION: Lower sell_confidence_threshold in account strategy settings')
      }
    }
    
  } catch (error: any) {
    console.error('❌ Error during simulation:', error.message)
    console.log('\n   ⚠️  Make sure the dev server is running: npm run dev')
  }
  
  console.log('\n═══════════════════════════════════════════════════════════')
}

diagnose().catch(console.error)

