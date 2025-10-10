export const runtime = 'nodejs'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/utils/supabase/server'
import { tradingModel, TradingSignal, TradingSettings } from '@/lib/trading-model'
import { createAlpacaClient, getAlpacaKeys, isPaperTrading } from '@/lib/alpaca-client'
import { initializeNewsAnalyzer, getNewsAnalyzer } from '@/lib/news-sentiment'
import { TradingErrorHandler, withRetry } from '@/lib/error-handler'

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

    // Get user's API keys
    const { data: apiKeys, error: keysError } = await supabase.rpc('get_user_api_keys', {
      user_uuid: userId
    })

    if (keysError || !apiKeys?.[0]) {
      return NextResponse.json({ 
        success: false, 
        error: 'API keys not found. Please configure your trading keys.' 
      }, { status: 400 })
    }

    const keys = apiKeys[0]
    
    // Initialize news analyzer if NewsAPI key exists
    if (keys.news_api_key) {
      try {
        initializeNewsAnalyzer(keys.news_api_key)
      } catch (error) {
        console.warn('Failed to initialize news analyzer:', error)
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
    console.log(`Executing trading loop for ${config.symbols.join(', ')}`)
    console.log('API Keys available:', {
      hasPaperKey: !!apiKeys.alpaca_paper_key,
      hasPaperSecret: !!apiKeys.alpaca_paper_secret,
      hasNewsKey: !!apiKeys.news_api_key
    })

    // Initialize Alpaca client
    console.log('Initializing Alpaca client...')
    const alpacaKeys = getAlpacaKeys(apiKeys, config.accountType, config.strategy)
    console.log('Alpaca keys extracted:', {
      hasApiKey: !!alpacaKeys.apiKey,
      hasSecretKey: !!alpacaKeys.secretKey,
      isPaper: alpacaKeys.paper
    })
    
    const alpacaClient = createAlpacaClient({
      apiKey: alpacaKeys.apiKey,
      secretKey: alpacaKeys.secretKey,
      baseUrl: alpacaKeys.paper ? 'https://paper-api.alpaca.markets' : 'https://api.alpaca.markets',
      paper: alpacaKeys.paper
    })

    console.log('Connecting to Alpaca...')
    await alpacaClient.initialize()
    console.log('Alpaca client initialized successfully')

    // Check if market is open (skip if closed for live trading)
    if (!alpacaKeys.paper) {
      const marketOpen = await alpacaClient.isMarketOpen()
      if (!marketOpen) {
        console.log('Market is closed, skipping trading loop')
        return
      }
    }

    // Get market data for all symbols
    console.log('Fetching market data...')
    const marketData = await alpacaClient.getMarketData(config.symbols, '1Min')
    console.log('Market data received:', marketData.length, 'symbols')
    
    if (marketData.length === 0) {
      console.log('No market data available')
      return
    }

    // Get news sentiment for symbols (if news API is available)
    let sentimentData: { [symbol: string]: number } = {}
    try {
      const newsAnalyzer = getNewsAnalyzer()
      const sentimentResults = await newsAnalyzer.getSentimentForSymbols(config.symbols, 1)
      
      for (const [symbol, sentiment] of Object.entries(sentimentResults)) {
        sentimentData[symbol] = sentiment.score
      }
    } catch (error) {
      console.warn('Failed to get news sentiment:', error)
      // Continue without sentiment data
    }

    // Generate trading signals using rule-based logic
    console.log('Generating trading signals...')
    console.log('Sentiment data:', sentimentData)
    const symbols = marketData.map(d => d.symbol)
    const currentPrices = marketData.map(d => d.close)
    
    let signals: TradingSignal[] = []
    try {
      // Use simple rule-based signals (sentiment + price momentum)
      for (let i = 0; i < marketData.length; i++) {
        const data = marketData[i]
        const sentiment = sentimentData[data.symbol] || 0
        
        console.log(`${data.symbol}: sentiment=${sentiment.toFixed(3)}, price=$${data.close}`)
        
        // More aggressive signal generation with lower thresholds
        let action: 'buy' | 'sell' | 'hold' = 'hold'
        let confidence = 0.5
        let reasoning = 'No clear signal'
        
        // Bullish conditions: positive sentiment (lowered threshold from 0.3 to 0.1)
        if (sentiment > 0.1) {
          action = 'buy'
          confidence = 0.6 + (sentiment * 0.4)
          reasoning = `Positive sentiment (${sentiment.toFixed(2)}) suggests upward momentum`
        }
        // Bearish conditions: negative sentiment (lowered threshold from -0.3 to -0.1)
        else if (sentiment < -0.1) {
          action = 'sell'
          confidence = 0.6 + (Math.abs(sentiment) * 0.4)
          reasoning = `Negative sentiment (${sentiment.toFixed(2)}) suggests downward pressure`
        }
        // Neutral but lean bullish (for testing)
        else if (sentiment >= 0) {
          action = 'buy'
          confidence = 0.55
          reasoning = `Neutral to slightly positive sentiment, market conditions favorable`
        }
        
        // Only add signals with sufficient confidence
        if (action !== 'hold' && confidence >= 0.55) {
          signals.push({
            symbol: data.symbol,
            action,
            confidence,
            price: data.close,
            timestamp: new Date().toISOString(),
            reasoning: `${reasoning} | Price: $${data.close} | Sentiment: ${sentiment.toFixed(3)}`
          })
          console.log(`✅ Signal generated: ${action.toUpperCase()} ${data.symbol} @ $${data.close} (confidence: ${confidence.toFixed(2)})`)
        } else {
          console.log(`⏸️  No signal for ${data.symbol} (action: ${action}, confidence: ${confidence.toFixed(2)})`)
        }
      }
      
      console.log(`Generated ${signals.length} trading signals`)
    } catch (error) {
      console.error('Error generating signals:', error)
      const errorMsg = error instanceof Error ? error.message : JSON.stringify(error)
      throw new Error(`Failed to generate trading signals: ${errorMsg}`)
    }

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
          symbols: config.symbols,
          signals: signals.map(s => ({
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

// Execute a trade signal
async function executeTradeSignal(
  supabase: any,
  userId: string,
  signal: TradingSignal,
  alpacaClient: any,
  config: BotConfig
) {
  try {
    // Get account info for validation
    const account = await alpacaClient.getAccount()
    const buyingPower = parseFloat(account.buying_power)
    const cash = parseFloat(account.cash)

    // Calculate position size
    let positionSize = await alpacaClient.calculatePositionSize(
      signal.symbol,
      signal.price,
      config.settings.max_trade_size / 100, // Convert percentage to decimal
      config.settings.account_type === 'margin'
    )

    // Ensure position size is at least 1 and is an integer
    positionSize = Math.max(1, Math.floor(positionSize))

    console.log(`Position size for ${signal.symbol}: ${positionSize} shares @ $${signal.price} = $${(positionSize * signal.price).toFixed(2)}`)

    // Check if we have enough buying power
    const totalCost = positionSize * signal.price
    if (totalCost > buyingPower) {
      console.log(`Insufficient buying power for ${signal.symbol}: need $${totalCost.toFixed(2)}, have $${buyingPower.toFixed(2)}`)
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
      console.log(`Trade validation failed for ${signal.symbol}: ${validation.error}`)
      return
    }

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