/**
 * Check Alpaca positions vs Database trade_logs
 * This helps identify sync issues between Alpaca and our database
 */

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import Alpaca from '@alpacahq/alpaca-trade-api'

config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function checkSync() {
  console.log('═══════════════════════════════════════════════════════════')
  console.log('Checking Alpaca vs Database Sync')
  console.log('═══════════════════════════════════════════════════════════\n')
  
  // Get Demo 2 and Demo 3 account details (demo user)
  const { data: accounts } = await supabase
    .from('paper_trading_accounts')
    .select('id, account_name, api_key, api_secret')
    .eq('user_id', '00000000-0000-0000-0000-000000000000')
    .in('account_name', ['Demo', 'Demo 2', 'Demo 3'])
  
  if (!accounts || accounts.length === 0) {
    console.error('❌ Could not find demo accounts')
    return
  }
  
  for (const account of accounts) {
    console.log(`\n📊 ${account.account_name} (${account.id})`)
    console.log('─'.repeat(60))
    
    // Check database
    const { data: dbTrades } = await supabase
      .from('trade_logs')
      .select('symbol, qty, status')
      .eq('account_id', account.id)
      .eq('action', 'buy')
    
    const dbOpen = dbTrades?.filter(t => t.status === 'open') || []
    console.log(`\n  Database (trade_logs): ${dbOpen.length} open positions`)
    if (dbOpen.length > 0) {
      dbOpen.slice(0, 5).forEach(t => console.log(`    - ${t.symbol}: ${t.qty} shares`))
      if (dbOpen.length > 5) console.log(`    ... and ${dbOpen.length - 5} more`)
    }
    
    // Check Alpaca
    if (account.api_key && account.api_secret) {
      try {
        const alpaca = new Alpaca({
          keyId: account.api_key,
          secretKey: account.api_secret,
          paper: true,
          usePolygon: false
        })
        
        const positions = await alpaca.getPositions()
        console.log(`\n  Alpaca API: ${positions.length} open positions`)
        if (positions.length > 0) {
          positions.slice(0, 5).forEach((p: any) => console.log(`    - ${p.symbol}: ${p.qty} shares @ $${p.current_price}`))
          if (positions.length > 5) console.log(`    ... and ${positions.length - 5} more`)
        }
        
        // Check for mismatches
        if (positions.length !== dbOpen.length) {
          console.log(`\n  ⚠️  MISMATCH DETECTED!`)
          console.log(`     Alpaca: ${positions.length} positions`)
          console.log(`     Database: ${dbOpen.length} positions`)
          console.log(`\n     This means positions exist in Alpaca but aren't recorded in trade_logs.`)
          console.log(`     The bot can't generate sell signals for positions it doesn't know about!`)
        } else if (positions.length > 0) {
          console.log(`\n  ✅ Sync looks good (${positions.length} positions in both)`)
        }
        
      } catch (error: any) {
        console.error(`\n  ❌ Failed to fetch from Alpaca: ${error.message}`)
      }
    } else {
      console.log('\n  ⚠️  No Alpaca API keys configured')
    }
  }
  
  console.log('\n═══════════════════════════════════════════════════════════')
  console.log('💡 DIAGNOSIS')
  console.log('═══════════════════════════════════════════════════════════\n')
  
  console.log('If there\'s a mismatch (Alpaca shows positions, database doesn\'t):')
  console.log('')
  console.log('PROBLEM: The positions were likely bought manually or through a')
  console.log('different bot instance, and weren\'t recorded in trade_logs.')
  console.log('')
  console.log('IMPACT: The bot cannot generate sell signals for positions')
  console.log('that don\'t exist in the trade_logs table.')
  console.log('')
  console.log('SOLUTION:')
  console.log('1. Manually close these positions in Alpaca')
  console.log('2. Let the bot buy fresh positions (it will record them properly)')
  console.log('3. Or sync the positions to trade_logs (requires manual SQL)')
  console.log('')
  console.log('PREVENTION: Always let the bot buy positions - don\'t buy manually!')
}

checkSync().catch(console.error)

