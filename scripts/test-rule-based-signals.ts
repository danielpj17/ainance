import { config } from 'dotenv'
import { SimpleRuleBasedAlgorithm, AdvancedRuleBasedAlgorithm } from '../lib/trading-algorithms.js'

config({ path: '.env.local' })

async function testSignals() {
  console.log('═══════════════════════════════════════════════════════════')
  console.log('Testing Rule-Based Algorithm Signal Generation')
  console.log('═══════════════════════════════════════════════════════════\n')
  
  // Test with top stocks
  const testSymbols = ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'META', 'GOOGL', 'AMZN', 'SPY', 'QQQ']
  
  console.log(`Fetching indicators for: ${testSymbols.join(', ')}\n`)
  
  try {
    const response = await fetch('http://localhost:3000/api/stocks/indicators', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbols: testSymbols })
    })
    
    const indicatorsData = await response.json()
    
    if (!indicatorsData.success) {
      console.error('❌ Failed to fetch indicators:', indicatorsData.error)
      return
    }
    
    console.log(`✅ Indicators received for ${indicatorsData.indicators.length} symbols\n`)
    
    // Test Simple Rule-Based
    console.log('═══════════════════════════════════════════════════════════')
    console.log('Simple Rule-Based Algorithm (Demo 3)')
    console.log('BUY Threshold: 51% | SELL Threshold: 37%')
    console.log('═══════════════════════════════════════════════════════════\n')
    
    const simple = new SimpleRuleBasedAlgorithm()
    const simpleResult = await simple.predict(indicatorsData.indicators)
    
    if (simpleResult.success) {
      const buySignals = simpleResult.signals.filter(s => s.action === 'buy')
      const sellSignals = simpleResult.signals.filter(s => s.action === 'sell')
      const holdSignals = simpleResult.signals.filter(s => s.action === 'hold')
      
      console.log(`Total Signals: ${simpleResult.signals.length}`)
      console.log(`  BUY: ${buySignals.length} | SELL: ${sellSignals.length} | HOLD: ${holdSignals.length}\n`)
      
      const buyAboveThreshold = buySignals.filter(s => s.confidence >= 0.51)
      console.log(`BUY signals above 51% threshold: ${buyAboveThreshold.length}`)
      
      if (buyAboveThreshold.length > 0) {
        console.log('\n📈 BUY Signals (would execute):')
        buyAboveThreshold.forEach(s => {
          console.log(`  - ${s.symbol}: ${(s.confidence * 100).toFixed(1)}% | ${s.reasoning}`)
        })
      } else {
        console.log('\n⚠️  NO BUY SIGNALS ABOVE THRESHOLD')
        console.log('Highest confidence buy signals:')
        buySignals
          .sort((a, b) => b.confidence - a.confidence)
          .slice(0, 3)
          .forEach(s => {
            console.log(`  - ${s.symbol}: ${(s.confidence * 100).toFixed(1)}% (need 51%) | ${s.reasoning}`)
          })
      }
    }
    
    // Test Advanced Rule-Based
    console.log('\n═══════════════════════════════════════════════════════════')
    console.log('Advanced Rule-Based Algorithm (Demo 2)')
    console.log('BUY Threshold: 51% | SELL Threshold: 45%')
    console.log('═══════════════════════════════════════════════════════════\n')
    
    const advanced = new AdvancedRuleBasedAlgorithm()
    const advancedResult = await advanced.predict(indicatorsData.indicators)
    
    if (advancedResult.success) {
      const buySignals = advancedResult.signals.filter(s => s.action === 'buy')
      const sellSignals = advancedResult.signals.filter(s => s.action === 'sell')
      const holdSignals = advancedResult.signals.filter(s => s.action === 'hold')
      
      console.log(`Total Signals: ${advancedResult.signals.length}`)
      console.log(`  BUY: ${buySignals.length} | SELL: ${sellSignals.length} | HOLD: ${holdSignals.length}\n`)
      
      const buyAboveThreshold = buySignals.filter(s => s.confidence >= 0.51)
      console.log(`BUY signals above 51% threshold: ${buyAboveThreshold.length}`)
      
      if (buyAboveThreshold.length > 0) {
        console.log('\n📈 BUY Signals (would execute):')
        buyAboveThreshold.forEach(s => {
          console.log(`  - ${s.symbol}: ${(s.confidence * 100).toFixed(1)}% | ${s.reasoning}`)
        })
      } else {
        console.log('\n⚠️  NO BUY SIGNALS ABOVE THRESHOLD')
        console.log('Highest confidence buy signals:')
        buySignals
          .sort((a, b) => b.confidence - a.confidence)
          .slice(0, 3)
          .forEach(s => {
            console.log(`  - ${s.symbol}: ${(s.confidence * 100).toFixed(1)}% (need 51%) | ${s.reasoning}`)
          })
      }
    }
    
    console.log('\n═══════════════════════════════════════════════════════════')
    console.log('💡 RECOMMENDATIONS')
    console.log('═══════════════════════════════════════════════════════════\n')
    
    console.log('If rule-based algorithms are not generating enough buy signals:')
    console.log('')
    console.log('1. **Lower Confidence Thresholds**')
    console.log('   - Current: 51% for buys')
    console.log('   - Try: 45-48% for more aggressive buying')
    console.log('')
    console.log('2. **Check Market Conditions**')
    console.log('   - Rule-based algorithms are conservative by design')
    console.log('   - They need clear technical signals (RSI extremes, MACD crossovers)')
    console.log('   - Current market may be neutral/consolidating')
    console.log('')
    console.log('3. **Switch to ML Model**')
    console.log('   - ML model is more aggressive and adaptive')
    console.log('   - Your Default Paper Account (ML) has 69 positions')
    console.log('   - Rule-based accounts have 0 positions')
    console.log('')
    console.log('4. **Relax Sell Criteria**')
    console.log('   - Simple algorithm sell threshold: 37% (already very low)')
    console.log('   - Advanced algorithm sell threshold: 45%')
    console.log('   - These are reasonable - selling requires clear exit signals')
    
  } catch (error: any) {
    console.error('❌ Error:', error.message)
    console.log('\n⚠️  Make sure the dev server is running: npm run dev')
  }
}

testSignals().catch(console.error)

