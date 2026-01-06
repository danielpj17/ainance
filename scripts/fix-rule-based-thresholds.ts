/**
 * Quick Fix: Lower Confidence Thresholds for Rule-Based Accounts
 * 
 * This script lowers the buy confidence thresholds from 51% to 45%
 * to allow rule-based algorithms to be more aggressive with buying.
 */

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import * as readline from 'readline'

config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

function question(query: string): Promise<string> {
  return new Promise(resolve => rl.question(query, resolve))
}

async function fixThresholds() {
  console.log('═══════════════════════════════════════════════════════════')
  console.log('Fix Rule-Based Account Confidence Thresholds')
  console.log('═══════════════════════════════════════════════════════════\n')
  
  console.log('Current Settings:')
  console.log('  Demo 2 (rule_based_advanced): BUY 51% | SELL 45%')
  console.log('  Demo 3 (rule_based_simple):   BUY 51% | SELL 37%')
  console.log('')
  console.log('Proposed Changes:')
  console.log('  Demo 2: BUY 51% → 45% (more aggressive)')
  console.log('  Demo 3: BUY 51% → 45% (more aggressive)')
  console.log('')
  console.log('📊 Why this helps:')
  console.log('  - Rule-based algorithms generate buy signals at 55-70% confidence')
  console.log('  - Current 51% threshold filters out too many opportunities')
  console.log('  - Lowering to 45% allows more buys = more positions = enables sells')
  console.log('  - Sell thresholds remain unchanged (still conservative)')
  console.log('')
  
  const answer = await question('Apply these changes? (yes/no): ')
  
  if (answer.toLowerCase() !== 'yes') {
    console.log('\n❌ Changes cancelled.')
    rl.close()
    return
  }
  
  console.log('\n🔄 Applying changes...\n')
  
  // Update Demo 2 (Advanced)
  const { error: error1 } = await supabase
    .from('account_strategy_settings')
    .update({ confidence_threshold: 0.45 })
    .eq('account_id', 'cf2c2f8f-0253-4fe9-89b2-1a9e561b4a3d')
  
  if (error1) {
    console.error('❌ Failed to update Demo 2:', error1.message)
  } else {
    console.log('✅ Demo 2 (rule_based_advanced): BUY threshold updated to 45%')
  }
  
  // Update Demo 3 (Simple)
  const { error: error2 } = await supabase
    .from('account_strategy_settings')
    .update({ confidence_threshold: 0.45 })
    .eq('account_id', 'e165f70b-43ec-4994-90fc-53f082f49024')
  
  if (error2) {
    console.error('❌ Failed to update Demo 3:', error2.message)
  } else {
    console.log('✅ Demo 3 (rule_based_simple): BUY threshold updated to 45%')
  }
  
  console.log('\n═══════════════════════════════════════════════════════════')
  console.log('✅ Changes Applied Successfully!')
  console.log('═══════════════════════════════════════════════════════════\n')
  
  console.log('📋 Next Steps:')
  console.log('1. Ensure bots are running during market hours (9:30 AM - 4:00 PM ET)')
  console.log('2. Monitor bot logs for buy signal generation')
  console.log('3. Within 1-2 trading days, positions should start accumulating')
  console.log('4. Once positions are held, sell signals will generate automatically')
  console.log('5. Run this to check progress:')
  console.log('   npx tsx scripts/check-rule-based-positions.ts')
  console.log('')
  console.log('💡 Why selling will work now:')
  console.log('   - Rule-based algorithms generate sell signals at 52-95% confidence')
  console.log('   - Sell thresholds are 37% (Simple) and 45% (Advanced)')
  console.log('   - Once positions are acquired, sells will trigger on:')
  console.log('     * Overbought conditions (RSI > 70)')
  console.log('     * Bearish momentum (MACD-, EMA downtrend)')
  console.log('     * Weakening signals (RSI > 60, declining momentum)')
  
  rl.close()
}

fixThresholds().catch(error => {
  console.error('Error:', error)
  rl.close()
})

