export const runtime = 'nodejs'
// Increase timeout for Vercel Pro plan (Hobby plan has 10s limit)
export const maxDuration = 30
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, getDemoUserIdServer } from '@/utils/supabase/server'
import { tradingModel, TradingSignal, TradingSettings } from '@/lib/trading-model'
import { createAlpacaClient, getAlpacaKeys, isPaperTrading } from '@/lib/alpaca-client'
import { initializeNewsAnalyzer, getNewsAnalyzer } from '@/lib/news-sentiment'
import { TradingErrorHandler, withRetry } from '@/lib/error-handler'
import { isDemoMode } from '@/lib/demo-user'
import { initializeFRED, isFREDInitialized } from '@/lib/fred-data'
import { StockScanner, getDefaultScalpingStocks } from '@/lib/stock-scanner'

export interface BotStatus {
  isRunning: boolean
  lastRun: string | null
  totalTrades: number
  activePositions: number
  currentSignals: TradingSignal[]
  error?: string
  marketOpen?: boolean
  nextMarketOpen?: string
  alwaysOn?: boolean
}

export interface BotConfig {
  symbols: string[]
  interval: number // seconds
  settings: TradingSettings
  accountType: string
  strategy: string
}

// In-memory bot state (for interval management)
// Actual state is persisted in database
let botState: {
  intervalId: NodeJS.Timeout | null
  userId: string | null
} = {
  intervalId: null,
  userId: null
}

// Market hours utility function
export function isMarketOpen(): boolean {
  const now = new Date()
  const et = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}))
  const day = et.getDay()
  const hours = et.getHours()
  const minutes = et.getMinutes()
  
  // Market closed on weekends
  if (day === 0 || day === 6) return false
  
  // Market open 9:30 AM - 4:00 PM ET
  const currentMinutes = hours * 60 + minutes
  const marketOpen = 9 * 60 + 30 // 9:30 AM
  const marketClose = 16 * 60 // 4:00 PM
  
  return currentMinutes >= marketOpen && currentMinutes < marketClose
}

// Get next market open time (returns Date object - will be formatted in ET in the UI)
function getNextMarketOpen(): Date {
  const now = new Date()
  
  // Get current time in ET
  const etFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
  
  const parts = etFormatter.formatToParts(now)
  const etYear = parseInt(parts.find(p => p.type === 'year')!.value)
  const etMonth = parseInt(parts.find(p => p.type === 'month')!.value) - 1
  const etDay = parseInt(parts.find(p => p.type === 'day')!.value)
  const etHour = parseInt(parts.find(p => p.type === 'hour')!.value)
  const etMinute = parseInt(parts.find(p => p.type === 'minute')!.value)
  
  // Calculate day of week in ET
  const etDate = new Date(etYear, etMonth, etDay)
  const day = etDate.getDay()
  const currentMinutes = etHour * 60 + etMinute
  const marketOpen = 9 * 60 + 30 // 9:30 AM ET
  
  // Calculate days to add
  let daysToAdd = 0
  if (day === 0) daysToAdd = 1 // Sunday -> Monday
  else if (day === 6) daysToAdd = 2 // Saturday -> Monday  
  else if (currentMinutes >= marketOpen) daysToAdd = 1 // After market close -> tomorrow
  
  // Create date string for 9:30 AM ET on target day
  // Format: YYYY-MM-DDTHH:mm:ss (we'll interpret this as ET time)
  const targetDay = etDay + daysToAdd
  const targetMonth = etMonth + 1
  
  // Create a date that represents 9:30 AM ET
  // We'll create it as if it's 9:30 AM in ET, then the display will format it correctly
  // The trick: create date string with ET timezone offset
  // ET is UTC-5 (EST) or UTC-4 (EDT) - we'll use -05:00 as default
  const dateStr = `${etYear}-${String(targetMonth).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}T09:30:00-05:00`
  
  return new Date(dateStr)
}

// Check if current time is in the last 30 minutes of trading (3:30 PM - 4:00 PM ET)
function isInLast30Minutes(): boolean {
  if (!isMarketOpen()) return false // Market must be open
  
  const now = new Date()
  const et = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}))
  const hours = et.getHours()
  const minutes = et.getMinutes()
  
  const currentMinutes = hours * 60 + minutes
  const last30Start = 15 * 60 + 30 // 3:30 PM
  const marketClose = 16 * 60 // 4:00 PM
  
  return currentMinutes >= last30Start && currentMinutes < marketClose
}

// POST - Start/Stop trading bot
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    let supabase
    try {
      supabase = createServerClient(req, {})
      // Verify client was created successfully
      if (!supabase) {
        throw new Error('Supabase client is null or undefined')
      }
    } catch (supabaseError: any) {
      console.error('❌ Error creating Supabase client:', supabaseError)
      console.error('Environment check:', {
        hasSupabaseUrl: Boolean(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL),
        hasServiceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)
      })
      return NextResponse.json({ 
        success: false, 
        error: `Server configuration error: ${supabaseError.message || 'Failed to initialize database connection. Please check your environment variables.'}` 
      }, { status: 500 })
    }
    
    // In demo mode, always use demo user ID
    let userId: string
    try {
      if (isDemoMode()) {
        userId = getDemoUserIdServer()
      } else {
        const { data: { user }, error: userError } = await supabase.auth.getUser()
        if (userError || !user) {
          return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
        }
        userId = user.id
      }
    } catch (authError: any) {
      console.error('Error getting user:', authError)
      return NextResponse.json({ 
        success: false, 
        error: `Authentication error: ${authError.message || 'Failed to authenticate'}` 
      }, { status: 401 })
    }

    let body
    try {
      body = await req.json()
    } catch (parseError: any) {
      console.error('Error parsing request body:', parseError)
      return NextResponse.json({ 
        success: false, 
        error: 'Invalid request body. Please check your request format.' 
      }, { status: 400 })
    }

    const { action, config, alwaysOn }: { action: 'start' | 'stop' | 'toggle-always-on', config?: BotConfig, alwaysOn?: boolean } = body

    console.log('📥 POST /api/trading:', { action, hasConfig: !!config, configKeys: config ? Object.keys(config) : [] })

    if (action === 'start') {
      if (!config) {
        console.error('❌ No config provided for start action')
        return NextResponse.json({ 
          success: false, 
          error: 'Configuration is required to start the bot' 
        }, { status: 400 })
      }
      console.log('🚀 Starting bot with config:', { symbols: config.symbols, interval: config.interval })
      return await startBot(supabase, userId, config)
    } else if (action === 'stop') {
      return await stopBot(supabase, userId)
    } else if (action === 'toggle-always-on') {
      if (alwaysOn === undefined) {
        return NextResponse.json({ 
          success: false, 
          error: 'Missing required parameter: alwaysOn' 
        }, { status: 400 })
      }
      return await toggleAlwaysOn(supabase, userId, alwaysOn)
    } else {
      return NextResponse.json({ 
        success: false, 
        error: 'Invalid action. Use "start", "stop", or "toggle-always-on"' 
      }, { status: 400 })
    }

  } catch (error: any) {
    console.error('Error in POST /api/trading:', error)
    return NextResponse.json({ 
      success: false, 
      error: `Internal server error: ${error.message || 'An unexpected error occurred'}` 
    }, { status: 500 })
  }
}

// GET - Get bot status
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createServerClient(req, {})
    
    // In demo mode, always use demo user ID
    let userId: string
    if (isDemoMode()) {
      userId = getDemoUserIdServer()
    } else {
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
      }
      userId = user.id
    }

    const status = await getBotStatus(supabase, userId)

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
export async function startBot(supabase: any, userId: string, config: BotConfig): Promise<NextResponse> {
  try {
    console.log('🚀 startBot called:', { userId, symbols: config?.symbols, interval: config?.interval })
    
    // Stop existing bot if running
    if (botState.intervalId) {
      console.log('⏹️  Stopping existing bot before starting new one')
      await stopBot(supabase, userId)
    }

    // Validate configuration
    if (!config || !config.symbols || config.symbols.length === 0) {
      console.error('❌ Invalid config:', { hasConfig: !!config, symbols: config?.symbols })
      return NextResponse.json({ 
        success: false, 
        error: 'No symbols specified for trading' 
      }, { status: 400 })
    }

    // Verify user exists in auth.users (skip for demo mode)
    const isDemo = isDemoMode() && userId === '00000000-0000-0000-0000-000000000000'
    if (!isDemo) {
      try {
        const { data: userData, error: userCheckError } = await supabase.auth.admin.getUserById(userId)
        if (userCheckError || !userData?.user) {
          console.error('❌ User not found in auth.users:', { userId, error: userCheckError })
          return NextResponse.json({ 
            success: false, 
            error: 'User account not found. Please log out and log back in to refresh your session.' 
          }, { status: 401 })
        }
        console.log('✅ User verified:', { userId, email: userData.user.email })
      } catch (adminError) {
        // If admin API is not available, try regular auth check
        console.warn('⚠️ Admin API not available, skipping user verification:', adminError)
      }
    } else {
      console.log('ℹ️ Demo mode: Skipping user verification')
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

    // Verify user exists in auth.users before proceeding
    const { data: userData, error: userCheckError } = await supabase.auth.admin.getUserById(userId)
    if (userCheckError || !userData?.user) {
      console.error('❌ User not found in auth.users:', { userId, error: userCheckError })
      return NextResponse.json({ 
        success: false, 
        error: 'User account not found. Please ensure you are logged in with a valid account.' 
      }, { status: 401 })
    }
    
    console.log('✅ User verified:', { userId, email: userData.user.email })

    // Get current always_on setting (don't change it when starting)
    const { data: currentState } = await supabase.rpc('get_bot_state', {
      user_uuid: userId
    })
    const currentAlwaysOn = currentState?.[0]?.always_on || false

    // Store bot state in database - ensure it completes with retry logic
    let updateError = null
    const maxRetries = 3
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const result = await supabase.rpc('update_bot_state', {
        user_uuid: userId,
        is_running_param: true,
        config_param: config,
        error_param: null,
        always_on_param: currentAlwaysOn
      })
      
      updateError = result.error
      
      if (!updateError) {
        console.log('✅ Bot state updated in database: is_running=true')
        break // Success, exit retry loop
      }
      
      // Check for foreign key constraint violation
      if (updateError?.message?.includes('foreign key constraint') || updateError?.code === '23503') {
        console.error('❌ Foreign key constraint violation - user does not exist:', { userId, isDemo })
        
        if (isDemo) {
          // For demo mode, try to create the user record first
          console.log('🔧 Demo mode: Attempting to handle missing user record...')
          // The demo user should exist, but if it doesn't, we'll return a helpful error
          return NextResponse.json({ 
            success: false, 
            error: 'Demo user account not found in database. Please ensure the demo user exists in your Supabase project.' 
          }, { status: 400 })
        } else {
          return NextResponse.json({ 
            success: false, 
            error: 'User account not found in database. Please log out and log back in to refresh your session.' 
          }, { status: 400 })
        }
      }
      
      // If it's a network error and we have retries left, wait and retry
      if (updateError?.message?.includes('fetch failed') && attempt < maxRetries) {
        console.warn(`⚠️ Retry ${attempt}/${maxRetries} for update_bot_state after network error`)
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt)) // Exponential backoff
        continue
      }
      
      break // Either not a network error or out of retries
    }
    
    if (updateError) {
      console.error('❌ Error updating bot state to running after retries:', updateError)
      throw new Error(`Failed to update bot state: ${updateError.message}`)
    }

    // Store bot user ID
    botState.userId = userId

    // Execute trading loop immediately (don't wait for interval)
    console.log('🚀 Running initial trading loop immediately...')
    try {
      await executeTradingLoop(supabase, userId, config, keys)
      // Update last_run timestamp after successful execution
      const { error: updateError } = await supabase.rpc('update_bot_state', {
        user_uuid: userId,
        is_running_param: true,
        config_param: config,
        error_param: null
      })
      if (updateError) {
        console.error('⚠️ Error updating last_run:', updateError)
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error('Initial trading loop error:', errorMessage)
      // Still mark as running, but with error
      const { error: updateError } = await supabase.rpc('update_bot_state', {
        user_uuid: userId,
        is_running_param: true,
        config_param: config,
        error_param: errorMessage
      })
      if (updateError) {
        console.error('⚠️ Error updating bot state with error:', updateError)
      }
    }

    // NOTE: In serverless environments (Vercel), setInterval doesn't persist after the function returns.
    // The bot will continue running through the health check mechanism which calls executeTradingLoop.
    // We still set the interval for local development or if the function stays warm, but it's not reliable in production.
    // The health check endpoint (/api/trading/health-check) should be called every 2-5 minutes to keep the bot running.
    
    // Try to set interval for local development (may not work in serverless)
    try {
      const intervalId = setInterval(async () => {
        try {
          // Check if market is open (applies to both paper and live trading)
          if (!isMarketOpen()) {
            console.log('⏸️  Market is closed, bot running in standby mode')
            
            // Update bot state to show it's running but market is closed
            await supabase.rpc('update_bot_state', {
              user_uuid: userId,
              is_running_param: true,
              config_param: config,
              error_param: null
            })
            return
          }
          
          // Execute trading loop
          await executeTradingLoop(supabase, userId, config, keys)
          
          // Update bot state after each execution
          await supabase.rpc('update_bot_state', {
            user_uuid: userId,
            is_running_param: true,
            config_param: config,
            error_param: null
          })
        } catch (error) {
          console.error('Trading loop error:', error)
          
          let errorMessage: string
          if (error instanceof Error) {
            errorMessage = error.message
          } else if (typeof error === 'object' && error !== null) {
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
          
          // Update bot state with error
          await supabase.rpc('update_bot_state', {
            user_uuid: userId,
            is_running_param: true,
            config_param: config,
            error_param: errorMessage
          })
        }
      }, config.interval * 1000)

      botState.intervalId = intervalId
      console.log('✅ Interval set (may not persist in serverless - bot relies on health check)')
    } catch (error) {
      console.warn('⚠️  Could not set interval (this is normal in serverless):', error)
      // Bot will still work through health check mechanism
    }

    // Log bot start
    await supabase
      .from('bot_logs')
      .insert({
        user_id: userId,
        action: 'start',
        message: `Bot started with symbols: ${config.symbols.join(', ')}`,
        config: config
      })

    // Verify the state was saved correctly before returning
    const { data: verifyState, error: verifyError } = await supabase.rpc('get_bot_state', {
      user_uuid: userId
    })
    
    if (verifyError) {
      console.error('⚠️ Error verifying bot state:', verifyError)
    } else {
      const verifiedRunning = verifyState?.[0]?.is_running
      console.log(`✅ Trading bot started for user ${userId} with symbols: ${config.symbols.join(', ')}`)
      console.log(`📊 Verified database state: is_running=${verifiedRunning}`)
      
      if (!verifiedRunning) {
        console.error('❌ WARNING: Bot state shows is_running=false after start!')
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Trading bot started successfully',
      config
    })

  } catch (error) {
    console.error('❌ Error starting bot:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    const errorStack = error instanceof Error ? error.stack : undefined
    console.error('Error details:', { 
      message: errorMessage, 
      stack: errorStack,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      fullError: error
    })
    
    // Update database to reflect error (with retry logic)
    try {
      let dbUpdateError = null
      const maxRetries = 2
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const result = await supabase.rpc('update_bot_state', {
          user_uuid: userId,
          is_running_param: false,
          config_param: null,
          error_param: errorMessage
        })
        
        dbUpdateError = result.error
        
        if (!dbUpdateError) {
          break // Success
        }
        
        if (dbUpdateError?.message?.includes('fetch failed') && attempt < maxRetries) {
          console.warn(`⚠️ Retry ${attempt}/${maxRetries} for update_bot_state on error`)
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt))
          continue
        }
        
        break
      }
      
      if (dbUpdateError) {
        console.error('Error updating bot state on failure:', dbUpdateError)
      }
    } catch (dbError) {
      console.error('Error updating bot state on failure (catch block):', dbError)
    }
    
    // Return detailed error for debugging, but sanitize sensitive info
    const sanitizedError = errorMessage.includes('fetch failed') 
      ? 'Database connection failed. Please check your Supabase configuration.'
      : errorMessage
    
    return NextResponse.json({ 
      success: false, 
      error: `Failed to start trading bot: ${sanitizedError}` 
    }, { status: 500 })
  }
}

// Stop the trading bot
async function stopBot(supabase: any, userId: string): Promise<NextResponse> {
  try {
    if (botState.intervalId) {
      clearInterval(botState.intervalId)
      botState.intervalId = null
      botState.userId = null
    }

    // Update bot state in database
    await supabase.rpc('update_bot_state', {
      user_uuid: userId,
      is_running_param: false,
      config_param: null,
      error_param: null
    })

    // Log bot stop
    await supabase
      .from('bot_logs')
      .insert({
        user_id: userId,
        action: 'stop',
        message: 'Bot stopped by user'
      })

    console.log(`Trading bot stopped for user ${userId}`)

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
export async function executeTradingLoop(supabase: any, userId: string, config: BotConfig, apiKeys: any) {
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

    // Check if market is open (applies to both paper and live trading)
    if (!isMarketOpen()) {
      console.log('⏸️  Market is closed, skipping trading execution but continuing bot operation')
      // Update bot state to show it's running but market is closed
      await supabase.rpc('update_bot_state', {
        user_uuid: userId,
        is_running_param: true,
        config_param: config,
        error_param: null
      })
      
      // Log the execution even when market is closed (so diagnostics can show activity)
      let logError = null
      try {
        const { error } = await supabase
          .from('bot_logs')
          .insert({
            user_id: userId,
            action: 'execute',
            message: 'Trading loop executed - market is closed',
            data: {
              market_open: false,
              diagnostics: {
                min_confidence_threshold: 0.55,
                market_risk: 0.3,
                total_ml_signals: 0,
                buy_signals_before_filter: 0,
                sell_signals_before_filter: 0,
                final_buy_signals: 0,
                final_sell_signals: 0,
                allocated_buy_signals: 0,
                executed_signals: 0,
                market_open: false,
                in_last_30_minutes: false
              }
            }
          })
        logError = error
        
        // If direct insert fails, try using the security definer function
        if (logError) {
          console.warn('⚠️  Direct insert failed, trying security definer function:', logError.message)
          const { error: rpcError } = await supabase.rpc('insert_bot_log', {
            user_uuid: userId,
            action_param: 'execute',
            message_param: 'Trading loop executed - market is closed',
            data_param: {
              market_open: false,
              diagnostics: {
                min_confidence_threshold: 0.55,
                market_risk: 0.3,
                total_ml_signals: 0,
                buy_signals_before_filter: 0,
                sell_signals_before_filter: 0,
                final_buy_signals: 0,
                final_sell_signals: 0,
                allocated_buy_signals: 0,
                executed_signals: 0,
                market_open: false,
                in_last_30_minutes: false
              }
            }
          })
          if (rpcError) {
            console.error('❌ Error writing bot_logs via RPC (market closed):', rpcError)
            logError = rpcError
          } else {
            console.log('✅ Bot log written via RPC (market closed)')
            logError = null
          }
        } else {
          console.log('✅ Bot log written (market closed)')
        }
      } catch (err: any) {
        console.error('❌ Exception writing bot_logs (market closed):', err)
        logError = err
      }
      
      return
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
        
        console.log(`📊 Market Risk: ${(marketRisk * 100).toFixed(1)}% | Min Confidence Threshold: ${(minConfidence * 100).toFixed(1)}%`)
      } else {
        console.log('⚠️  FRED not initialized, using default risk parameters')
      }
    } catch (error) {
      console.warn('⚠️  Could not fetch FRED data:', error)
    }

    // STEP 2: Stock Selection (skip scanning to avoid rate limits)
    let scalpingStocks: string[] = []
    
    // TEMPORARY: Skip scanning to avoid Alpaca rate limits
    // The scanner makes too many API calls (2 per stock * 70 stocks = 140 requests)
    // This exceeds Alpaca's 200 requests/minute limit
    const ENABLE_SCANNING = process.env.ENABLE_STOCK_SCANNING === 'true'
    
    if (ENABLE_SCANNING) {
      try {
        console.log('🔍 Scanning universe for best scalping candidates...')
        
        // Use a timeout for scanning to prevent hanging
        const scanPromise = (async () => {
          const scanner = new StockScanner(alpacaClient)
          return await scanner.getTopScalpingStocks(15) // Reduced from 20
        })()
        
        const timeoutPromise = new Promise<string[]>((_, reject) => 
          setTimeout(() => reject(new Error('Scanning timeout')), 20000)
        )
        
        scalpingStocks = await Promise.race([scanPromise, timeoutPromise])
        
        if (scalpingStocks.length === 0) {
          console.log('⚠️  No candidates found, using default stocks')
          scalpingStocks = getDefaultScalpingStocks()
        } else {
          console.log(`✅ Scanning complete: ${scalpingStocks.length} candidates selected`)
        }
      } catch (error) {
        console.warn('⚠️  Stock scanning failed, using default stocks:', error)
        scalpingStocks = getDefaultScalpingStocks()
      }
    } else {
      console.log('📋 Using curated default stocks (scanning disabled to avoid rate limits)')
      scalpingStocks = getDefaultScalpingStocks()
    }
    
    console.log(`📊 Trading ${scalpingStocks.length} stocks: ${scalpingStocks.join(', ')}`)

    // STEP 3: Get Technical Indicators (call handler directly with error handling)
    console.log(`📈 Fetching technical indicators for ${scalpingStocks.length} symbols...`)
    let indicatorsData: any
    
    try {
      const { POST: getIndicators } = await import('@/app/api/stocks/indicators/route')
      const indicatorsReq = new NextRequest('http://localhost/api/stocks/indicators', {
        method: 'POST',
        body: JSON.stringify({ symbols: scalpingStocks })
      })
      const indicatorsRes = await getIndicators(indicatorsReq)
      indicatorsData = await indicatorsRes.json()
      
      console.log('📊 Indicators API response:', indicatorsData)
      
      if (!indicatorsData.success) {
        console.error('❌ Indicators API returned error:', indicatorsData.error)
        throw new Error(indicatorsData.error || 'Indicators API failed')
      }
      
      if (!indicatorsData.indicators || indicatorsData.indicators.length === 0) {
        console.error('❌ No indicators returned')
        if (indicatorsData.errors) {
          console.error('Indicator errors:', indicatorsData.errors)
        }
        throw new Error('No technical indicators available')
      }
      
      console.log(`✅ Technical indicators received for ${indicatorsData.indicators.length} symbols`)
      
      // Log any partial failures
      if (indicatorsData.errors && indicatorsData.errors.length > 0) {
        console.warn(`⚠️  Some symbols failed: ${indicatorsData.errors.join(', ')}`)
      }
    } catch (error: any) {
      console.error('❌ Failed to get technical indicators:', error)
      console.error('Error details:', {
        message: error.message,
        symbols: scalpingStocks,
        count: scalpingStocks.length
      })
      throw new Error(`Technical indicators failed: ${error.message}`)
    }

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

    // STEP 6: Get ML Predictions (call ML service directly with retry logic)
    console.log('🧠 Calling ML prediction service directly...')
    const ML_SERVICE_URL = (process.env.ML_SERVICE_URL || 'http://localhost:8080').replace(/\/$/, '')
    
    let mlData: any
    
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
    }))
    
    // Retry logic for ML service (handles cold starts)
    const maxRetries = 2
    let lastError: any
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 1) {
          console.log(`🔄 Retry attempt ${attempt}/${maxRetries} for ML service...`)
        }
        
        const mlResponse = await fetch(`${ML_SERVICE_URL}/predict`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            features: coreFeatures,
            include_probabilities: true
          }),
          signal: AbortSignal.timeout(30000) // Increased to 30 seconds for cold starts
        })
        
        if (!mlResponse.ok) {
          throw new Error(`ML service returned ${mlResponse.status}`)
        }
        
        mlData = await mlResponse.json()
        
        if (!mlData.success || !mlData.signals) {
          throw new Error('ML service did not return valid signals')
        }
        
        console.log(`✅ ML predictions received for ${mlData.signals.length} symbols (attempt ${attempt})`)
        break // Success, exit retry loop
        
      } catch (error: any) {
        lastError = error
        console.error(`❌ ML service attempt ${attempt} failed:`, error.message)
        
        if (attempt < maxRetries) {
          console.log(`⏳ Waiting 3 seconds before retry...`)
          await new Promise(resolve => setTimeout(resolve, 3000))
        }
      }
    }
    
    if (!mlData) {
      console.error('❌ All ML service attempts failed')
      throw new Error(`ML service unavailable after ${maxRetries} attempts: ${lastError?.message}`)
    }

    // STEP 7: Get Current Positions
    console.log('📊 Checking current positions...')
    const positions = await alpacaClient.getPositions()
    const currentHoldings = positions.map((p: any) => p.symbol)
    console.log(`📌 Currently holding ${currentHoldings.length} positions: ${currentHoldings.join(', ')}`)

    // Check if we're in the last 30 minutes of trading
    const inLast30Minutes = isInLast30Minutes()
    if (inLast30Minutes) {
      console.log('⏰ Last 30 minutes of trading detected - preventing new trades (existing positions will remain open)')
      
      // Log that we're in the closing window
      await supabase
        .from('bot_logs')
        .insert({
          user_id: userId,
          action: 'execute',
          message: 'Trading loop executed during last 30 minutes - no new trades allowed, existing positions remain open',
          data: {
            in_last_30_minutes: true,
            existing_positions: positions.length
          }
        })
      
      // Continue processing - we'll filter out buy signals but allow sell signals to execute
    }

    // STEP 8: Process ML Signals - Separate BUY and SELL
    console.log('═══════════════════════════════════════════════════════════')
    console.log('📊 DIAGNOSTICS: Signal Processing Analysis')
    console.log('═══════════════════════════════════════════════════════════')
    console.log(`📈 Market Status: ${isMarketOpen() ? 'OPEN' : 'CLOSED'}`)
    console.log(`⏰ In Last 30 Minutes: ${isInLast30Minutes() ? 'YES' : 'NO'}`)
    console.log(`🎯 Min Confidence Threshold: ${(minConfidence * 100).toFixed(1)}%`)
    console.log(`📊 Market Risk Level: ${(marketRisk * 100).toFixed(1)}%`)
    console.log(`💼 Current Positions: ${currentHoldings.length}`)
    
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

    console.log(`📥 Total ML Signals Received: ${allSignals.length}`)
    
    // Count signals by action
    const buyCount = allSignals.filter((s: any) => s.action === 'buy').length
    const sellCount = allSignals.filter((s: any) => s.action === 'sell').length
    const holdCount = allSignals.filter((s: any) => s.action === 'hold').length
    console.log(`   - BUY: ${buyCount} | SELL: ${sellCount} | HOLD: ${holdCount}`)
    
    // Count signals by confidence
    const highConfidence = allSignals.filter((s: any) => s.adjusted_confidence >= minConfidence).length
    const lowConfidence = allSignals.filter((s: any) => s.adjusted_confidence < minConfidence).length
    console.log(`   - High Confidence (≥${(minConfidence * 100).toFixed(1)}%): ${highConfidence}`)
    console.log(`   - Low Confidence (<${(minConfidence * 100).toFixed(1)}%): ${lowConfidence}`)
    
    // Count signals by position status
    const heldSignals = allSignals.filter((s: any) => s.is_held).length
    const notHeldSignals = allSignals.filter((s: any) => !s.is_held).length
    console.log(`   - For Held Positions: ${heldSignals} | For New Positions: ${notHeldSignals}`)

    // SELL signals: Only for positions we currently hold
    const sellSignalsBeforeFilter = allSignals.filter((s: any) => s.action === 'sell' && s.is_held)
    const sellSignals = sellSignalsBeforeFilter
      .filter((s: any) => s.adjusted_confidence >= minConfidence)
      .sort((a: any, b: any) => b.adjusted_confidence - a.adjusted_confidence)
    
    const sellFilteredByConfidence = sellSignalsBeforeFilter.length - sellSignals.length
    if (sellFilteredByConfidence > 0) {
      console.log(`⚠️  SELL signals filtered out (low confidence): ${sellFilteredByConfidence}`)
    }

    // BUY signals: Only for positions we don't hold
    const buySignalsBeforeFilter = allSignals.filter((s: any) => s.action === 'buy' && !s.is_held)
    let buySignals = buySignalsBeforeFilter
      .filter((s: any) => s.adjusted_confidence >= minConfidence)
      .sort((a: any, b: any) => b.adjusted_confidence - a.adjusted_confidence)
    
    const buyFilteredByConfidence = buySignalsBeforeFilter.length - buySignals.length
    if (buyFilteredByConfidence > 0) {
      console.log(`⚠️  BUY signals filtered out (low confidence): ${buyFilteredByConfidence}`)
    }
    
    // Track signals before time filter for diagnostics
    const buySignalsAfterConfidenceFilter = buySignals.length
    
    // Filter out buy signals in last 30 minutes (prevent new positions, but allow closing existing ones)
    if (isInLast30Minutes()) {
      const buySignalsBeforeTimeFilter = buySignals.length
      buySignals = []
      console.log(`⚠️  Last 30 minutes detected - filtered out ${buySignalsBeforeTimeFilter} BUY signal(s) to prevent new positions`)
      console.log('   Existing positions can still be closed via SELL signals')
    }

    console.log(`✅ Final Signal Counts:`)
    console.log(`   - SELL signals (ready to execute): ${sellSignals.length}`)
    console.log(`   - BUY signals (ready to execute): ${buySignals.length}`)
    console.log('═══════════════════════════════════════════════════════════')
    
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
    
    console.log(`💰 Available Buying Power: $${availableCash.toFixed(2)}`)
    const allocatedBuySignals = allocateCapital(buySignals, availableCash, marketRisk)
    
    if (buySignals.length > 0 && allocatedBuySignals.length < buySignals.length) {
      const skipped = buySignals.length - allocatedBuySignals.length
      console.log(`⚠️  ${skipped} BUY signal(s) skipped due to capital allocation limits`)
    }
    
    // Combine all signals: SELLs (already configured) + allocated BUYs
    signals = [...sellSignals, ...allocatedBuySignals]

    console.log('═══════════════════════════════════════════════════════════')
    console.log(`🎯 FINAL TRADE PLAN: ${signals.length} total (${sellSignals.length} sells, ${allocatedBuySignals.length} buys)`)
    if (signals.length === 0) {
      console.log('⚠️  NO TRADES TO EXECUTE - Reasons may include:')
      console.log('   - No signals met confidence threshold')
      console.log('   - No positions to sell')
      console.log('   - Insufficient capital for buy signals')
      console.log('   - Market conditions filtered out all signals')
    }
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

    // Log the trading loop execution with diagnostics
    const executedCount = signals.length
    
    // Calculate filtered signals details for diagnostics
    // Buy signals filtered by confidence (before time filter)
    const filteredBuySignalsByConfidence = buySignalsBeforeFilter.filter((s: any) => s.adjusted_confidence < minConfidence)
    // Buy signals that passed confidence but were filtered by time (if in last 30 min)
    const filteredBuySignalsByTime = isInLast30Minutes() 
      ? buySignalsBeforeFilter.filter((s: any) => s.adjusted_confidence >= minConfidence)
      : []
    const filteredBuySignals = [...filteredBuySignalsByConfidence, ...filteredBuySignalsByTime]
    
    const filteredSellSignals = sellSignalsBeforeFilter.filter((s: any) => s.adjusted_confidence < minConfidence)
    
    console.log('═══════════════════════════════════════════════════════════')
    console.log('📊 TRADING LOOP SUMMARY')
    console.log('═══════════════════════════════════════════════════════════')
    console.log(`✅ Signals to Execute: ${executedCount}`)
    console.log(`📈 Market Status: ${isMarketOpen() ? 'OPEN' : 'CLOSED'}`)
    console.log(`🎯 Confidence Threshold: ${(minConfidence * 100).toFixed(1)}%`)
    console.log(`💼 Positions Before: ${currentHoldings.length}`)
    if (filteredBuySignals.length > 0) {
      console.log(`⚠️  Filtered BUY signals (low confidence):`)
      filteredBuySignals.forEach((s: any) => {
        console.log(`   - ${s.symbol}: ${(s.confidence * 100).toFixed(1)}% base + ${(s.news_sentiment * 15).toFixed(1)}% sentiment = ${(s.adjusted_confidence * 100).toFixed(1)}% (need ${(minConfidence * 100).toFixed(1)}%)`)
      })
    }
    if (filteredSellSignals.length > 0) {
      console.log(`⚠️  Filtered SELL signals (low confidence):`)
      filteredSellSignals.forEach((s: any) => {
        console.log(`   - ${s.symbol}: ${(s.confidence * 100).toFixed(1)}% base + ${(s.news_sentiment * 15).toFixed(1)}% sentiment = ${(s.adjusted_confidence * 100).toFixed(1)}% (need ${(minConfidence * 100).toFixed(1)}%)`)
      })
    }
    console.log('═══════════════════════════════════════════════════════════')
    
    let logError = null
    try {
      const logData = {
        user_id: userId,
        action: 'execute',
        message: `Trading loop executed. Generated ${signals.length} signals for execution`,
        data: {
          symbols: scalpingStocks,
          signals: signals.map((s: any) => ({
            symbol: s.symbol,
            action: s.action,
            confidence: s.confidence,
            adjusted_confidence: s.adjusted_confidence,
            price: s.price,
            reasoning: s.reasoning,
            timestamp: s.timestamp
          })),
          filtered_signals: {
            buy: filteredBuySignals.map((s: any) => ({
              symbol: s.symbol,
              base_confidence: s.confidence,
              sentiment_boost: s.news_sentiment * 0.15,
              adjusted_confidence: s.adjusted_confidence,
              threshold: minConfidence,
              reason: s.adjusted_confidence < minConfidence 
                ? 'confidence_below_threshold' 
                : (isInLast30Minutes() ? 'last_30_minutes' : 'other')
            })),
            sell: filteredSellSignals.map((s: any) => ({
              symbol: s.symbol,
              base_confidence: s.confidence,
              sentiment_boost: s.news_sentiment * 0.15,
              adjusted_confidence: s.adjusted_confidence,
              threshold: minConfidence,
              reason: s.adjusted_confidence < minConfidence ? 'confidence_below_threshold' : 'other'
            }))
          },
          diagnostics: {
            min_confidence_threshold: minConfidence,
            market_risk: marketRisk,
            total_ml_signals: allSignals.length,
            buy_signals_before_filter: buySignalsBeforeFilter.length,
            sell_signals_before_filter: sellSignalsBeforeFilter.length,
            final_buy_signals: buySignals.length,
            final_sell_signals: sellSignals.length,
            allocated_buy_signals: allocatedBuySignals.length,
            executed_signals: executedCount,
            market_open: isMarketOpen(),
            in_last_30_minutes: isInLast30Minutes(),
            filtered_buy_count: filteredBuySignals.length,
            filtered_sell_count: filteredSellSignals.length
          }
        }
      }
      
      const { error } = await supabase
        .from('bot_logs')
        .insert(logData)
      logError = error
      
      // If direct insert fails, try using the security definer function
      if (logError) {
        console.warn('⚠️  Direct insert failed, trying security definer function:', logError.message)
        const { error: rpcError } = await supabase.rpc('insert_bot_log', {
          user_uuid: userId,
          action_param: 'execute',
          message_param: logData.message,
          data_param: logData.data
        })
        if (rpcError) {
          console.error('❌ Error writing bot_logs via RPC (trading loop):', rpcError)
          console.error('Log error details:', {
            code: rpcError.code,
            message: rpcError.message,
            details: rpcError.details,
            hint: rpcError.hint
          })
          logError = rpcError
        } else {
          console.log('✅ Bot log written via RPC (trading loop executed)')
          logError = null
        }
      } else {
        console.log('✅ Bot log written (trading loop executed)')
      }
    } catch (err: any) {
      console.error('❌ Exception writing bot_logs (trading loop):', err)
      logError = err
    }

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

// Close all open positions (used during last 30 minutes of trading)
async function closeAllPositions(
  supabase: any,
  userId: string,
  alpacaClient: any,
  config: BotConfig
): Promise<void> {
  try {
    console.log('═══════════════════════════════════════════════════════════')
    console.log('🔚 CLOSING ALL POSITIONS (Last 30 minutes of trading)')
    console.log('═══════════════════════════════════════════════════════════')
    
    // Get all current positions
    const positions = await alpacaClient.getPositions()
    
    if (!positions || positions.length === 0) {
      console.log('✅ No open positions to close')
      return
    }
    
    console.log(`📊 Found ${positions.length} open position(s) to close`)
    
    // Close each position
    for (const position of positions) {
      try {
        const symbol = position.symbol
        const qty = Math.abs(parseInt(position.qty))
        const currentPrice = parseFloat(position.current_price || position.market_value / qty)
        
        console.log(`📉 Closing position: ${symbol} - ${qty} shares @ ~$${currentPrice.toFixed(2)}`)
        
        // Place market sell order to close position
        const order = await alpacaClient.placeMarketOrder(
          symbol,
          qty,
          'sell',
          'day'
        )
        
        console.log(`✅ Close order placed for ${symbol}: Order ID ${order.id}, Status: ${order.status}`)
        
        // Log the trade
        const { error: tradeError } = await supabase
          .from('trades')
          .insert({
            user_id: userId,
            symbol: symbol,
            action: 'sell',
            qty: qty,
            price: currentPrice,
            trade_timestamp: new Date().toISOString(),
            strategy: config.strategy,
            account_type: config.accountType,
            alpaca_order_id: order.id,
            order_status: order.status,
            confidence: 1.0, // Force close, so confidence is 100%
            reasoning: 'Position closed due to market close window (last 30 minutes)'
          })
        
        if (tradeError) {
          console.error(`Error logging close trade for ${symbol}:`, tradeError)
        }
        
        // Update trade_logs
        const { error: closeError } = await supabase.rpc('close_trade_position', {
          user_uuid: userId,
          symbol_param: symbol,
          sell_qty: qty,
          sell_price_param: currentPrice,
          sell_metrics: {
            confidence: 1.0,
            reasoning: 'Position closed due to market close window (last 30 minutes)',
            timestamp: new Date().toISOString(),
            alpaca_order_id: order.id,
            order_status: order.status
          }
        })
        
        if (closeError) {
          console.error(`Error closing trade in trade_logs for ${symbol}:`, closeError)
        }
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100))
        
      } catch (error) {
        console.error(`Error closing position ${position.symbol}:`, error)
        // Continue with other positions even if one fails
      }
    }
    
    console.log(`✅ Finished closing ${positions.length} position(s)`)
    
  } catch (error) {
    console.error('Error in closeAllPositions:', error)
    throw error
  }
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

    // Market hours check is handled at the main loop level
    // Individual trades will only be executed when market is open

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

    // Log the trade (legacy trades table)
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

    // Log to trade_logs with comprehensive decision metrics
    const decisionMetrics = {
      confidence: signal.confidence,
      adjusted_confidence: signal.adjusted_confidence,
      reasoning: signal.reasoning,
      news_sentiment: signal.news_sentiment,
      news_headlines: signal.news_headlines,
      market_risk: signal.market_risk || 0,
      price: signal.price,
      timestamp: new Date().toISOString(),
      alpaca_order_id: order.id,
      order_status: order.status
    }

    if (signal.action === 'buy') {
      // Create new trade log entry for buy
      const { error: logError } = await supabase
        .from('trade_logs')
        .insert({
          user_id: userId,
          symbol: signal.symbol,
          action: 'buy',
          qty: positionSize,
          price: signal.price,
          total_value: positionSize * signal.price,
          timestamp: new Date().toISOString(),
          status: 'open',
          buy_timestamp: new Date().toISOString(),
          buy_price: signal.price,
          buy_decision_metrics: decisionMetrics,
          strategy: config.strategy,
          account_type: config.accountType,
          alpaca_order_id: order.id,
          order_status: order.status
        })

      if (logError) {
        console.error('Error logging to trade_logs:', logError)
      }
    } else if (signal.action === 'sell') {
      // Update existing trade log entry for sell
      const { error: closeError } = await supabase.rpc('close_trade_position', {
        user_uuid: userId,
        symbol_param: signal.symbol,
        sell_qty: positionSize,
        sell_price_param: signal.price,
        sell_metrics: decisionMetrics
      })

      if (closeError) {
        console.error('Error closing trade in trade_logs:', closeError)
      }
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
    // Get bot state from database with retry logic
    let botStateData = null
    let botStateError = null
    const maxRetries = 3
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const result = await supabase.rpc('get_bot_state', {
        user_uuid: userId
      })
      
      botStateData = result.data
      botStateError = result.error
      
      if (!botStateError) {
        break // Success, exit retry loop
      }
      
      // If it's a network error and we have retries left, wait and retry
      if (botStateError?.message?.includes('fetch failed') && attempt < maxRetries) {
        console.warn(`⚠️ Retry ${attempt}/${maxRetries} for get_bot_state after network error`)
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt)) // Exponential backoff
        continue
      }
      
      break // Either not a network error or out of retries
    }

    if (botStateError) {
      console.error('Error getting bot state after retries:', botStateError)
    }

    const dbBotState = botStateData?.[0] || {
      is_running: false,
      config: null,
      last_run: null,
      error: null,
      always_on: false
    }

    console.log('📊 getBotStatus:', { 
      userId, 
      is_running: dbBotState.is_running, 
      hasConfig: !!dbBotState.config,
      last_run: dbBotState.last_run,
      error: dbBotState.error 
    })

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
    if (dbBotState.is_running && dbBotState.last_run) {
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

    // Add market hours information
    const marketOpen = isMarketOpen()
    const nextMarketOpen = getNextMarketOpen()
    
    return {
      isRunning: dbBotState.is_running,
      lastRun: dbBotState.last_run || null,
      totalTrades: trades?.length || 0,
      activePositions: positions?.length || 0,
      currentSignals,
      error: dbBotState.error || undefined,
      marketOpen,
      nextMarketOpen: nextMarketOpen.toISOString(),
      alwaysOn: dbBotState.always_on || false
    }

  } catch (error) {
    console.error('Error getting bot status:', error)
    return {
      isRunning: false,
      lastRun: null,
      totalTrades: 0,
      activePositions: 0,
      currentSignals: [],
      error: 'Failed to get bot status',
      marketOpen: false,
      nextMarketOpen: getNextMarketOpen().toISOString(),
      alwaysOn: false
    }
  }
}

// Toggle always-on mode
async function toggleAlwaysOn(supabase: any, userId: string, alwaysOn: boolean): Promise<NextResponse> {
  try {
    console.log('🔄 toggleAlwaysOn called:', { userId, alwaysOn })
    
    // Update always_on in database
    let { data, error } = await supabase.rpc('toggle_always_on', {
      user_uuid: userId,
      always_on_param: alwaysOn
    })

    // If RPC function doesn't exist or fails, try direct update as fallback
    if (error) {
      console.warn('⚠️ RPC toggle_always_on failed, trying direct update:', {
        error: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint
      })
      
      // Try direct update/insert as fallback
      const { data: existingState, error: selectError } = await supabase
        .from('bot_state')
        .select('user_id, always_on')
        .eq('user_id', userId)
        .maybeSingle()
      
      if (selectError && selectError.code !== 'PGRST116') {
        // PGRST116 = no rows found, which is fine
        console.error('Error checking existing state:', selectError)
        return NextResponse.json({ 
          success: false, 
          error: `Failed to check bot state: ${selectError.message || 'Database query failed'}` 
        }, { status: 500 })
      }
      
      if (existingState) {
        // Update existing row
        const { error: updateError } = await supabase
          .from('bot_state')
          .update({ always_on: alwaysOn, updated_at: new Date().toISOString() })
          .eq('user_id', userId)
        
        if (updateError) {
          console.error('❌ Error updating always-on directly:', updateError)
          return NextResponse.json({ 
            success: false, 
            error: `Failed to toggle always-on mode: ${updateError.message || 'Database update failed'}` 
          }, { status: 500 })
        }
        console.log('✅ Always-on updated using direct update method')
      } else {
        // Insert new row
        const { error: insertError } = await supabase
          .from('bot_state')
          .insert({ 
            user_id: userId, 
            always_on: alwaysOn, 
            is_running: false,
            updated_at: new Date().toISOString() 
          })
        
        if (insertError) {
          console.error('❌ Error inserting always-on directly:', insertError)
          return NextResponse.json({ 
            success: false, 
            error: `Failed to toggle always-on mode: ${insertError.message || 'Database insert failed'}` 
          }, { status: 500 })
        }
        console.log('✅ Always-on inserted using direct insert method')
      }
    } else {
      // Verify the function executed successfully
      if (data === false) {
        console.warn('⚠️ toggle_always_on returned false')
      } else {
        console.log('✅ Always-on toggled using RPC function')
      }
    }

    // If enabling always-on and market is open, try to start the bot if it has a config
    // Note: In serverless, we can't check botState.intervalId, so we check is_running instead
    if (alwaysOn && isMarketOpen()) {
      try {
        const { data: botStateData } = await supabase.rpc('get_bot_state', {
          user_uuid: userId
        })

        const dbBotState = botStateData?.[0]
        if (dbBotState?.config && !dbBotState.is_running) {
          console.log('🔄 Always-on enabled and market is open - attempting to start bot...')
          try {
            await startBot(supabase, userId, dbBotState.config as BotConfig)
          } catch (error) {
            console.error('⚠️ Error auto-starting bot (non-critical):', error)
            // Don't fail the toggle if auto-start fails
          }
        }
      } catch (error) {
        console.warn('⚠️ Error checking bot state for auto-start (non-critical):', error)
        // Don't fail the toggle if this check fails
      }
    }

    // Log the toggle (don't fail if this fails)
    try {
      await supabase
        .from('bot_logs')
        .insert({
          user_id: userId,
          action: alwaysOn ? 'always_on_enabled' : 'always_on_disabled',
          message: `Always-on mode ${alwaysOn ? 'enabled' : 'disabled'}`
        })
    } catch (logError) {
      console.warn('Failed to log always-on toggle (non-critical):', logError)
      // Don't fail the toggle if logging fails
    }

    // Verify the current state in database to ensure it was updated
    const { data: verifyState } = await supabase.rpc('get_bot_state', {
      user_uuid: userId
    })
    const verifiedAlwaysOn = verifyState?.[0]?.always_on ?? alwaysOn
    
    console.log('✅ Always-on toggle complete:', { 
      requested: alwaysOn, 
      verified: verifiedAlwaysOn,
      userId 
    })

    return NextResponse.json({
      success: true,
      message: `Always-on mode ${verifiedAlwaysOn ? 'enabled' : 'disabled'}`,
      alwaysOn: verifiedAlwaysOn // Return the verified value from database
    })

  } catch (error) {
    console.error('Error in toggleAlwaysOn:', error)
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to toggle always-on mode' 
    }, { status: 500 })
  }
}