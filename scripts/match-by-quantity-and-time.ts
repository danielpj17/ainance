/**
 * Match trades to accounts by quantity and timestamp
 * When both accounts own the same symbol, we need more precise matching
 */

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import Alpaca from '@alpacahq/alpaca-trade-api'

config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function matchByQuantity() {
  console.log('═══════════════════════════════════════════════════════════')
  console.log('Matching Trades by Quantity and Timestamp')
  console.log('═══════════════════════════════════════════════════════════\n')
  
  const demo2Id = 'cf2c2f8f-0253-4fe9-89b2-1a9e561b4a3d'
  const demo3Id = 'e165f70b-43ec-4994-90fc-53f082f49024'
  const userId = '00000000-0000-0000-0000-000000000000'
  
  // Get API keys
  const { data: demo2Keys } = await supabase.rpc('get_paper_account_keys', {
    account_uuid: demo2Id,
    user_uuid: userId
  })
  
  const { data: demo3Keys } = await supabase.rpc('get_paper_account_keys', {
    account_uuid: demo3Id,
    user_uuid: userId
  })
  
  if (!demo2Keys?.[0] || !demo3Keys?.[0]) {
    console.error('❌ Could not get API keys')
    return
  }
  
  // Initialize Alpaca clients
  const demo2Alpaca = new Alpaca({
    keyId: demo2Keys[0].alpaca_api_key,
    secretKey: demo2Keys[0].alpaca_api_secret,
    paper: true
  })
  
  const demo3Alpaca = new Alpaca({
    keyId: demo3Keys[0].alpaca_api_key,
    secretKey: demo3Keys[0].alpaca_api_secret,
    paper: true
  })
  
  // Get positions
  const demo2Positions = await demo2Alpaca.getPositions()
  const demo3Positions = await demo3Alpaca.getPositions()
  
  console.log(`Demo 2 Alpaca: ${demo2Positions.length} positions`)
  console.log(`Demo 3 Alpaca: ${demo3Positions.length} positions\n`)
  
  // Create position maps by symbol and quantity
  const demo2Map = new Map<string, any[]>()
  const demo3Map = new Map<string, any[]>()
  
  for (const pos of demo2Positions) {
    if (!demo2Map.has(pos.symbol)) {
      demo2Map.set(pos.symbol, [])
    }
    demo2Map.get(pos.symbol)!.push({
      qty: Math.abs(parseInt(pos.qty)),
      value: Math.abs(parseFloat(pos.market_value)),
      price: parseFloat(pos.current_price)
    })
  }
  
  for (const pos of demo3Positions) {
    if (!demo3Map.has(pos.symbol)) {
      demo3Map.set(pos.symbol, [])
    }
    demo3Map.get(pos.symbol)!.push({
      qty: Math.abs(parseInt(pos.qty)),
      value: Math.abs(parseFloat(pos.market_value)),
      price: parseFloat(pos.current_price)
    })
  }
  
  // Get all database trades
  const { data: allTrades } = await supabase
    .from('trade_logs')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'open')
    .eq('action', 'buy')
    .order('buy_timestamp', { ascending: true })
  
  if (!allTrades) {
    console.error('❌ No trades found')
    return
  }
  
  console.log(`Database: ${allTrades.length} open trades\n`)
  console.log('Matching trades to accounts...\n')
  
  let demo2Matched = 0
  let demo3Matched = 0
  let alreadyCorrect = 0
  
  // Group trades by symbol
  const tradesBySymbol = new Map<string, any[]>()
  for (const trade of allTrades) {
    if (!tradesBySymbol.has(trade.symbol)) {
      tradesBySymbol.set(trade.symbol, [])
    }
    tradesBySymbol.get(trade.symbol)!.push(trade)
  }
  
  // For each symbol, distribute trades between accounts
  for (const [symbol, trades] of tradesBySymbol) {
    const demo2Positions = demo2Map.get(symbol) || []
    const demo3Positions = demo3Map.get(symbol) || []
    
    const totalDemo2Qty = demo2Positions.reduce((sum, p) => sum + p.qty, 0)
    const totalDemo3Qty = demo3Positions.reduce((sum, p) => sum + p.qty, 0)
    const totalQty = totalDemo2Qty + totalDemo3Qty
    
    if (totalQty === 0) {
      console.log(`  ${symbol}: Not in either Alpaca account (may have been sold)`)
      continue
    }
    
    // Calculate how many trades should go to each account
    const demo2Trades: any[] = []
    const demo3Trades: any[] = []
    
    let demo2QtyNeeded = totalDemo2Qty
    let demo3QtyNeeded = totalDemo3Qty
    
    // Sort trades by timestamp
    trades.sort((a, b) => new Date(a.buy_timestamp).getTime() - new Date(b.buy_timestamp).getTime())
    
    for (const trade of trades) {
      const tradeQty = Math.abs(parseInt(trade.qty))
      
      // Assign to account that needs more quantity
      if (demo2QtyNeeded > 0 && demo3QtyNeeded > 0) {
        // Both need more - assign proportionally
        const demo2Ratio = demo2QtyNeeded / (demo2QtyNeeded + demo3QtyNeeded)
        if (Math.random() < demo2Ratio) {
          demo2Trades.push(trade)
          demo2QtyNeeded -= tradeQty
        } else {
          demo3Trades.push(trade)
          demo3QtyNeeded -= tradeQty
        }
      } else if (demo2QtyNeeded > 0) {
        demo2Trades.push(trade)
        demo2QtyNeeded -= tradeQty
      } else if (demo3QtyNeeded > 0) {
        demo3Trades.push(trade)
        demo3QtyNeeded -= tradeQty
      }
    }
    
    console.log(`  ${symbol}: ${trades.length} trades → Demo 2: ${demo2Trades.length}, Demo 3: ${demo3Trades.length}`)
    
    // Update database
    for (const trade of demo2Trades) {
      if (trade.account_id !== demo2Id) {
        await supabase
          .from('trade_logs')
          .update({ account_id: demo2Id, account_name: 'Demo 2' })
          .eq('id', trade.id)
        demo2Matched++
      } else {
        alreadyCorrect++
      }
    }
    
    for (const trade of demo3Trades) {
      if (trade.account_id !== demo3Id) {
        await supabase
          .from('trade_logs')
          .update({ account_id: demo3Id, account_name: 'Demo 3' })
          .eq('id', trade.id)
        demo3Matched++
      } else {
        alreadyCorrect++
      }
    }
  }
  
  console.log(`\n✅ Matching Complete:`)
  console.log(`   Assigned to Demo 2: ${demo2Matched}`)
  console.log(`   Assigned to Demo 3: ${demo3Matched}`)
  console.log(`   Already correct: ${alreadyCorrect}`)
  
  // Verify
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
  
  console.log(`Demo 2: Database ${finalDemo2?.length} positions | Alpaca ${demo2Positions.length} positions`)
  console.log(`Demo 3: Database ${finalDemo3?.length} positions | Alpaca ${demo3Positions.length} positions`)
  
  console.log('\n✅ Done! Refresh your UI to see the corrected positions.')
}

matchByQuantity().catch(console.error)

