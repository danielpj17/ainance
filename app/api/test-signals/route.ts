export const runtime = 'nodejs'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/utils/supabase/server'
import { getMarketStatus, formatDataTimestamp, getLastMarketClose } from '@/lib/market-utils'
import { initializeNewsAnalyzer, getNewsAnalyzer } from '@/lib/news-sentiment'
import { initializeFRED, isFREDInitialized, getFREDService } from '@/lib/fred-data'

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createServerClient(req, {})
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { symbols = ['AAPL', 'MSFT', 'TSLA', 'SPY'] } = body

    console.log('🧪 Generating test signals with real ML pipeline...')

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

    // Get technical indicators
    const indicatorsResponse = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/stocks/indicators`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbols })
    })

    if (!indicatorsResponse.ok) {
      throw new Error('Failed to fetch technical indicators')
    }

    const indicatorsData = await indicatorsResponse.json()

    if (!indicatorsData.success || !indicatorsData.indicators || indicatorsData.indicators.length === 0) {
      throw new Error('No technical indicators available')
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

    // Call ML prediction service
    const mlResponse = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/ml/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        features: enhancedFeatures,
        include_probabilities: true
      })
    })

    if (!mlResponse.ok) {
      throw new Error('ML service unavailable')
    }

    const mlData = await mlResponse.json()

    if (!mlData.success || !mlData.signals) {
      throw new Error('ML service did not return valid signals')
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

    // Store test signals in bot logs
    await supabase
      .from('bot_logs')
      .insert({
        user_id: user.id,
        action: 'test_signals',
        message: `Generated ${testSignals.length} test signals using real ML pipeline`,
        data: {
          symbols,
          signals: testSignals,
          market_status: marketStatus.message,
          data_timestamp: formattedTimestamp
        }
      })

    console.log(`✅ Generated ${testSignals.length} test signals`)

    return NextResponse.json({
      success: true,
      signals: testSignals,
      message: marketStatus.message,
      data_timestamp: formattedTimestamp,
      market_open: marketStatus.open
    })

  } catch (error) {
    console.error('Error generating test signals:', error)
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to generate test signals' 
    }, { status: 500 })
  }
}
