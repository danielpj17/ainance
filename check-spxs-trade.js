/**
 * Script to check the most recent SPXS buy trade and confirm if it used ML model
 * Run with: node check-spxs-trade.js
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials in environment variables')
  console.error('Required: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function checkSPXSTrade() {
  try {
    console.log('🔍 Checking most recent SPXS buy trade...\n')
    
    // Query for most recent SPXS buy trade from trade_logs
    const { data: tradeLogs, error: tradeLogsError } = await supabase
      .from('trade_logs')
      .select('*')
      .eq('symbol', 'SPXS')
      .eq('action', 'buy')
      .order('buy_timestamp', { ascending: false })
      .limit(1)
    
    if (tradeLogsError) {
      console.error('❌ Error querying trade_logs:', tradeLogsError)
      return
    }
    
    if (!tradeLogs || tradeLogs.length === 0) {
      console.log('⚠️  No SPXS buy trades found in trade_logs table')
      
      // Try legacy trades table
      const { data: legacyTrades, error: legacyError } = await supabase
        .from('trades')
        .select('*')
        .eq('symbol', 'SPXS')
        .eq('action', 'buy')
        .order('trade_timestamp', { ascending: false })
        .limit(1)
      
      if (legacyError) {
        console.error('❌ Error querying trades table:', legacyError)
        return
      }
      
      if (!legacyTrades || legacyTrades.length === 0) {
        console.log('⚠️  No SPXS buy trades found in trades table either')
        return
      }
      
      const trade = legacyTrades[0]
      console.log('📊 Found SPXS trade in legacy trades table:')
      console.log(`   Symbol: ${trade.symbol}`)
      console.log(`   Action: ${trade.action}`)
      console.log(`   Quantity: ${trade.qty}`)
      console.log(`   Price: $${trade.price}`)
      console.log(`   Timestamp: ${trade.trade_timestamp}`)
      console.log(`   Strategy: ${trade.strategy}`)
      console.log(`   Account Type: ${trade.account_type}`)
      console.log('\n⚠️  Legacy trade - no decision metrics available')
      console.log('   Cannot determine if ML or rule-based (legacy trades table)')
      return
    }
    
    const trade = tradeLogs[0]
    const metrics = trade.buy_decision_metrics
    
    console.log('✅ Found most recent SPXS buy trade:')
    console.log(`   Symbol: ${trade.symbol}`)
    console.log(`   Action: ${trade.action}`)
    console.log(`   Quantity: ${trade.qty}`)
    console.log(`   Price: $${trade.buy_price}`)
    console.log(`   Buy Timestamp: ${trade.buy_timestamp}`)
    console.log(`   Status: ${trade.status}`)
    console.log(`   Strategy: ${trade.strategy}`)
    console.log(`   Account Type: ${trade.account_type}`)
    console.log(`   Trade Pair ID: ${trade.trade_pair_id}`)
    
    console.log('\n📊 Buy Decision Metrics:')
    if (metrics) {
      console.log(`   Confidence: ${(metrics.confidence * 100).toFixed(2)}%`)
      console.log(`   Adjusted Confidence: ${(metrics.adjusted_confidence * 100).toFixed(2)}%`)
      console.log(`   Reasoning: ${metrics.reasoning || 'N/A'}`)
      console.log(`   News Sentiment: ${(metrics.news_sentiment * 100).toFixed(2)}%`)
      console.log(`   Market Risk: ${(metrics.market_risk * 100).toFixed(2)}%`)
      
      if (metrics.news_headlines && metrics.news_headlines.length > 0) {
        console.log(`   News Headlines: ${metrics.news_headlines.length} headlines`)
      }
      
      // Determine if ML or rule-based
      console.log('\n🤖 Model Detection:')
      const reasoning = metrics.reasoning || ''
      
      // ML model indicators:
      // 1. Reasoning contains technical indicators like "RSI", "MACD", "Bollinger", "EMA"
      // 2. Reasoning contains "ML" or technical analysis terms
      // 3. Confidence values are typically from ML model predictions
      
      const mlIndicators = [
        'RSI', 'MACD', 'Bollinger', 'EMA', 'stochastic', 'volume',
        'Overbought', 'Oversold', 'Bullish momentum', 'Bearish momentum',
        'ML buy signal', 'ML sell signal'
      ]
      
      const hasMLIndicators = mlIndicators.some(indicator => 
        reasoning.toLowerCase().includes(indicator.toLowerCase())
      )
      
      if (hasMLIndicators || reasoning.includes('ML')) {
        console.log('   ✅ CONFIRMED: This trade was made using the ML MODEL')
        console.log(`   Evidence: Reasoning contains ML indicators - "${reasoning}"`)
      } else if (reasoning.includes('rule') || reasoning.includes('Rule-based')) {
        console.log('   ⚠️  This trade appears to be from RULE-BASED algorithm')
        console.log(`   Evidence: Reasoning suggests rule-based - "${reasoning}"`)
      } else {
        console.log('   ⚠️  Cannot definitively determine (check reasoning field)')
        console.log(`   Reasoning: "${reasoning}"`)
        console.log('   Note: Current system uses ML model, so this is likely ML-based')
      }
    } else {
      console.log('   ⚠️  No decision metrics available')
      console.log('   Cannot determine if ML or rule-based')
    }
    
  } catch (error) {
    console.error('❌ Error:', error)
  }
}

checkSPXSTrade()

