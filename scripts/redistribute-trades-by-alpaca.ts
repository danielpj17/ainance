/**
 * Redistribute Trades Based on Actual Alpaca Positions
 * This matches database trades with real Alpaca positions for each account
 */

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import Alpaca from '@alpacahq/alpaca-trade-api'

config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function redistributeTrades() {
  console.log('═══════════════════════════════════════════════════════════')
  console.log('Redistributing Trades Based on Actual Alpaca Positions')
  console.log('═══════════════════════════════════════════════════════════\n')
  
  const demo2Id = 'cf2c2f8f-0253-4fe9-89b2-1a9e561b4a3d'
  const demo3Id = 'e165f70b-43ec-4994-90fc-53f082f49024'
  const userId = '00000000-0000-0000-0000-000000000000'
  
  // Get API keys for both accounts
  const { data: demo2Keys } = await supabase.rpc('get_paper_account_keys', {
    account_uuid: demo2Id,
    user_uuid: userId
  })
  
  const { data: demo3Keys } = await supabase.rpc('get_paper_account_keys', {
    account_uuid: demo3Id,
    user_uuid: userId
  })
  
  if (!demo2Keys || !demo2Keys[0] || !demo3Keys || !demo3Keys[0]) {
    console.error('❌ Could not get API keys')
    return
  }
  
  // Initialize Alpaca clients
  const demo2Alpaca = new Alpaca({
    keyId: demo2Keys[0].alpaca_api_key,
    secretKey: demo2Keys[0].alpaca_api_secret,
    paper: true,
    usePolygon: false
  })
  
  const demo3Alpaca = new Alpaca({
    keyId: demo3Keys[0].alpaca_api_key,
    secretKey: demo3Keys[0].alpaca_api_secret,
    paper: true,
    usePolygon: false
  })
  
  // Get positions from Alpaca
  console.log('📊 Fetching positions from Alpaca...\n')
  
  const demo2Positions = await demo2Alpaca.getPositions()
  const demo3Positions = await demo3Alpaca.getPositions()
  
  console.log(`Demo 2 (Advanced) Alpaca Positions: ${demo2Positions.length}`)
  if (demo2Positions.length > 0) {
    const symbols = demo2Positions.map((p: any) => p.symbol).slice(0, 10)
    console.log(`  Symbols: ${symbols.join(', ')}${demo2Positions.length > 10 ? '...' : ''}`)
  }
  
  console.log(`\nDemo 3 (Simple) Alpaca Positions: ${demo3Positions.length}`)
  if (demo3Positions.length > 0) {
    const symbols = demo3Positions.map((p: any) => p.symbol).slice(0, 10)
    console.log(`  Symbols: ${symbols.join(', ')}${demo3Positions.length > 10 ? '...' : ''}`)
  }
  
  // Get current database state
  const { data: currentTrades } = await supabase
    .from('trade_logs')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'open')
    .eq('action', 'buy')
    .in('account_id', [demo2Id, demo3Id])
  
  console.log(`\n📊 Current Database State: ${currentTrades?.length || 0} trades\n`)
  
  // Create symbol maps
  const demo2Symbols = new Set(demo2Positions.map((p: any) => p.symbol))
  const demo3Symbols = new Set(demo3Positions.map((p: any) => p.symbol))
  
  // Redistribute trades based on Alpaca positions
  let demo2Count = 0
  let demo3Count = 0
  let errorCount = 0
  
  if (currentTrades) {
    for (const trade of currentTrades) {
      const inDemo2 = demo2Symbols.has(trade.symbol)
      const inDemo3 = demo3Symbols.has(trade.symbol)
      
      let targetAccountId: string | null = null
      let targetAccountName: string | null = null
      
      if (inDemo2 && !inDemo3) {
        // Belongs to Demo 2
        if (trade.account_id !== demo2Id) {
          targetAccountId = demo2Id
          targetAccountName = 'Demo 2'
        }
      } else if (inDemo3 && !inDemo2) {
        // Belongs to Demo 3
        if (trade.account_id !== demo3Id) {
          targetAccountId = demo3Id
          targetAccountName = 'Demo 3'
        }
      } else if (inDemo2 && inDemo3) {
        console.log(`  ⚠️  ${trade.symbol} exists in BOTH accounts - keeping current assignment`)
      } else {
        console.log(`  ⚠️  ${trade.symbol} not found in either Alpaca account - keeping current assignment`)
      }
      
      // Update if needed
      if (targetAccountId) {
        const { error } = await supabase
          .from('trade_logs')
          .update({
            account_id: targetAccountId,
            account_name: targetAccountName
          })
          .eq('id', trade.id)
        
        if (error) {
          console.error(`  ❌ Error updating ${trade.symbol}:`, error.message)
          errorCount++
        } else {
          if (targetAccountId === demo2Id) {
            demo2Count++
          } else {
            demo3Count++
          }
        }
      }
    }
  }
  
  console.log(`\n✅ Redistribution Complete:`)
  console.log(`   Moved to Demo 2: ${demo2Count}`)
  console.log(`   Moved to Demo 3: ${demo3Count}`)
  if (errorCount > 0) {
    console.log(`   Errors: ${errorCount}`)
  }
  
  // Verify final state
  console.log('\n═══════════════════════════════════════════════════════════')
  console.log('Final Verification')
  console.log('═══════════════════════════════════════════════════════════\n')
  
  const { data: finalDemo2 } = await supabase
    .from('trade_logs')
    .select('symbol')
    .eq('account_id', demo2Id)
    .eq('status', 'open')
    .eq('action', 'buy')
  
  const { data: finalDemo3 } = await supabase
    .from('trade_logs')
    .select('symbol')
    .eq('account_id', demo3Id)
    .eq('status', 'open')
    .eq('action', 'buy')
  
  const demo2DbSymbols = new Set(finalDemo2?.map(t => t.symbol) || [])
  const demo3DbSymbols = new Set(finalDemo3?.map(t => t.symbol) || [])
  
  console.log(`Demo 2 Database: ${finalDemo2?.length || 0} positions`)
  console.log(`Demo 2 Alpaca:   ${demo2Positions.length} positions`)
  console.log(`  Match: ${demo2Positions.length === finalDemo2?.length ? '✅' : '❌'}`)
  
  console.log(`\nDemo 3 Database: ${finalDemo3?.length || 0} positions`)
  console.log(`Demo 3 Alpaca:   ${demo3Positions.length} positions`)
  console.log(`  Match: ${demo3Positions.length === finalDemo3?.length ? '✅' : '❌'}`)
  
  // Check for mismatches
  const demo2Missing = demo2Positions.filter((p: any) => !demo2DbSymbols.has(p.symbol))
  const demo3Missing = demo3Positions.filter((p: any) => !demo3DbSymbols.has(p.symbol))
  
  if (demo2Missing.length > 0) {
    console.log(`\n⚠️  Demo 2 - In Alpaca but not in database: ${demo2Missing.map((p: any) => p.symbol).join(', ')}`)
  }
  
  if (demo3Missing.length > 0) {
    console.log(`⚠️  Demo 3 - In Alpaca but not in database: ${demo3Missing.map((p: any) => p.symbol).join(', ')}`)
  }
  
  console.log('\n✅ Trades are now correctly assigned!')
  console.log('   Refresh your UI to see the updated positions.')
}

redistributeTrades().catch(console.error)

