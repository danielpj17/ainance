/**
 * ONE-TIME SCRIPT: Sync missing sell prices from Alpaca
 * 
 * This script should be run ONCE to backfill missing sell data.
 * After running, the data will be in the database and won't need constant syncing.
 * 
 * Usage:
 *   npx tsx scripts/sync-sell-prices-once.ts
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve } from 'path'
import fetch from 'node-fetch'

// Load environment variables from .env.local
config({ path: resolve(process.cwd(), '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
// Alpaca keys - try both naming conventions
const alpacaPaperApiKey = process.env.ALPACA_PAPER_KEY || process.env.NEXT_PUBLIC_ALPACA_PAPER_KEY!
const alpacaPaperSecretKey = process.env.ALPACA_PAPER_SECRET!
const alpacaLiveApiKey = process.env.ALPACA_LIVE_KEY!
const alpacaLiveSecretKey = process.env.ALPACA_LIVE_SECRET!

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials')
  console.error('Make sure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set')
  process.exit(1)
}

if (!alpacaPaperApiKey || !alpacaPaperSecretKey) {
  console.error('❌ Missing Alpaca Paper credentials')
  console.error('Make sure ALPACA_PAPER_KEY and ALPACA_PAPER_SECRET are set in .env.local')
  console.error('Found: ALPACA_PAPER_KEY =', alpacaPaperApiKey ? '✓' : '✗')
  console.error('Found: ALPACA_PAPER_SECRET =', alpacaPaperSecretKey ? '✓' : '✗')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

// Fetch orders from Alpaca
async function fetchAlpacaOrders(accountType: string) {
  const baseUrl = accountType === 'paper' 
    ? 'https://paper-api.alpaca.markets' 
    : 'https://api.alpaca.markets'
  
  const apiKey = accountType === 'paper' ? alpacaPaperApiKey : alpacaLiveApiKey
  const secretKey = accountType === 'paper' ? alpacaPaperSecretKey : alpacaLiveSecretKey
  
  console.log(`   🌐 Connecting to ${baseUrl}`)
  console.log(`   🔑 API Key: ${apiKey ? apiKey.substring(0, 8) + '...' : 'MISSING'}`)
  
  const response = await fetch(`${baseUrl}/v2/orders?status=all&limit=500`, {
    headers: {
      'APCA-API-KEY-ID': apiKey,
      'APCA-API-SECRET-KEY': secretKey
    }
  })
  
  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Alpaca API error: ${response.status} ${response.statusText} - ${errorText}`)
  }
  
  return await response.json()
}

async function syncSellPrices() {
  console.log('🔄 Starting one-time sync of sell prices from Alpaca...\n')
  
  try {
    // Find all trades marked as closed but missing sell data
    const { data: incompleteTrades, error: fetchError } = await supabase
      .from('trade_logs')
      .select('*')
      .eq('action', 'buy')
      .eq('status', 'closed')
      .or('sell_price.is.null,sell_price.eq.0')
      .order('buy_timestamp', { ascending: false })
    
    if (fetchError) {
      console.error('❌ Error fetching incomplete trades:', fetchError)
      return
    }
    
    if (!incompleteTrades || incompleteTrades.length === 0) {
      console.log('✅ No incomplete trades found. All trades have sell data!')
      return
    }
    
    console.log(`📊 Found ${incompleteTrades.length} trades missing sell data\n`)
    
    // Group by user and account
    const byUser = new Map<string, any[]>()
    for (const trade of incompleteTrades) {
      const accountType = trade.account_type || 'paper'
      const key = `${trade.user_id}|||${accountType}` // Use ||| as separator to avoid UUID conflicts
      if (!byUser.has(key)) {
        byUser.set(key, [])
      }
      byUser.get(key)!.push(trade)
    }
    
    console.log(`👥 Processing ${byUser.size} user/account combinations...\n`)
    
    let totalUpdated = 0
    let totalSkipped = 0
    
    for (const [userKey, trades] of byUser) {
      const [userId, accountType] = userKey.split('|||')
      console.log(`\n📝 Processing ${trades.length} trades for user ${userId.substring(0, 8)}... (${accountType})`)
      
      // Verify we have the right keys for this account type
      if (accountType === 'paper') {
        if (!alpacaPaperApiKey || !alpacaPaperSecretKey) {
          console.error(`   ❌ Missing Alpaca Paper keys`)
          totalSkipped += trades.length
          continue
        }
        console.log(`   🔑 Using Paper API keys`)
      } else {
        if (!alpacaLiveApiKey || !alpacaLiveSecretKey) {
          console.error(`   ❌ Missing Alpaca Live keys`)
          totalSkipped += trades.length
          continue
        }
        console.log(`   🔑 Using Live API keys`)
      }
      
      // Fetch ALL orders from Alpaca for this account type
      console.log(`   📡 Fetching order history from Alpaca...`)
      const alpacaOrders = await fetchAlpacaOrders(accountType)
      console.log(`   📦 Fetched ${alpacaOrders.length} orders from Alpaca`)
      
      // Build a map of sell orders by symbol
      const sellOrdersBySymbol = new Map<string, any[]>()
      for (const order of alpacaOrders) {
        if (order.side === 'sell' && order.status === 'filled') {
          const symbol = order.symbol.toUpperCase()
          if (!sellOrdersBySymbol.has(symbol)) {
            sellOrdersBySymbol.set(symbol, [])
          }
          sellOrdersBySymbol.get(symbol)!.push(order)
        }
      }
      
      console.log(`   📊 Found sell orders for ${sellOrdersBySymbol.size} symbols`)
      
      // For each trade, try to find matching sell in Alpaca orders
      for (const trade of trades) {
        try {
          const symbol = trade.symbol.toUpperCase()
          const sellOrders = sellOrdersBySymbol.get(symbol) || []
          
          if (sellOrders.length === 0) {
            console.log(`   ⏭️  ${symbol}: No sell orders found in Alpaca`)
            totalSkipped++
            continue
          }
          
          // Sort sell orders by filled_at time
          sellOrders.sort((a, b) => {
            const timeA = new Date(a.filled_at || a.created_at).getTime()
            const timeB = new Date(b.filled_at || b.created_at).getTime()
            return timeA - timeB
          })
          
          // Find sell order that happened AFTER this buy (FIFO matching)
          const buyTime = new Date(trade.buy_timestamp).getTime()
          const matchingSell = sellOrders.find(order => {
            const sellTime = new Date(order.filled_at || order.created_at).getTime()
            return sellTime > buyTime
          })
          
          if (!matchingSell) {
            console.log(`   ⏭️  ${symbol}: No matching sell order after ${new Date(trade.buy_timestamp).toLocaleDateString()}`)
            totalSkipped++
            continue
          }
          
          const filledPrice = matchingSell.filled_avg_price ? parseFloat(matchingSell.filled_avg_price) : null
          const filledAt = matchingSell.filled_at || matchingSell.created_at
          
          if (!filledPrice || filledPrice <= 0) {
            console.log(`   ⚠️  ${symbol}: Invalid filled_avg_price in Alpaca order`)
            totalSkipped++
            continue
          }
          
          // Found a match! Now calculate and update
          {
            const sellPrice = filledPrice
            const sellTimestamp = filledAt
            const buyPrice = parseFloat(trade.buy_price || '0')
            const qty = parseFloat(trade.qty || '0')
            
            // Calculate P&L
            const pl = (sellPrice - buyPrice) * qty
            const plPercent = buyPrice > 0 ? ((sellPrice - buyPrice) / buyPrice) * 100 : 0
            
            // Calculate holding duration
            const buyTime = new Date(trade.buy_timestamp).getTime()
            const sellTime = new Date(sellTimestamp).getTime()
            const duration = sellTime - buyTime
            const totalSeconds = Math.floor(duration / 1000)
            const days = Math.floor(totalSeconds / 86400)
            const hours = Math.floor((totalSeconds % 86400) / 3600)
            const minutes = Math.floor((totalSeconds % 3600) / 60)
            const seconds = totalSeconds % 60
            const holdingDuration = days > 0 
              ? `${days} day${days > 1 ? 's' : ''} ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
              : `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
            
            // Update the trade
            const { error: updateError } = await supabase
              .from('trade_logs')
              .update({
                sell_price: sellPrice,
                sell_timestamp: sellTimestamp,
                profit_loss: pl,
                profit_loss_percent: plPercent,
                holding_duration: holdingDuration,
                updated_at: new Date().toISOString()
              })
              .eq('id', trade.id)
            
            if (updateError) {
              console.error(`   ❌ Error updating ${trade.symbol}:`, updateError.message)
              totalSkipped++
            } else {
              console.log(`   ✅ ${symbol}: $${buyPrice.toFixed(2)} → $${sellPrice.toFixed(2)} = ${pl >= 0 ? '+' : ''}$${pl.toFixed(2)} (${plPercent.toFixed(2)}%)`)
              totalUpdated++
            }
          }
        } catch (tradeError: any) {
          console.error(`   ❌ Error processing ${trade.symbol}:`, tradeError.message)
          totalSkipped++
        }
      }
    }
    
    console.log('\n' + '='.repeat(60))
    console.log(`✅ Sync complete!`)
    console.log(`   Updated: ${totalUpdated} trades`)
    console.log(`   Skipped: ${totalSkipped} trades`)
    console.log('='.repeat(60))
    
  } catch (error: any) {
    console.error('\n❌ Fatal error:', error.message)
    process.exit(1)
  }
}

// Run the sync
syncSellPrices()
  .then(() => {
    console.log('\n✨ Done! Your completed trades should now show correct sell prices.')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Failed:', error)
    process.exit(1)
  })

