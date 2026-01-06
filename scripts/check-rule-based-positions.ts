import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function checkPositions() {
  const demo2 = await supabase
    .from('trade_logs')
    .select('*')
    .eq('account_id', 'cf2c2f8f-0253-4fe9-89b2-1a9e561b4a3d')
    .eq('status', 'open')
    .eq('action', 'buy')
  
  const demo3 = await supabase
    .from('trade_logs')
    .select('*')
    .eq('account_id', 'e165f70b-43ec-4994-90fc-53f082f49024')
    .eq('status', 'open')
    .eq('action', 'buy')
  
  console.log('═══════════════════════════════════════════════════════════')
  console.log('Rule-Based Algorithm Accounts - Open Positions')
  console.log('═══════════════════════════════════════════════════════════\n')
  
  console.log('Demo 2 (rule_based_advanced):')
  console.log(`  Open positions: ${demo2.data?.length || 0}`)
  if (demo2.data && demo2.data.length > 0) {
    console.log('  Holdings:')
    demo2.data.forEach((t: any) => {
      console.log(`    - ${t.symbol}: ${t.qty} shares @ $${t.buy_price} (bought ${new Date(t.buy_timestamp).toLocaleString()})`)
    })
  }
  
  console.log('\nDemo 3 (rule_based_simple):')
  console.log(`  Open positions: ${demo3.data?.length || 0}`)
  if (demo3.data && demo3.data.length > 0) {
    console.log('  Holdings:')
    demo3.data.forEach((t: any) => {
      console.log(`    - ${t.symbol}: ${t.qty} shares @ $${t.buy_price} (bought ${new Date(t.buy_timestamp).toLocaleString()})`)
    })
  }
  
  console.log('\n═══════════════════════════════════════════════════════════\n')
  
  if ((demo2.data?.length || 0) === 0 && (demo3.data?.length || 0) === 0) {
    console.log('❌ PROBLEM FOUND: No open positions in rule-based accounts!')
    console.log('\nThe rule-based algorithms CANNOT generate sell signals')
    console.log('without open positions to sell.')
    console.log('\n💡 SOLUTIONS:')
    console.log('1. Make sure the rule-based bots are actually running and buying')
    console.log('2. Check if the bots have sufficient capital to buy')
    console.log('3. Check buy confidence thresholds - they may be too high')
    console.log('4. Review bot logs to see if buys are being attempted')
  }
}

checkPositions().catch(console.error)

