export const runtime = 'nodejs'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/utils/supabase/server'
import { getMarketStatus, formatDataTimestamp, getLastMarketClose } from '@/lib/market-utils'
import { initializeNewsAnalyzer, getNewsAnalyzer } from '@/lib/news-sentiment'
import { initializeFRED, isFREDInitialized, getFREDService } from '@/lib/fred-data'

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createServerClient(req, {})
    
    // Get current user (optional for test signals - allow unauthenticated testing)
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    const userId = user?.id || '00000000-0000-0000-0000-000000000000' // Use placeholder if not authenticated
    
    if (userError) {
      console.warn('⚠️  Auth warning in test signals:', userError)
    }

    const body = await req.json()
    const { symbols = ['AAPL', 'MSFT', 'TSLA', 'SPY'] } = body

    console.log('🧪 Generating test signals with real ML pipeline...')
    console.log(`📋 Symbols: ${symbols.join(', ')}`)

    // Check market status
    const marketStatus = getMarketStatus()
    console.log(`📊 Market Status: ${marketStatus.message}`)

    // Get data timestamp (current if market open, last close if closed)
    const dataTimestamp = marketStatus.open 
      ? new Date() 
      : getLastMarketClose()
    const formattedTimestamp = formatDataTimestamp(dataTimestamp)

    // Initialize services
    const newsApiKey = process.env.NEWS_API_KEY
    if (newsApiKey) {
      try {
        initializeNewsAnalyzer(newsApiKey)
      } catch (error) {
        console.warn('⚠️  News analyzer init failed:', error)
      }
    }

    const fredApiKey = process.env.FRED_API_KEY
    if (fredApiKey && !isFREDInitialized()) {
      try {
        initializeFRED(fredApiKey)
      } catch (error) {
        console.warn('⚠️  FRED init failed:', error)
      }
    }

    // Get FRED economic indicators
    let marketRisk = 0.3
    let fredIndicators: any = null
    try {
      if (isFREDInitialized()) {
        const fredService = getFREDService()
        fredIndicators = await fredService.getIndicators()
        marketRisk = fredService.calculateMarketRisk(fredIndicators)
      }
    } catch (error) {
      console.warn('⚠️  FRED data unavailable:', error)
    }

    // Get technical indicators by calling the API route handler directly
    console.log('📈 Fetching technical indicators...')
    let indicatorsData: any
    
    try {
      // Import and call the indicators API handler
      const { POST: getIndicators } = await import('@/app/api/stocks/indicators/route')
      const indicatorsReq = new NextRequest('http://localhost/api/stocks/indicators', {
        method: 'POST',
        body: JSON.stringify({ symbols })
      })
      const indicatorsRes = await getIndicators(indicatorsReq)
      indicatorsData = await indicatorsRes.json()
      
      if (!indicatorsData.success || !indicatorsData.indicators || indicatorsData.indicators.length === 0) {
        throw new Error('No technical indicators available')
      }
      
      console.log(`✅ Got indicators for ${indicatorsData.indicators.length} symbols`)
    } catch (error) {
      console.error('❌ Failed to get technical indicators:', error)
      throw new Error('Failed to fetch technical indicators')
    }

    // Get news sentiment
    let sentimentData: { [symbol: string]: any } = {}
    try {
      const newsAnalyzer = getNewsAnalyzer()
      sentimentData = await newsAnalyzer.getSentimentForSymbols(symbols, 1)
    } catch (error) {
      console.warn('⚠️  News sentiment unavailable:', error)
    }

    // Enhance features with news + FRED
    const enhancedFeatures = indicatorsData.indicators.map((indicator: any) => ({
      ...indicator,
      news_sentiment: sentimentData[indicator.symbol]?.score || 0,
      news_confidence: sentimentData[indicator.symbol]?.confidence || 0,
      market_risk: marketRisk,
      vix: fredIndicators?.vix || 18,
      yield_curve: fredIndicators?.yield_curve || 0,
      fed_funds_rate: fredIndicators?.fed_funds_rate || 5.0
    }))

    // Call ML service directly (skip the /api/ml/predict wrapper to avoid auth issues)
    console.log('🧠 Calling ML prediction service directly...')
    const ML_SERVICE_URL = (process.env.ML_SERVICE_URL || 'http://localhost:8080').replace(/\/$/, '');
    
    let mlData: any
    
    try {
      // Strip enhanced features before sending to ML model
      const coreFeatures = enhancedFeatures.map((f: any) => ({
        symbol: f.symbol,
        rsi: f.rsi,
        macd: f.macd,
        macd_histogram: f.macd_histogram,
        bb_width: f.bb_width,
        bb_position: f.bb_position,
        ema_trend: f.ema_trend,
        volume_ratio: f.volume_ratio,
        stochastic: f.stochastic,
        price_change_1d: f.price_change_1d,
        price_change_5d: f.price_change_5d,
        price_change_10d: f.price_change_10d,
        volatility_20: f.volatility_20,
        news_sentiment: f.news_sentiment,
        price: f.price
      }));
      
      const mlResponse = await fetch(`${ML_SERVICE_URL}/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          features: coreFeatures,
          include_probabilities: true
        }),
        signal: AbortSignal.timeout(30000) // Increased to 30 seconds for cold starts
      });
      
      if (!mlResponse.ok) {
        throw new Error(`ML service returned ${mlResponse.status}`)
      }
      
      mlData = await mlResponse.json()
      
      if (!mlData.success || !mlData.signals) {
        throw new Error('ML service did not return valid signals')
      }
      
      console.log(`✅ Got ML predictions for ${mlData.signals.length} symbols`)
    } catch (error: any) {
      console.error('❌ Failed to get ML predictions:', error)
      throw new Error(`ML service unavailable: ${error.message}`)
    }

    // Enhance signals with news sentiment and FRED data
    const testSignals = mlData.signals.map((s: any) => {
      const sentiment = sentimentData[s.symbol]
      return {
        symbol: s.symbol,
        action: s.action,
        confidence: s.confidence,
        price: s.price || 0,
        timestamp: s.timestamp || new Date().toISOString(),
        reasoning: s.reasoning,
        news_sentiment: sentiment?.score || 0,
        market_risk: marketRisk,
        vix: fredIndicators?.vix || 18,
        data_timestamp: formattedTimestamp,
        market_open: marketStatus.open
      }
    })

    // Store test signals in bot logs (only if user is authenticated)
    if (user) {
      try {
        await supabase
          .from('bot_logs')
          .insert({
            user_id: userId,
            action: 'test_signals',
            message: `Generated ${testSignals.length} test signals using real ML pipeline`,
            data: {
              symbols,
              signals: testSignals,
              market_status: marketStatus.message,
              data_timestamp: formattedTimestamp
            }
          })
      } catch (logError) {
        console.warn('⚠️  Could not log to database:', logError)
      }
    }

    console.log(`✅ Generated ${testSignals.length} test signals`)

    return NextResponse.json({
      success: true,
      signals: testSignals,
      message: marketStatus.message,
      data_timestamp: formattedTimestamp,
      market_open: marketStatus.open
    })

  } catch (error: any) {
    console.error('❌ Error generating test signals:', error)
    
    // Provide detailed error message
    let errorMessage = 'Failed to generate test signals'
    
    if (error.message) {
      errorMessage = error.message
    }
    
    // Log full error for debugging
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    })
    
    return NextResponse.json({ 
      success: false, 
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, { status: 500 })
  }
}
