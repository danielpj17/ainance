export const runtime = 'nodejs'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/utils/supabase/server'
import { tradingModel, TradingSignal, TradingSettings } from '@/lib/trading-model'
import { createAlpacaClient, getAlpacaKeys, isPaperTrading } from '@/lib/alpaca-client'
import { initializeNewsAnalyzer, getNewsAnalyzer } from '@/lib/news-sentiment'
import { TradingErrorHandler, withRetry } from '@/lib/error-handler'
import { initializeFRED, isFREDInitialized } from '@/lib/fred-data'
import { StockScanner, getDefaultScalpingStocks } from '@/lib/stock-scanner'

export interface BotStatus {
  isRunning: boolean
  lastRun: string | null
  totalTrades: number
  activePositions: number
  currentSignals: TradingSignal[]
  error?: string
}

export interface BotConfig {
  symbols: string[]
  interval: number // seconds
  settings: TradingSettings
  accountType: string
  strategy: string
}

// Global bot state (in production, use Redis or database)
let botState: {
  isRunning: boolean
  intervalId: NodeJS.Timeout | null
  config: BotConfig | null
  lastRun: Date | null
  error: string | null
} = {
  isRunning: false,
  intervalId: null,
  config: null,
  lastRun: null,
  error: null
}

// POST - Start/Stop trading bot
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createServerClient(req, {})
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { action, config }: { action: 'start' | 'stop', config?: BotConfig } = body

    if (action === 'start') {
      return await startBot(supabase, user.id, config!)
    } else if (action === 'stop') {
      return await stopBot(supabase, user.id)
    } else {
      return NextResponse.json({ 
        success: false, 
        error: 'Invalid action. Use "start" or "stop"' 
      }, { status: 400 })
    }

  } catch (error) {
    console.error('Error in POST /api/trading:', error)
    return NextResponse.json({ 
      success: false, 
      error: 'Internal server error' 
    }, { status: 500 })
  }
}

// GET - Get bot status
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createServerClient(req, {})
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const status = await getBotStatus(supabase, user.id)

    return NextResponse.json({
      success: true,
      status
    })

  } catch (error) {
    console.error('Error in GET /api/trading:', error)
    return NextResponse.json({ 
      success: false, 
      error: 'Internal server error' 
    }, { status: 500 })
  }
}

// Start the trading bot
async function startBot(supabase: any, userId: string, config: BotConfig): Promise<NextResponse> {
  try {
    // Stop existing bot if running
    if (botState.isRunning) {
      await stopBot(supabase, userId)
    }

    // Validate configuration
    if (!config.symbols || config.symbols.length === 0) {
      return NextResponse.json({ 
        success: false, 
        error: 'No symbols specified for trading' 
      }, { status: 400 })
    }

    // Get Alpaca credentials from environment variables first, fallback to database
    let alpacaApiKey: string | undefined = process.env.ALPACA_PAPER_KEY;
    let alpacaSecretKey: string | undefined = process.env.ALPACA_PAPER_SECRET;
    let newsApiKey: string | undefined = process.env.NEWS_API_KEY;
    
    // If not in environment, try to get from database (only if we have a real user ID)
    if (!alpacaApiKey || !alpacaSecretKey) {
      if (userId && userId !== '00000000-0000-0000-0000-000000000000') {
        const { data: apiKeys, error: keysError } = await supabase.rpc('get_user_api_keys', {
          user_uuid: userId
        })

        if (!keysError && apiKeys?.[0]) {
          const keys = apiKeys[0]
          alpacaApiKey = keys.alpaca_paper_key;
          alpacaSecretKey = keys.alpaca_paper_secret;
          newsApiKey = keys.news_api_key;
        }
      }
    }

    // Final check to ensure Alpaca keys are available
    if (!alpacaApiKey || !alpacaSecretKey) {
      return NextResponse.json({ 
        success: false, 
        error: 'API keys not found. Please configure your Alpaca API keys in environment variables or database.' 
      }, { status: 400 })
    }

    // Create a keys object for backward compatibility
    const keys = {
      alpaca_paper_key: alpacaApiKey,
      alpaca_paper_secret: alpacaSecretKey,
      news_api_key: newsApiKey || null,
      alpaca_live_key: null,
      alpaca_live_secret: null
    }
    
    // Initialize news analyzer if NewsAPI key exists
    if (newsApiKey) {
      try {
        initializeNewsAnalyzer(newsApiKey)
        console.log('✅ News analyzer initialized')
      } catch (error) {
        console.warn('⚠️  Failed to initialize news analyzer:', error)
      }
    }

    // Initialize FRED service if API key exists
    const fredApiKey = process.env.FRED_API_KEY;
    if (fredApiKey && !isFREDInitialized()) {
      try {
        initializeFRED(fredApiKey)
        console.log('✅ FRED service initialized')
      } catch (error) {
        console.warn('⚠️  Failed to initialize FRED service:', error)
      }
    }

    // Store bot configuration
    botState.config = config
    botState.isRunning = true
    botState.error = null

    // Start the trading loop
    const intervalId = setInterval(async () => {
      try {
        await executeTradingLoop(supabase, userId, config, keys)
        botState.lastRun = new Date()
        botState.error = null
  } catch (error) {
        console.error('Trading loop error:', error)
        
        let errorMessage: string
        if (error instanceof Error) {
          errorMessage = error.message
        } else if (typeof error === 'object' && error !== null) {
          // Try to extract meaningful info from error object
          errorMessage = JSON.stringify(error, null, 2)
        } else {
          errorMessage = String(error)
        }
        
        console.error('Error details:', {
          message: errorMessage,
          stack: error instanceof Error ? error.stack : undefined,
          name: error instanceof Error ? error.name : undefined,
          type: typeof error,
          fullError: error
        })
        botState.error = errorMessage || 'Unknown error'
      }
    }, config.interval * 1000)

    botState.intervalId = intervalId

    // Log bot start
    await supabase
      .from('bot_logs')
      .insert({
        user_id: userId,
        action: 'start',
        message: `Bot started with symbols: ${config.symbols.join(', ')}`,
        config: config
      })

    console.log(`Trading bot started for user ${userId} with symbols: ${config.symbols.join(', ')}`)

    return NextResponse.json({
      success: true,
      message: 'Trading bot started successfully',
      config
    })

  } catch (error) {
    console.error('Error starting bot:', error)
    botState.isRunning = false
    botState.error = error instanceof Error ? error.message : 'Unknown error'
    
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to start trading bot' 
    }, { status: 500 })
  }
}

// Stop the trading bot
async function stopBot(supabase: any, userId: string): Promise<NextResponse> {
  try {
    if (botState.intervalId) {
      clearInterval(botState.intervalId)
      botState.intervalId = null
    }

    const wasRunning = botState.isRunning
    botState.isRunning = false
    botState.config = null
    botState.error = null

    if (wasRunning) {
      // Log bot stop
      await supabase
        .from('bot_logs')
        .insert({
          user_id: userId,
          action: 'stop',
          message: 'Bot stopped by user'
        })

      console.log(`Trading bot stopped for user ${userId}`)
    }

    return NextResponse.json({
      success: true,
      message: 'Trading bot stopped successfully'
    })

  } catch (error) {
    console.error('Error stopping bot:', error)
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to stop trading bot' 
    }, { status: 500 })
  }
}

// Execute the main trading loop
async function executeTradingLoop(supabase: any, userId: string, config: BotConfig, apiKeys: any) {
  try {
    console.log('═══════════════════════════════════════════════════════════')
    console.log('🤖 STARTING ADVANCED SCALPING BOT CYCLE')
    console.log('═══════════════════════════════════════════════════════════')

    // Initialize Alpaca client
    const alpacaKeys = getAlpacaKeys(apiKeys, config.accountType, config.strategy)
    const alpacaClient = createAlpacaClient({
      apiKey: alpacaKeys.apiKey,
      secretKey: alpacaKeys.secretKey,
      baseUrl: alpacaKeys.paper ? 'https://paper-api.alpaca.markets' : 'https://api.alpaca.markets',
      paper: alpacaKeys.paper
    })

    await alpacaClient.initialize()
    console.log('✅ Alpaca client initialized (', alpacaKeys.paper ? 'PAPER' : 'LIVE', 'trading)')

    // Check if market is open (skip if closed for live trading)
    if (!alpacaKeys.paper) {
      const marketOpen = await alpacaClient.isMarketOpen()
      if (!marketOpen) {
        console.log('⏸️  Market is closed, skipping trading loop')
        return
      }
    }

    // STEP 1: Get FRED Economic Indicators
    let fredIndicators: any = null
    let marketRisk = 0.3 // Default moderate risk
    let minConfidence = 0.55 // Base confidence threshold

    try {
      if (isFREDInitialized()) {
        const { getFREDService } = await import('@/lib/fred-data')
        const fredService = getFREDService()
        fredIndicators = await fredService.getIndicators()
        marketRisk = fredService.calculateMarketRisk(fredIndicators)
        
        // Adjust confidence threshold based on market risk
        minConfidence = 0.55 + (marketRisk * 0.15) // Higher risk = higher threshold (0.55-0.70)
        
        console.log(`📊 Market Risk: ${(marketRisk * 100).toFixed(1)}% | Min Confidence: ${(minConfidence * 100).toFixed(0)}%`)
      } else {
        console.log('⚠️  FRED not initialized, using default risk parameters')
      }
    } catch (error) {
      console.warn('⚠️  Could not fetch FRED data:', error)
    }

    // STEP 2: Dynamic Stock Scanning
    let scalpingStocks: string[] = []
    try {
      console.log('🔍 Scanning universe for best scalping candidates...')
      const scanner = new StockScanner(alpacaClient)
      scalpingStocks = await scanner.getTopScalpingStocks(20)
      
      if (scalpingStocks.length === 0) {
        console.log('⚠️  No candidates found, using default stocks')
        scalpingStocks = getDefaultScalpingStocks()
      }
    } catch (error) {
      console.warn('⚠️  Stock scanning failed, using default stocks:', error)
      scalpingStocks = getDefaultScalpingStocks()
    }

    // STEP 3: Get Technical Indicators
    console.log('📈 Fetching technical indicators...')
    const indicatorsResponse = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/stocks/indicators`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbols: scalpingStocks })
    })

    if (!indicatorsResponse.ok) {
      throw new Error(`Failed to fetch indicators: ${indicatorsResponse.status}`)
    }

    const indicatorsData = await indicatorsResponse.json()
    
    if (!indicatorsData.success || !indicatorsData.indicators || indicatorsData.indicators.length === 0) {
      throw new Error('No technical indicators available')
    }

    console.log(`✅ Technical indicators received for ${indicatorsData.indicators.length} symbols`)

    // STEP 4: Get News Sentiment
    let sentimentData: { [symbol: string]: any } = {}
    try {
      const newsAnalyzer = getNewsAnalyzer()
      console.log('📰 Fetching news sentiment...')
      sentimentData = await newsAnalyzer.getSentimentForSymbols(scalpingStocks, 1)
      console.log(`✅ News sentiment received for ${Object.keys(sentimentData).length} symbols`)
    } catch (error) {
      console.warn('⚠️  News sentiment unavailable:', error)
    }

    // STEP 5: Enhance Features with News + FRED
    console.log('🔬 Enhancing features with macro data...')
    const enhancedFeatures = indicatorsData.indicators.map((indicator: any) => ({
      ...indicator,
      news_sentiment: sentimentData[indicator.symbol]?.score || 0,
      news_confidence: sentimentData[indicator.symbol]?.confidence || 0,
      market_risk: marketRisk,
      vix: fredIndicators?.vix || 18,
      yield_curve: fredIndicators?.yield_curve || 0,
      fed_funds_rate: fredIndicators?.fed_funds_rate || 5.0
    }))

    // STEP 6: Get ML Predictions
    console.log('🧠 Calling ML prediction service...')
    const mlResponse = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/ml/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        features: enhancedFeatures,
        include_probabilities: true
      })
    })

    if (!mlResponse.ok) {
      throw new Error(`ML service returned ${mlResponse.status}`)
    }

    const mlData = await mlResponse.json()
    
    if (!mlData.success || !mlData.signals) {
      throw new Error('ML service did not return valid signals')
    }

    console.log(`✅ ML predictions received for ${mlData.signals.length} symbols`)

    // STEP 7: Get Current Positions
    console.log('📊 Checking current positions...')
    const positions = await alpacaClient.getPositions()
    const currentHoldings = positions.map((p: any) => p.symbol)
    console.log(`📌 Currently holding ${currentHoldings.length} positions: ${currentHoldings.join(', ')}`)

    // STEP 8: Process ML Signals - Separate BUY and SELL
    const allSignals = mlData.signals.map((s: any) => {
      const sentiment = sentimentData[s.symbol]
      const sentimentBoost = sentiment ? sentiment.score * 0.15 : 0
      const adjustedConfidence = Math.min(s.confidence + sentimentBoost, 1.0)
      
      return {
        symbol: s.symbol,
        action: s.action,
        confidence: s.confidence,
        adjusted_confidence: adjustedConfidence,
        price: s.price || 0,
        timestamp: s.timestamp || new Date().toISOString(),
        reasoning: s.reasoning || `ML ${s.action} signal`,
        news_sentiment: sentiment?.score || 0,
        news_headlines: sentiment?.headlines || [],
        is_held: currentHoldings.includes(s.symbol)
      }
    })

    // SELL signals: Only for positions we currently hold
    const sellSignals = allSignals
      .filter((s: any) => s.action === 'sell' && s.is_held && s.adjusted_confidence >= minConfidence)
      .sort((a: any, b: any) => b.adjusted_confidence - a.adjusted_confidence)

    // BUY signals: Only for positions we don't hold
    const buySignals = allSignals
      .filter((s: any) => s.action === 'buy' && !s.is_held && s.adjusted_confidence >= minConfidence)
      .sort((a: any, b: any) => b.adjusted_confidence - a.adjusted_confidence)

    console.log(`🎯 Generated ${sellSignals.length} SELL signals (for existing positions)`)
    console.log(`🎯 Generated ${buySignals.length} BUY signals (for new positions)`)
    
    // Combine: Process SELLs first (free up capital), then BUYs
    let signals = [...sellSignals, ...buySignals]

    // STEP 9: Process SELL Signals (exit existing positions)
    console.log('═══════════════════════════════════════════════════════════')
    console.log(`🔄 PROCESSING SELL SIGNALS: ${sellSignals.length} positions to exit`)
    console.log('═══════════════════════════════════════════════════════════')
    
    for (const sellSignal of sellSignals) {
      console.log(`📉 SELL ${sellSignal.symbol} @ $${sellSignal.price.toFixed(2)}`)
      console.log(`   Confidence: ${(sellSignal.adjusted_confidence * 100).toFixed(1)}%`)
      console.log(`   Reasoning: ${sellSignal.reasoning}`)
      
      // Get current position details
      const position = positions.find((p: any) => p.symbol === sellSignal.symbol)
      if (position) {
        sellSignal.shares = Math.abs(parseInt(position.qty))
        sellSignal.allocated_capital = Math.abs(parseFloat(position.market_value))
        console.log(`   Selling entire position: ${sellSignal.shares} shares = $${sellSignal.allocated_capital.toFixed(2)}`)
      }
    }

    // STEP 10: Intelligent Capital Allocation for BUY Signals
    const account = await alpacaClient.getAccount()
    let availableCash = parseFloat(account.buying_power)
    
    console.log('═══════════════════════════════════════════════════════════')
    console.log(`💰 ALLOCATING CAPITAL FOR BUY SIGNALS: ${buySignals.length} candidates`)
    console.log('═══════════════════════════════════════════════════════════')
    
    const allocatedBuySignals = allocateCapital(buySignals, availableCash, marketRisk)
    
    // Combine all signals: SELLs (already configured) + allocated BUYs
    signals = [...sellSignals, ...allocatedBuySignals]

    console.log('═══════════════════════════════════════════════════════════')
    console.log(`🎯 FINAL TRADE PLAN: ${signals.length} total (${sellSignals.length} sells, ${allocatedBuySignals.length} buys)`)
    console.log('═══════════════════════════════════════════════════════════')

    signals.forEach((signal: any, i: number) => {
      console.log(`${i + 1}. ${signal.action.toUpperCase()} ${signal.symbol} @ $${signal.price.toFixed(2)}`)
      if (signal.shares) {
        console.log(`   Confidence: ${(signal.adjusted_confidence * 100).toFixed(1)}% | Shares: ${signal.shares} | Capital: $${signal.allocated_capital.toFixed(2)}`)
      } else {
        console.log(`   Confidence: ${(signal.adjusted_confidence * 100).toFixed(1)}%`)
      }
      console.log(`   Reasoning: ${signal.reasoning}`)
      if (signal.news_sentiment !== 0) {
        console.log(`   News: ${signal.news_sentiment > 0 ? '📈' : '📉'} ${(signal.news_sentiment * 100).toFixed(1)}%`)
      }
    })

    // Execute trades for signals with error handling
    for (const signal of signals) {
      try {
        await withRetry(
          () => executeTradeSignal(supabase, userId, signal, alpacaClient, config),
          {
            operation: 'execute_trade_signal',
            symbol: signal.symbol,
            quantity: 1, // Will be calculated in executeTradeSignal
            userId
          }
        )
      } catch (error) {
        console.error(`Error executing trade for ${signal.symbol}:`, error)
        
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        
        // Log the error to database
        await supabase
          .from('bot_logs')
          .insert({
            user_id: userId,
            action: 'error',
            message: `Failed to execute trade for ${signal.symbol}: ${errorMessage}`,
            data: { signal, error: errorMessage }
          })
      }
    }

    // Log the trading loop execution
    await supabase
      .from('bot_logs')
      .insert({
        user_id: userId,
        action: 'execute',
        message: `Trading loop executed. Generated ${signals.length} signals`,
        data: {
          symbols: scalpingStocks,
          signals: signals.map((s: any) => ({
            symbol: s.symbol,
            action: s.action,
            confidence: s.confidence,
            price: s.price,
            reasoning: s.reasoning,
            timestamp: s.timestamp
          }))
        }
      })

  } catch (error) {
    console.error('Error in trading loop:', error)
    throw error
  }
}

/**
 * Intelligent capital allocation based on confidence and market risk
 */
function allocateCapital(signals: any[], availableCash: number, marketRisk: number): any[] {
  console.log(`💰 Allocating capital: $${availableCash.toFixed(2)} available`)
  
  // In high risk markets, reduce position sizes
  const riskAdjustment = 1 - (marketRisk * 0.5)
  const maxPositionPct = 0.15 * riskAdjustment // Max 15% per position, adjusted for risk
  const maxTotalExposure = 0.7 * riskAdjustment // Max 70% deployed, adjusted for risk
  
  console.log(`   Risk Adjustment: ${(riskAdjustment * 100).toFixed(0)}%`)
  console.log(`   Max Per Position: ${(maxPositionPct * 100).toFixed(1)}%`)
  console.log(`   Max Total Exposure: ${(maxTotalExposure * 100).toFixed(1)}%`)
  
  const maxPositionSize = availableCash * maxPositionPct
  const maxTotalCash = availableCash * maxTotalExposure

  let totalAllocated = 0
  const allocatedSignals = []

  for (const signal of signals) {
    // Calculate position size based on adjusted confidence
    // Higher confidence = larger position
    const confidenceWeight = signal.adjusted_confidence || signal.confidence
    const baseAllocation = maxPositionSize * (confidenceWeight / 1.0)
    const positionValue = Math.min(baseAllocation, maxPositionSize)

    if (totalAllocated + positionValue > maxTotalCash) {
      console.log(`   ⚠️  Capital limit reached at ${totalAllocated.toFixed(2)}, skipping ${signal.symbol}`)
      break
    }

    const shares = Math.floor(positionValue / signal.price)
    const actualValue = shares * signal.price
    
    if (shares > 0 && actualValue > 0) {
      allocatedSignals.push({
        ...signal,
        allocated_capital: actualValue,
        shares,
        allocation_pct: (actualValue / availableCash) * 100
      })
      totalAllocated += actualValue
    }
  }

  console.log(`   ✅ Allocated $${totalAllocated.toFixed(2)} (${((totalAllocated / availableCash) * 100).toFixed(1)}%) across ${allocatedSignals.length} positions`)
  
  return allocatedSignals
}

// Execute a trade signal
async function executeTradeSignal(
  supabase: any,
  userId: string,
  signal: any, // Extended signal with shares and allocated_capital
  alpacaClient: any,
  config: BotConfig
) {
  try {
    // Use pre-allocated position size from capital allocation
    const positionSize = signal.shares || 1
    const totalCost = signal.allocated_capital || (positionSize * signal.price)

    console.log(`📝 Executing: ${signal.action.toUpperCase()} ${positionSize} shares of ${signal.symbol} @ $${signal.price.toFixed(2)} = $${totalCost.toFixed(2)}`)

    // Get account info for final validation
    const account = await alpacaClient.getAccount()
    const buyingPower = parseFloat(account.buying_power)
    const cash = parseFloat(account.cash)

    // For BUY orders, check buying power
    if (signal.action === 'buy') {
      if (totalCost > buyingPower) {
        console.log(`❌ Insufficient buying power for ${signal.symbol}: need $${totalCost.toFixed(2)}, have $${buyingPower.toFixed(2)}`)
        return
      }
      
      // Validate trade parameters
      const validation = TradingErrorHandler.validateTradeParams({
        symbol: signal.symbol,
        quantity: positionSize,
        price: signal.price,
        accountBalance: cash,
        buyingPower: buyingPower
      })

      if (!validation.valid) {
        console.log(`❌ Trade validation failed for ${signal.symbol}: ${validation.error}`)
        return
      }
    }
    
    // For SELL orders, no buying power check needed (we're closing a position)

    // Check if market is open (for live trading)
    if (!alpacaClient.getConfig().paper) {
      const marketOpen = await alpacaClient.isMarketOpen()
      if (!marketOpen) {
        console.log(`Market is closed, skipping trade for ${signal.symbol}`)
        return
      }
    }

    // Place the order
    let order
    if (signal.action === 'buy') {
      order = await alpacaClient.placeMarketOrder(
        signal.symbol,
        positionSize,
        'buy',
        'day'
      )
    } else if (signal.action === 'sell') {
      order = await alpacaClient.placeMarketOrder(
        signal.symbol,
        positionSize,
        'sell',
        'day'
      )
    } else {
      return // Skip hold signals
    }

    // Log the trade
    const { error: tradeError } = await supabase
      .from('trades')
      .insert({
        user_id: userId,
        symbol: signal.symbol,
        action: signal.action,
        qty: positionSize,
        price: signal.price,
        trade_timestamp: new Date().toISOString(),
        strategy: config.strategy,
        account_type: config.accountType,
        alpaca_order_id: order.id,
        order_status: order.status,
        confidence: signal.confidence,
        reasoning: signal.reasoning
      })

    if (tradeError) {
      console.error('Error logging trade:', tradeError)
    }

    console.log(`Trade executed: ${signal.action} ${positionSize} ${signal.symbol} @ $${signal.price}`)

  } catch (error) {
    console.error(`Error executing trade signal for ${signal.symbol}:`, error)
    throw error
  }
}

// Get bot status
async function getBotStatus(supabase: any, userId: string): Promise<BotStatus> {
  try {
    // Get recent trades count
    const { data: trades, error: tradesError } = await supabase.rpc('get_user_trades', {
      user_uuid: userId,
      limit_count: 1000,
      offset_count: 0
    })

    // Get active positions (simplified - would need to query Alpaca)
    const { data: positions, error: positionsError } = await supabase
      .from('trades')
      .select('symbol, action, qty')
      .eq('user_id', userId)
      .eq('order_status', 'filled')

    // Get current signals (either from running bot or test signals)
    const currentSignals: TradingSignal[] = []
    
    // First try to get signals from running bot (within last 2 minutes)
    if (botState.isRunning && botState.lastRun) {
      const recentLogs = await supabase
        .from('bot_logs')
        .select('*')
        .eq('user_id', userId)
        .eq('action', 'execute')
        .gte('created_at', new Date(Date.now() - 2 * 60 * 1000).toISOString()) // Last 2 minutes
        .order('created_at', { ascending: false })
        .limit(1)

      if (recentLogs.data && recentLogs.data.length > 0) {
        const latestLog = recentLogs.data[0]
        if (latestLog.data?.signals) {
          currentSignals.push(...latestLog.data.signals.map((s: any) => ({
            symbol: s.symbol,
            action: s.action as 'buy' | 'sell' | 'hold',
            confidence: s.confidence,
            price: s.price || 0,
            timestamp: s.timestamp || latestLog.created_at,
            reasoning: s.reasoning || `Generated at ${new Date(latestLog.created_at).toLocaleTimeString()}`
          })))
        }
      }
    }
    
    // If no signals from running bot, check for test signals (within last 10 minutes)
    if (currentSignals.length === 0) {
      const testLogs = await supabase
        .from('bot_logs')
        .select('*')
        .eq('user_id', userId)
        .eq('action', 'test_signals')
        .gte('created_at', new Date(Date.now() - 10 * 60 * 1000).toISOString()) // Last 10 minutes
        .order('created_at', { ascending: false })
        .limit(1)

      if (testLogs.data && testLogs.data.length > 0) {
        const latestTestLog = testLogs.data[0]
        if (latestTestLog.data?.signals) {
          currentSignals.push(...latestTestLog.data.signals.map((s: any) => ({
            symbol: s.symbol,
            action: s.action as 'buy' | 'sell' | 'hold',
            confidence: s.confidence,
            price: s.price || 0,
            timestamp: s.timestamp || latestTestLog.created_at,
            reasoning: s.reasoning || `Test signal generated at ${new Date(latestTestLog.created_at).toLocaleTimeString()}`
          })))
        }
      }
    }

    return {
      isRunning: botState.isRunning,
      lastRun: botState.lastRun?.toISOString() || null,
      totalTrades: trades?.length || 0,
      activePositions: positions?.length || 0,
      currentSignals,
      error: botState.error || undefined
    }

  } catch (error) {
    console.error('Error getting bot status:', error)
    return {
      isRunning: false,
      lastRun: null,
      totalTrades: 0,
      activePositions: 0,
      currentSignals: [],
      error: 'Failed to get bot status'
    }
  }
}