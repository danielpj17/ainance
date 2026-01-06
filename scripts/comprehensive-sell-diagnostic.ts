/**
 * Comprehensive Sell Signal Diagnostic
 * Run this during market hours to see exactly what's happening with sell signals
 */

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function diagnose() {
  console.log('═══════════════════════════════════════════════════════════')
  console.log('Comprehensive Sell Signal Diagnostic')
  console.log('═══════════════════════════════════════════════════════════\n')
  
  // 1. Check which accounts have open positions in trade_logs
  console.log('📊 Step 1: Checking trade_logs for open positions\n')
  
  const { data: allTrades } = await supabase
    .from('trade_logs')
    .select('symbol, qty, account_id, account_name, buy_price, buy_timestamp')
    .eq('status', 'open')
    .eq('action', 'buy')
    .order('buy_timestamp', { ascending: false })
  
  if (!allTrades || allTrades.length === 0) {
    console.log('❌ NO OPEN POSITIONS FOUND IN DATABASE')
    console.log('\nThis explains why no sells are happening!')
    console.log('\nPossible reasons:')
    console.log('1. Positions were never bought (check buy confidence thresholds)')
    console.log('2. Positions exist in Alpaca but weren\'t recorded (manual trades?)')
    console.log('3. Bot isn\'t running during market hours to execute buys')
    console.log('\n💡 Check:')
    console.log('   - Is the bot running?')
    console.log('   - Are there positions in Alpaca web interface?')
    console.log('   - Check bot logs for buy attempts')
    return
  }
  
  // Group by account
  const byAccount: Record<string, any[]> = {}
  allTrades.forEach(trade => {
    const accName = trade.account_name || trade.account_id
    if (!byAccount[accName]) byAccount[accName] = []
    byAccount[accName].push(trade)
  })
  
  console.log(`✅ Found ${allTrades.length} open positions across ${Object.keys(byAccount).length} accounts:\n`)
  
  for (const [accountName, trades] of Object.entries(byAccount)) {
    console.log(`  ${accountName}: ${trades.length} positions`)
    trades.slice(0, 3).forEach(t => {
      console.log(`    - ${t.symbol}: ${t.qty} shares @ $${t.buy_price}`)
    })
    if (trades.length > 3) {
      console.log(`    ... and ${trades.length - 3} more`)
    }
  }
  
  // 2. Check account strategy settings for sell thresholds
  console.log('\n📊 Step 2: Checking sell confidence thresholds\n')
  
  const { data: strategies } = await supabase
    .from('account_strategy_settings')
    .select('*, paper_trading_accounts(account_name)')
    .in('algorithm_type', ['rule_based_simple', 'rule_based_advanced'])
  
  if (!strategies || strategies.length === 0) {
    console.log('⚠️  No rule-based accounts found')
  } else {
    console.log('Rule-Based Accounts:')
    strategies.forEach((s: any) => {
      const accName = s.paper_trading_accounts?.account_name || 'Unknown'
      const hasPositions = byAccount[accName] ? `✅ ${byAccount[accName].length} positions` : '❌ 0 positions'
      console.log(`  ${accName}:`)
      console.log(`    Algorithm: ${s.algorithm_type}`)
      console.log(`    BUY threshold: ${(s.confidence_threshold * 100).toFixed(0)}%`)
      console.log(`    SELL threshold: ${(s.sell_confidence_threshold * 100).toFixed(0)}%`)
      console.log(`    Positions: ${hasPositions}`)
    })
  }
  
  // 3. Check recent bot logs for sell signal generation
  console.log('\n📊 Step 3: Checking recent bot execution logs\n')
  
  const { data: botLogs } = await supabase
    .from('bot_logs')
    .select('created_at, message, data')
    .eq('action', 'execute')
    .order('created_at', { ascending: false })
    .limit(5)
  
  if (!botLogs || botLogs.length === 0) {
    console.log('⚠️  No recent bot execution logs found')
    console.log('   This suggests the bot may not be running!')
  } else {
    console.log(`Recent bot executions:`)
    botLogs.forEach(log => {
      const time = new Date(log.created_at).toLocaleString()
      const sellSignals = log.data?.final_sell_signals || log.data?.sell_signals_before_filter || 0
      const buySignals = log.data?.final_buy_signals || log.data?.buy_signals_before_filter || 0
      console.log(`  ${time}`)
      console.log(`    BUY signals: ${buySignals} | SELL signals: ${sellSignals}`)
      if (log.data?.diagnostics) {
        const d = log.data.diagnostics
        console.log(`    Thresholds: BUY ${(d.min_confidence_threshold * 100).toFixed(0)}% | SELL ${(d.min_sell_confidence_threshold * 100).toFixed(0)}%`)
      }
    })
  }
  
  // 4. Check bot status
  console.log('\n📊 Step 4: Checking bot status\n')
  
  const { data: botStatus } = await supabase
    .from('bot_status')
    .select('*')
    .limit(1)
    .single()
  
  if (botStatus) {
    const lastRun = new Date(botStatus.last_run)
    const now = new Date()
    const hoursSince = (now.getTime() - lastRun.getTime()) / (1000 * 60 * 60)
    
    console.log(`Bot Status:`)
    console.log(`  Running: ${botStatus.is_running ? 'YES ✅' : 'NO ❌'}`)
    console.log(`  Last run: ${lastRun.toLocaleString()} (${hoursSince.toFixed(1)} hours ago)`)
    
    if (!botStatus.is_running) {
      console.log(`\n  ⚠️  BOT IS NOT RUNNING!`)
      console.log(`     Start it from the dashboard to generate trading signals`)
    }
    
    if (hoursSince > 24) {
      console.log(`\n  ⚠️  Bot hasn't run in over 24 hours!`)
    }
  }
  
  console.log('\n═══════════════════════════════════════════════════════════')
  console.log('💡 SUMMARY & RECOMMENDATIONS')
  console.log('═══════════════════════════════════════════════════════════\n')
  
  if (allTrades.length === 0) {
    console.log('❌ PRIMARY ISSUE: No open positions in database')
    console.log('\nThe bot cannot sell what it doesn\'t own!')
    console.log('\n🔧 FIXES:')
    console.log('1. Lower buy confidence thresholds (currently 51%)')
    console.log('2. Ensure bot is running during market hours')
    console.log('3. Check if positions exist in Alpaca but not in database')
  } else {
    const ruleBasedAccounts = strategies?.map((s: any) => s.paper_trading_accounts?.account_name) || []
    const ruleBasedWithPositions = ruleBasedAccounts.filter(name => byAccount[name]?.length > 0)
    
    if (ruleBasedWithPositions.length === 0) {
      console.log('⚠️  Rule-based accounts have NO positions')
      console.log('\n🔧 FIX: Lower buy thresholds or wait for market conditions to improve')
    } else {
      console.log('✅ Rule-based accounts HAVE positions')
      console.log('\nSell signals should be generating!')
      console.log('\n🔍 Check:')
      console.log('1. Are sell signals being generated but filtered out?')
      console.log('   (check "Filtered SELL signals" in bot logs)')
      console.log('2. Is the bot running during market hours?')
      console.log('3. Are market conditions not triggering sell criteria?')
      console.log('   (RSI < 70, MACD positive, EMA uptrend = no sell)')
    }
  }
  
  console.log('\n📝 Next Steps:')
  console.log('1. Ensure bot is running (check dashboard)')
  console.log('2. Wait for market hours (9:30 AM - 4:00 PM ET)')
  console.log('3. Check terminal logs during bot execution')
  console.log('4. Look for "📉 SELL signals" and "📈 BUY signals" in logs')
}

diagnose().catch(console.error)

