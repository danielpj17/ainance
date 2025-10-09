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
    const supabase = createServerClient(req, {})
    
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
    const supabase = createServerClient(req, {})
    
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
        botState.error = error instanceof Error ? error.message : 'Unknown error'
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

    // Initialize Alpaca client
    const alpacaKeys = getAlpacaKeys(apiKeys, config.accountType, config.strategy)
    const alpacaClient = createAlpacaClient({
      apiKey: alpacaKeys.apiKey,
      secretKey: alpacaKeys.secretKey,
      baseUrl: alpacaKeys.paper ? 'https://paper-api.alpaca.markets' : 'https://api.alpaca.markets',
      paper: alpacaKeys.paper
    })

    await alpacaClient.initialize()

    // Check if market is open (skip if closed for live trading)
    if (!alpacaKeys.paper) {
      const marketOpen = await alpacaClient.isMarketOpen()
      if (!marketOpen) {
        console.log('Market is closed, skipping trading loop')
        return
      }
    }

    // Get market data for all symbols
    const marketData = await alpacaClient.getMarketData(config.symbols, '1Min')
    
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

    // Offload signal generation to Python RF model endpoint
    const symbols = marketData.map(d => d.symbol)
    const currentPrices = marketData.map(d => d.close)
    const predictRes = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/model/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbols, mode: config.accountType, settings: config.settings })
    })
    const predictJson = await predictRes.json().catch(() => ({ success: false }))
    const signals: TradingSignal[] = (predictJson?.signals || []).map((s: any) => ({
      symbol: s.symbol,
      action: s.action,
      confidence: s.confidence,
      price: s.price,
      timestamp: s.timestamp,
      reasoning: s.reasoning || 'RF prediction'
    }))

    console.log(`Generated ${signals.length} trading signals`)

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
            confidence: s.confidence
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
    const positionSize = await alpacaClient.calculatePositionSize(
      signal.symbol,
      signal.price,
      config.settings.max_trade_size / 100, // Convert percentage to decimal
      config.settings.account_type === 'margin'
    )

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

    if (positionSize <= 0) {
      console.log(`Invalid position size for ${signal.symbol}`)
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
        timestamp: new Date().toISOString(),
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

    // Get recent signals (from bot logs)
    const { data: recentLogs, error: logsError } = await supabase
      .from('bot_logs')
      .select('*')
      .eq('user_id', userId)
      .eq('action', 'execute')
      .order('created_at', { ascending: false })
      .limit(5)

    const currentSignals: TradingSignal[] = []
    if (recentLogs && recentLogs.length > 0) {
      const latestLog = recentLogs[0]
      if (latestLog.data?.signals) {
        currentSignals.push(...latestLog.data.signals.map((s: any) => ({
          symbol: s.symbol,
          action: s.action as 'buy' | 'sell' | 'hold',
          confidence: s.confidence,
          price: 0, // Would need to fetch current price
          timestamp: latestLog.created_at,
          reasoning: `Generated at ${new Date(latestLog.created_at).toLocaleTimeString()}`
        })))
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