/**
 * Fix Demo 3 Account Assignment
 * Match trades with actual Alpaca positions for each account
 */

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function fixDemo3() {
  console.log('═══════════════════════════════════════════════════════════')
  console.log('Fixing Demo 3 Account Assignment')
  console.log('═══════════════════════════════════════════════════════════\n')
  
  // Get Demo 2 and Demo 3 account IDs
  const demo2Id = 'cf2c2f8f-0253-4fe9-89b2-1a9e561b4a3d'
  const demo3Id = 'e165f70b-43ec-4994-90fc-53f082f49024'
  
  // Get current assignment
  const { data: demo2Trades } = await supabase
    .from('trade_logs')
    .select('symbol, qty, buy_price')
    .eq('account_id', demo2Id)
    .eq('status', 'open')
    .eq('action', 'buy')
  
  const { data: demo3Trades } = await supabase
    .from('trade_logs')
    .select('symbol, qty, buy_price')
    .eq('account_id', demo3Id)
    .eq('status', 'open')
    .eq('action', 'buy')
  
  console.log(`Current Database Assignment:`)
  console.log(`  Demo 2: ${demo2Trades?.length || 0} positions`)
  console.log(`  Demo 3: ${demo3Trades?.length || 0} positions\n`)
  
  // Get API keys for both accounts
  const { data: accounts } = await supabase.rpc('get_paper_account_keys', {
    account_uuid: demo3Id,
    user_uuid: '00000000-0000-0000-0000-000000000000'
  })
  
  if (!accounts || accounts.length === 0) {
    console.error('❌ Could not get Demo 3 API keys')
    console.log('\n💡 Checking what symbols the UI shows for Demo 3...')
    console.log('Based on your screenshot, Demo 3 has: NET, NVDA, PLTR')
    console.log('\nI\'ll reassign these from Demo 2 to Demo 3:')
    
    const symbolsToReassign = ['NET', 'NVDA', 'PLTR']
    
    for (const symbol of symbolsToReassign) {
      const { error, count } = await supabase
        .from('trade_logs')
        .update({
          account_id: demo3Id,
          account_name: 'Demo 3'
        })
        .eq('account_id', demo2Id)
        .eq('symbol', symbol)
        .eq('status', 'open')
        .eq('action', 'buy')
      
      if (error) {
        console.error(`  ❌ Error reassigning ${symbol}:`, error.message)
      } else {
        console.log(`  ✅ Reassigned ${symbol} to Demo 3 (${count} trade(s))`)
      }
    }
    
    // Verify
    console.log('\n═══════════════════════════════════════════════════════════')
    console.log('Verification')
    console.log('═══════════════════════════════════════════════════════════\n')
    
    const { data: newDemo2 } = await supabase
      .from('trade_logs')
      .select('symbol')
      .eq('account_id', demo2Id)
      .eq('status', 'open')
      .eq('action', 'buy')
    
    const { data: newDemo3 } = await supabase
      .from('trade_logs')
      .select('symbol')
      .eq('account_id', demo3Id)
      .eq('status', 'open')
      .eq('action', 'buy')
    
    console.log(`Demo 2: ${newDemo2?.length || 0} positions`)
    if (newDemo2 && newDemo2.length > 0) {
      const symbols = [...new Set(newDemo2.map(t => t.symbol))].slice(0, 10)
      console.log(`  Symbols: ${symbols.join(', ')}${newDemo2.length > 10 ? '...' : ''}`)
    }
    
    console.log(`\nDemo 3: ${newDemo3?.length || 0} positions`)
    if (newDemo3 && newDemo3.length > 0) {
      const symbols = [...new Set(newDemo3.map(t => t.symbol))]
      console.log(`  Symbols: ${symbols.join(', ')}`)
    }
    
    console.log('\n💡 NOTE: If Demo 3 has MORE positions than just NET, NVDA, PLTR,')
    console.log('please share which symbols you see, and I\'ll reassign those too!')
    
    return
  }
  
  console.log('✅ Got API keys for Demo 3')
}

fixDemo3().catch(console.error)

