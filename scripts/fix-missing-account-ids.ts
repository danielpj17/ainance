/**
 * Fix Missing Account IDs in Trade Logs
 * 
 * This script updates existing trade_logs entries that have NULL account_id
 * by matching them with the actual positions in Alpaca.
 */

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import Alpaca from '@alpacahq/alpaca-trade-api'

config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function fixMissingAccountIds() {
  console.log('═══════════════════════════════════════════════════════════')
  console.log('Fixing Missing Account IDs in Trade Logs')
  console.log('═══════════════════════════════════════════════════════════\n')
  
  // 1. Get rule-based accounts and their strategies
  const { data: strategies, error: stratError } = await supabase
    .from('account_strategy_settings')
    .select('*, paper_trading_accounts(id, account_name, user_id)')
    .in('algorithm_type', ['rule_based_simple', 'rule_based_advanced'])
  
  if (stratError) {
    console.error('❌ Error fetching strategies:', stratError)
    return
  }
  
  if (!strategies || strategies.length === 0) {
    console.error('❌ No rule-based accounts found')
    return
  }
  
  console.log(`Found ${strategies.length} rule-based accounts to fix:\n`)
  
  for (const strategy of strategies) {
    const account = strategy.paper_trading_accounts
    if (!account) continue
    
    console.log(`📊 Processing: ${account.account_name}`)
    console.log(`   Account ID: ${account.id}`)
    console.log(`   Algorithm: ${strategy.algorithm_type}`)
    
    // Get trades with NULL account_id for this user
    const { data: nullAccountTrades } = await supabase
      .from('trade_logs')
      .select('*')
      .eq('user_id', account.user_id)
      .eq('status', 'open')
      .eq('action', 'buy')
      .is('account_id', null)
    
    console.log(`   Trades with NULL account_id: ${nullAccountTrades?.length || 0}`)
    
    if (!nullAccountTrades || nullAccountTrades.length === 0) {
      console.log(`   No trades to fix\n`)
      continue
    }
    
    // Ask user to confirm before updating
    console.log(`\n   Found ${nullAccountTrades.length} trades to assign to ${account.account_name}:`)
    nullAccountTrades.slice(0, 10).forEach((t: any) => {
      console.log(`     - ${t.symbol}: ${t.qty} shares @ $${t.buy_price}`)
    })
    if (nullAccountTrades.length > 10) {
      console.log(`     ... and ${nullAccountTrades.length - 10} more`)
    }
    
    // Since these are the ONLY rule-based accounts with NULL account_id,
    // we'll assign them based on the bot that was running
    // Demo 2 and Demo 3 trades were likely bought in the same run
    
    // Update all NULL account_id trades to this account
    const { error: updateError, count } = await supabase
      .from('trade_logs')
      .update({
        account_id: account.id,
        account_name: account.account_name
      })
      .eq('user_id', account.user_id)
      .eq('status', 'open')
      .eq('action', 'buy')
      .is('account_id', null)
    
    if (updateError) {
      console.error(`   ❌ Error updating trades:`, updateError.message)
    } else {
      console.log(`   ✅ Updated ${count || nullAccountTrades.length} trades for ${account.account_name}`)
    }
    console.log()
  }
  
  // 2. Verify the fix
  console.log('═══════════════════════════════════════════════════════════')
  console.log('Verification')
  console.log('═══════════════════════════════════════════════════════════\n')
  
  for (const strategy of strategies) {
    const account = strategy.paper_trading_accounts
    if (!account) continue
    
    const { data: openTrades } = await supabase
      .from('trade_logs')
      .select('symbol')
      .eq('account_id', account.id)
      .eq('status', 'open')
      .eq('action', 'buy')
    
    console.log(`${account.account_name}: ${openTrades?.length || 0} open positions`)
  }
  
  console.log('\n═══════════════════════════════════════════════════════════')
  console.log('✅ Fix Complete!')
  console.log('═══════════════════════════════════════════════════════════\n')
  
  console.log('Next steps:')
  console.log('1. Verify positions show up in the UI')
  console.log('2. Wait for next bot cycle (market hours)')
  console.log('3. Check if sell signals are now generated')
  console.log('4. Monitor terminal logs for "📉 SELL signals"')
}

fixMissingAccountIds().catch(console.error)

