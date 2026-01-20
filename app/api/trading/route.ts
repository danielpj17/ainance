export const runtime = 'nodejs'
// Increase timeout for Vercel Pro plan (Hobby plan has 10s limit)
export const maxDuration = 30
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, getDemoUserIdServer, getUserIdFromRequest, getAlpacaKeysForUser } from '@/utils/supabase/server'
import { tradingModel, TradingSignal, TradingSettings } from '@/lib/trading-model'
import { createAlpacaClient, getAlpacaKeys } from '@/lib/alpaca-client'
import { initializeNewsAnalyzer, getNewsAnalyzer } from '@/lib/news-sentiment'
import { TradingErrorHandler, withRetry } from '@/lib/error-handler'
import { isDemoMode } from '@/lib/demo-user'
import { initializeFRED, isFREDInitialized } from '@/lib/fred-data'
import { StockScanner, getDefaultScalpingStocks } from '@/lib/stock-scanner'
import { createAlgorithm, AlgorithmType } from '@/lib/trading-algorithms'

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
  config?: BotConfig | null
}

export interface BotConfig {
  symbols: string[]
  interval: number // seconds
  settings: TradingSettings
  accountType: string
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
    
    // Get user ID from request cookies (strict: demo keys only for demo user)
    let userId: string
    let isDemo: boolean
    try {
      const userInfo = await getUserIdFromRequest(req)
      userId = userInfo.userId
      isDemo = userInfo.isDemo
      console.log('📥 POST /api/trading - User detected:', { userId, isDemo })
    } catch (authError: any) {
      console.error('Error getting user:', authError)
      // On error, fall back to demo mode instead of failing
      userId = getDemoUserIdServer()
      isDemo = true
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

    const { action, config, alwaysOn, account_id }: { action: 'start' | 'stop' | 'toggle-always-on', config?: BotConfig, alwaysOn?: boolean, account_id?: string } = body

    console.log('📥 POST /api/trading:', { action, hasConfig: !!config, configKeys: config ? Object.keys(config) : [], account_id })

    if (action === 'start') {
      if (!config) {
        console.error('❌ No config provided for start action')
        return NextResponse.json({ 
          success: false, 
          error: 'Configuration is required to start the bot' 
        }, { status: 400 })
      }
      console.log('🚀 Starting bot with config:', { symbols: config.symbols, interval: config.interval, account_id })
      return await startBot(supabase, userId, config, account_id)
    } else if (action === 'stop') {
      return await stopBot(supabase, userId, account_id)
    } else if (action === 'toggle-always-on') {
      if (alwaysOn === undefined) {
        return NextResponse.json({ 
          success: false, 
          error: 'Missing required parameter: alwaysOn' 
        }, { status: 400 })
      }
      return await toggleAlwaysOn(supabase, userId, alwaysOn, account_id)
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
    
    // Get user ID from request cookies (strict: demo keys only for demo user)
    const { userId, isDemo } = await getUserIdFromRequest(req)
    console.log('📥 GET /api/trading - User detected:', { userId, isDemo })

    // Get account_id from query params if provided
    const { searchParams } = new URL(req.url)
    const account_id = searchParams.get('account_id') || undefined

    const status = await getBotStatus(supabase, userId, account_id)

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
export async function startBot(supabase: any, userId: string, config: BotConfig, accountId?: string): Promise<NextResponse> {
  try {
    console.log('🚀 startBot called:', { userId, accountId, symbols: config?.symbols, interval: config?.interval })
    
    // Stop existing bot if running
    if (botState.intervalId) {
      console.log('⏹️  Stopping existing bot before starting new one')
      await stopBot(supabase, userId, accountId)
    }

    // Validate configuration exists
    // Note: symbols array can be empty - the stock scanner will populate it during execution
    if (!config) {
      console.error('❌ Invalid config: config object is null or undefined')
      return NextResponse.json({ 
        success: false, 
        error: 'Invalid bot configuration' 
      }, { status: 400 })
    }
    
    // Initialize symbols array if not provided
    if (!config.symbols) {
      config.symbols = []
      console.log('📝 Symbols array not provided, will be populated by stock scanner')
    } else if (config.symbols.length > 0) {
      console.log(`📋 Starting with ${config.symbols.length} predefined symbols: ${config.symbols.join(', ')}`)
    } else {
      console.log('📝 Symbols array empty, will be populated by stock scanner')
    }

    // Verify user exists in auth.users (skip for demo mode)
    const isDemo = userId === '00000000-0000-0000-0000-000000000000'
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

    // Get Alpaca credentials - prioritize user-specific keys from database
    // For authenticated users: use their saved keys
    // For demo mode: fallback to environment variables
    // News API key is always shared from environment (not user-specific)
    let alpacaApiKey: string | undefined;
    let alpacaSecretKey: string | undefined;
    const newsApiKey: string | undefined = process.env.NEWS_API_KEY; // Always use shared key
    
    // Get all user API keys from database (both paper and live)
    let userApiKeys: any = null
    
    // For authenticated users, always try database first (user-specific Alpaca keys only)
    if (!isDemo) {
      const { data: apiKeys, error: keysError } = await supabase.rpc('get_user_api_keys', {
        user_uuid: userId
      })

      if (!keysError && apiKeys?.[0]) {
        userApiKeys = apiKeys[0]
        // Set paper keys as default for initial check
        alpacaApiKey = userApiKeys.alpaca_paper_key;
        alpacaSecretKey = userApiKeys.alpaca_paper_secret;
        // Note: newsApiKey is always from environment, not user-specific
      }
    }
    
    // Only fallback to environment variables for demo user, not authenticated users
    if (!alpacaApiKey || !alpacaSecretKey) {
      if (isDemo) {
        // Demo mode - use environment variables
        alpacaApiKey = process.env.ALPACA_PAPER_KEY;
        alpacaSecretKey = process.env.ALPACA_PAPER_SECRET;
      }
    }

    // Final check to ensure Alpaca keys are available
    if (!alpacaApiKey || !alpacaSecretKey) {
      return NextResponse.json({ 
        success: false, 
        error: 'API keys not found. Please configure your Alpaca API keys in environment variables or database.' 
      }, { status: 400 })
    }

    // Create a keys object with both paper and live keys (for getAlpacaKeys function)
    const keys = {
      alpaca_paper_key: userApiKeys?.alpaca_paper_key || alpacaApiKey,
      alpaca_paper_secret: userApiKeys?.alpaca_paper_secret || alpacaSecretKey,
      alpaca_live_key: userApiKeys?.alpaca_live_key || process.env.ALPACA_LIVE_KEY || null,
      alpaca_live_secret: userApiKeys?.alpaca_live_secret || process.env.ALPACA_LIVE_SECRET || null,
      news_api_key: newsApiKey || null
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
    // Use account-level functions if accountId is provided, otherwise use user-level
    let currentAlwaysOn = false
    if (accountId) {
      const { data: currentState } = await supabase.rpc('get_account_bot_state', {
        account_uuid: accountId,
        user_uuid: userId
      })
      currentAlwaysOn = currentState?.[0]?.always_on || false
    } else {
      const { data: currentState } = await supabase.rpc('get_bot_state', {
        user_uuid: userId
      })
      currentAlwaysOn = currentState?.[0]?.always_on || false
    }

    // Store bot state in database - ensure it completes with retry logic
    let updateError = null
    const maxRetries = 3
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      let result
      if (accountId) {
        result = await supabase.rpc('update_account_bot_state', {
          account_uuid: accountId,
          user_uuid: userId,
          is_running_param: true,
          config_param: config,
          error_param: null,
          always_on_param: currentAlwaysOn
        })
      } else {
        result = await supabase.rpc('update_bot_state', {
          user_uuid: userId,
          is_running_param: true,
          config_param: config,
          error_param: null,
          always_on_param: currentAlwaysOn
        })
      }
      
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
      await executeTradingLoop(supabase, userId, config, keys, accountId)
      // Update last_run timestamp after successful execution
      if (accountId) {
        const { error: updateError } = await supabase.rpc('update_account_bot_state', {
          account_uuid: accountId,
          user_uuid: userId,
          is_running_param: true,
          config_param: config,
          error_param: null
        })
        if (updateError) {
          console.error('⚠️ Error updating last_run:', updateError)
        }
      } else {
        const { error: updateError } = await supabase.rpc('update_bot_state', {
          user_uuid: userId,
          is_running_param: true,
          config_param: config,
          error_param: null
        })
        if (updateError) {
          console.error('⚠️ Error updating last_run:', updateError)
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error('Initial trading loop error:', errorMessage)
      // Still mark as running, but with error
      if (accountId) {
        const { error: updateError } = await supabase.rpc('update_account_bot_state', {
          account_uuid: accountId,
          user_uuid: userId,
          is_running_param: true,
          config_param: config,
          error_param: errorMessage
        })
        if (updateError) {
          console.error('⚠️ Error updating bot state with error:', updateError)
        }
      } else {
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
            if (accountId) {
              await supabase.rpc('update_account_bot_state', {
                account_uuid: accountId,
                user_uuid: userId,
                is_running_param: true,
                config_param: config,
                error_param: null
              })
            } else {
              await supabase.rpc('update_bot_state', {
                user_uuid: userId,
                is_running_param: true,
                config_param: config,
                error_param: null
              })
            }
            return
          }
          
          // Execute trading loop
          await executeTradingLoop(supabase, userId, config, keys, accountId)
          
          // Update bot state after each execution
          if (accountId) {
            await supabase.rpc('update_account_bot_state', {
              account_uuid: accountId,
              user_uuid: userId,
              is_running_param: true,
              config_param: config,
              error_param: null
            })
          } else {
            await supabase.rpc('update_bot_state', {
              user_uuid: userId,
              is_running_param: true,
              config_param: config,
              error_param: null
            })
          }
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
          if (accountId) {
            await supabase.rpc('update_account_bot_state', {
              account_uuid: accountId,
              user_uuid: userId,
              is_running_param: true,
              config_param: config,
              error_param: errorMessage
            })
          } else {
            await supabase.rpc('update_bot_state', {
              user_uuid: userId,
              is_running_param: true,
              config_param: config,
              error_param: errorMessage
            })
          }
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
    let verifyState, verifyError
    if (accountId) {
      const result = await supabase.rpc('get_account_bot_state', {
        account_uuid: accountId,
        user_uuid: userId
      })
      verifyState = result.data
      verifyError = result.error
    } else {
      const result = await supabase.rpc('get_bot_state', {
        user_uuid: userId
      })
      verifyState = result.data
      verifyError = result.error
    }
    
    if (verifyError) {
      console.error('⚠️ Error verifying bot state:', verifyError)
    } else {
      const verifiedRunning = verifyState?.[0]?.is_running
      console.log(`✅ Trading bot started for user ${userId}${accountId ? ` (account: ${accountId})` : ''} with symbols: ${config.symbols.join(', ')}`)
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
        let result
        if (accountId) {
          result = await supabase.rpc('update_account_bot_state', {
            account_uuid: accountId,
            user_uuid: userId,
            is_running_param: false,
            config_param: null,
            error_param: errorMessage
          })
        } else {
          result = await supabase.rpc('update_bot_state', {
            user_uuid: userId,
            is_running_param: false,
            config_param: null,
            error_param: errorMessage
          })
        }
        
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
async function stopBot(supabase: any, userId: string, accountId?: string): Promise<NextResponse> {
  try {
    if (botState.intervalId) {
      clearInterval(botState.intervalId)
      botState.intervalId = null
      botState.userId = null
    }

    // Update bot state in database
    if (accountId) {
      await supabase.rpc('update_account_bot_state', {
        account_uuid: accountId,
        user_uuid: userId,
        is_running_param: false,
        config_param: null,
        error_param: null
      })
    } else {
      await supabase.rpc('update_bot_state', {
        user_uuid: userId,
        is_running_param: false,
        config_param: null,
        error_param: null
      })
    }

    // Log bot stop
    await supabase
      .from('bot_logs')
      .insert({
        user_id: userId,
        action: 'stop',
        message: `Bot stopped by user${accountId ? ` (account: ${accountId})` : ''}`
      })

    console.log(`Trading bot stopped for user ${userId}${accountId ? ` (account: ${accountId})` : ''}`)

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
export async function executeTradingLoop(supabase: any, userId: string, config: BotConfig, apiKeys: any, accountId?: string) {
  try {
    console.log('═══════════════════════════════════════════════════════════')
    console.log('🤖 STARTING ADVANCED SCALPING BOT CYCLE')
    console.log('═══════════════════════════════════════════════════════════')

    // Initialize Alpaca client
    // Determine if paper trading based on accountType ('paper' or 'live')
    const isPaper = config.accountType === 'paper'
    const alpacaKeys = getAlpacaKeys(apiKeys, isPaper)
    const alpacaClient = createAlpacaClient({
      apiKey: alpacaKeys.apiKey,
      secretKey: alpacaKeys.secretKey,
      baseUrl: alpacaKeys.paper ? 'https://paper-api.alpaca.markets' : 'https://api.alpaca.markets',
      paper: alpacaKeys.paper
    })

    await alpacaClient.initialize()
    console.log('✅ Alpaca client initialized (', alpacaKeys.paper ? 'PAPER' : 'LIVE', 'trading)')

    // Get confidence thresholds - prioritize per-account settings over global settings
    let baseConfidenceThreshold = 0.65 // Default for BUY
    let baseSellConfidenceThreshold = 0.50 // Default for SELL (lower for easier exits)
    let isShortSellingEnabled = false
    
    try {
      // If accountId is provided, try to get account-specific settings first
      if (accountId) {
        console.log(`🔍 Fetching account-specific strategy settings for account ${accountId}...`)
        const { data: accountSettings, error: accountError } = await supabase.rpc('get_account_strategy_settings', {
          account_uuid: accountId,
          user_uuid: userId
        })
        
        if (!accountError && accountSettings && accountSettings.length > 0) {
          const settings = accountSettings[0]
          if (settings.confidence_threshold !== null && settings.confidence_threshold !== undefined) {
            baseConfidenceThreshold = Number(settings.confidence_threshold)
            console.log(`✅ Using BUY confidence from account settings: ${(baseConfidenceThreshold * 100).toFixed(1)}%`)
          }
          if (settings.sell_confidence_threshold !== null && settings.sell_confidence_threshold !== undefined) {
            baseSellConfidenceThreshold = Number(settings.sell_confidence_threshold)
            console.log(`✅ Using SELL confidence from account settings: ${(baseSellConfidenceThreshold * 100).toFixed(1)}%`)
          }
          if (settings.is_short_selling_enabled !== null && settings.is_short_selling_enabled !== undefined) {
            isShortSellingEnabled = Boolean(settings.is_short_selling_enabled)
          }
        } else {
          console.log(`⚠️  No account-specific settings found, falling back to user settings`)
          // Fall through to user_settings below
        }
      }
      
      // If no account settings or no accountId, fall back to global user_settings
      if (!accountId || baseConfidenceThreshold === 0.65) {
        console.log(`🔍 Fetching global user settings for ${userId}...`)
        const { data: userSettings, error: settingsError } = await supabase
          .from('user_settings')
          .select('confidence_threshold, sell_confidence_threshold')
          .eq('user_id', userId)
          .single()
        
        if (!settingsError && userSettings) {
          if (userSettings.confidence_threshold !== null && userSettings.confidence_threshold !== undefined) {
            baseConfidenceThreshold = Number(userSettings.confidence_threshold)
            console.log(`✅ Using BUY confidence from user settings: ${(baseConfidenceThreshold * 100).toFixed(1)}%`)
          }
          if (userSettings.sell_confidence_threshold !== null && userSettings.sell_confidence_threshold !== undefined) {
            baseSellConfidenceThreshold = Number(userSettings.sell_confidence_threshold)
            console.log(`✅ Using SELL confidence from user settings: ${(baseSellConfidenceThreshold * 100).toFixed(1)}%`)
          }
        } else if (settingsError?.code !== 'PGRST116') {
          console.warn('⚠️  Error fetching user settings:', settingsError)
        }
      }
    } catch (error) {
      console.warn('⚠️  Could not fetch confidence thresholds, using defaults:', error)
    }
    
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/dcfcf856-6408-4731-a070-f14f4cce9c2e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'trading/route.ts:868',message:'Checking accountType for cash rules',data:{config_accountType:config.accountType,config_settings_account_type:config.settings?.account_type,isShortSellingEnabled_before:isShortSellingEnabled},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    if (config.accountType === 'cash') {
      isShortSellingEnabled = false
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/dcfcf856-6408-4731-a070-f14f4cce9c2e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'trading/route.ts:870',message:'Cash account detected - short selling disabled',data:{config_accountType:config.accountType},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
    } else {
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/dcfcf856-6408-4731-a070-f14f4cce9c2e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'trading/route.ts:873',message:'Non-cash account - short selling check skipped',data:{config_accountType:config.accountType},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
    }

    // Log the final values being used
    console.log(`📊 FINAL THRESHOLDS: BUY=${(baseConfidenceThreshold * 100).toFixed(1)}%, SELL=${(baseSellConfidenceThreshold * 100).toFixed(1)}%`)
    console.log(`   These thresholds apply to ALL algorithms (ML Model, Simple, Advanced)`)
    console.log(`📉 Short Selling: ${isShortSellingEnabled ? 'ENABLED' : 'DISABLED'} (${config.accountType.toUpperCase()} account)`)

    // STEP 2: Get FRED Economic Indicators (fetch even when market is closed for accurate diagnostics)
    let fredIndicators: any = null
    let marketRisk = 0.3 // Default moderate risk (fallback if FRED unavailable)
    let minConfidence = baseConfidenceThreshold // Start with user's setting for BUY
    let minConfidenceForSell = baseSellConfidenceThreshold // Separate threshold for SELL

    try {
      if (isFREDInitialized()) {
        const { getFREDService } = await import('@/lib/fred-data')
        const fredService = getFREDService()
        fredIndicators = await fredService.getIndicators()
        marketRisk = fredService.calculateMarketRisk(fredIndicators)
        
        // For BUY signals: Higher risk = higher threshold (be more selective)
        const riskAdjustment = marketRisk * 0.15
        minConfidence = Math.min(baseConfidenceThreshold + riskAdjustment, 1.0)
        
        // For SELL signals: Higher risk = lower threshold (sell more easily to protect capital)
        const sellRiskAdjustment = marketRisk * 0.15
        minConfidenceForSell = Math.max(baseSellConfidenceThreshold - sellRiskAdjustment, 0.0)
        
        console.log(`📊 Market Risk: ${(marketRisk * 100).toFixed(1)}% | Base Threshold: ${(baseConfidenceThreshold * 100).toFixed(1)}%`)
        console.log(`   BUY Threshold: ${(minConfidence * 100).toFixed(1)}% | SELL Threshold: ${(minConfidenceForSell * 100).toFixed(1)}%`)
        console.log(`📊 DIAGNOSTICS WILL SHOW: Market Risk=${(marketRisk * 100).toFixed(1)}%, Confidence=${(minConfidence * 100).toFixed(1)}%`)
      } else {
        console.log('⚠️  FRED not initialized (FRED_API_KEY not set or service not started)')
        console.log(`   Using default market risk: ${(marketRisk * 100).toFixed(1)}%`)
        console.log(`   Using base confidence threshold without risk adjustment: ${(baseConfidenceThreshold * 100).toFixed(1)}%`)
        minConfidence = baseConfidenceThreshold
        minConfidenceForSell = baseSellConfidenceThreshold
      }
    } catch (error) {
      console.warn('⚠️  Could not fetch FRED data, using defaults:', error)
      console.warn(`   Market Risk: ${(marketRisk * 100).toFixed(1)}% (default)`)
      console.warn(`   Confidence: ${(baseConfidenceThreshold * 100).toFixed(1)}% (from settings or default)`)
      minConfidence = baseConfidenceThreshold
      minConfidenceForSell = baseSellConfidenceThreshold
    }
    
    // Final verification - log what will be saved to diagnostics
    console.log('═══════════════════════════════════════════════════════════')
    console.log('📊 FINAL DIAGNOSTICS VALUES (what will be saved):')
    console.log(`   min_confidence_threshold: ${minConfidence} (${(minConfidence * 100).toFixed(1)}%)`)
    console.log(`   min_sell_confidence_threshold: ${minConfidenceForSell} (${(minConfidenceForSell * 100).toFixed(1)}%)`)
    console.log(`   market_risk: ${marketRisk} (${(marketRisk * 100).toFixed(1)}%)`)
    console.log('═══════════════════════════════════════════════════════════')

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
      // Use REAL values from FRED and user settings, not hardcoded values
      console.log(`📝 SAVING DIAGNOSTICS (market closed):`)
      console.log(`   - min_confidence_threshold: ${minConfidence} (${(minConfidence * 100).toFixed(1)}%)`)
      console.log(`   - min_sell_confidence_threshold: ${minConfidenceForSell} (${(minConfidenceForSell * 100).toFixed(1)}%)`)
      console.log(`   - market_risk: ${marketRisk} (${(marketRisk * 100).toFixed(1)}%)`)
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
                min_confidence_threshold: minConfidence,
                min_sell_confidence_threshold: minConfidenceForSell,
                market_risk: marketRisk,
                total_ml_signals: 0,
                buy_signals_before_filter: 0,
                sell_signals_before_filter: 0,
                final_buy_signals: 0,
                final_sell_signals: 0,
                allocated_buy_signals: 0,
                executed_signals: 0,
                market_open: false,
                in_last_30_minutes: false,
                filtered_buy_count: 0,
                filtered_sell_count: 0
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
                min_confidence_threshold: minConfidence,
                min_sell_confidence_threshold: minConfidenceForSell,
                market_risk: marketRisk,
                total_ml_signals: 0,
                buy_signals_before_filter: 0,
                sell_signals_before_filter: 0,
                final_buy_signals: 0,
                final_sell_signals: 0,
                allocated_buy_signals: 0,
                executed_signals: 0,
                market_open: false,
                in_last_30_minutes: false,
                filtered_buy_count: 0,
                filtered_sell_count: 0
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

    // STEP 3: Stock Selection (skip scanning to avoid rate limits)
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
    
    // STEP 8: Get Current Positions (moved earlier to include held positions in ML predictions)
    console.log('📊 Checking current positions...')
    const positions = await alpacaClient.getPositions()
    const currentHoldings = positions.map((p: any) => p.symbol)
    console.log(`📌 Currently holding ${currentHoldings.length} positions: ${currentHoldings.join(', ')}`)
    
    // Ensure all held positions are included in symbols for ML predictions (so we can get sell signals)
    const symbolsForML = Array.from(new Set([...scalpingStocks, ...currentHoldings]))
    if (symbolsForML.length > scalpingStocks.length) {
      const addedSymbols = symbolsForML.filter(s => !scalpingStocks.includes(s))
      console.log(`➕ Added ${addedSymbols.length} held position(s) to ML prediction list: ${addedSymbols.join(', ')}`)
    }
    
    console.log(`📊 Trading ${scalpingStocks.length} stocks, ${symbolsForML.length} total symbols for ML predictions: ${symbolsForML.join(', ')}`)

    // STEP 4: Get Technical Indicators (call handler directly with error handling)
    console.log(`📈 Fetching technical indicators for ${symbolsForML.length} symbols...`)
    let indicatorsData: any
    
    try {
      const { POST: getIndicators } = await import('@/app/api/stocks/indicators/route')
      const indicatorsReq = new NextRequest('http://localhost/api/stocks/indicators', {
        method: 'POST',
        body: JSON.stringify({ symbols: symbolsForML })
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
      
      console.log(`✅ Technical indicators received for ${indicatorsData.indicators.length} symbols (requested ${symbolsForML.length})`)
      
      // Log any partial failures
      if (indicatorsData.errors && indicatorsData.errors.length > 0) {
        console.warn(`⚠️  ${indicatorsData.errors.length} symbols failed to get indicators: ${indicatorsData.errors.join(', ')}`)
      }
      
      // Warn if we got fewer indicators than requested symbols
      if (indicatorsData.indicators.length < symbolsForML.length) {
        const indicatorSymbols = new Set(indicatorsData.indicators.map((ind: any) => ind.symbol))
        const missingSymbols = symbolsForML.filter(s => !indicatorSymbols.has(s))
        console.warn(`⚠️  Missing indicators for ${missingSymbols.length} symbols: ${missingSymbols.slice(0, 10).join(', ')}${missingSymbols.length > 10 ? ` ... and ${missingSymbols.length - 10} more` : ''}`)
      }
    } catch (error: any) {
      console.error('❌ Failed to get technical indicators:', error)
      console.error('Error details:', {
        message: error.message,
        symbols: symbolsForML,
        count: symbolsForML.length
      })
      throw new Error(`Technical indicators failed: ${error.message}`)
    }

    // STEP 5: Get News Sentiment
    let sentimentData: { [symbol: string]: any } = {}
    try {
      const newsAnalyzer = getNewsAnalyzer()
      console.log('📰 Fetching news sentiment...')
      sentimentData = await newsAnalyzer.getSentimentForSymbols(symbolsForML, 1)
      console.log(`✅ News sentiment received for ${Object.keys(sentimentData).length} symbols`)
    } catch (error) {
      console.warn('⚠️  News sentiment unavailable:', error)
    }

    // STEP 6: Enhance Features with News + FRED
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

    // STEP 7: Get Algorithm Type and Make Predictions
    // Fetch algorithm type from account strategy settings
    let algorithmType: AlgorithmType = 'ml_model' // Default to ML model
    
    if (accountId) {
      try {
        const { data: strategyData, error: strategyError } = await supabase.rpc('get_account_strategy_settings', {
          account_uuid: accountId,
          user_uuid: userId
        })
        
        if (!strategyError && strategyData && strategyData.length > 0) {
          algorithmType = strategyData[0].algorithm_type || 'ml_model'
          console.log(`🎯 Using algorithm type: ${algorithmType} for account ${accountId}`)
        } else {
          console.log(`⚠️  Could not fetch algorithm type, defaulting to ml_model`)
        }
      } catch (error) {
        console.warn('⚠️  Error fetching algorithm type, defaulting to ml_model:', error)
      }
    } else {
      console.log(`🎯 No account ID provided, using default algorithm: ${algorithmType}`)
    }
    
    console.log(`🧠 Calling ${algorithmType} algorithm...`)
    
    // Strip enhanced features before sending to algorithm
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
    
    console.log(`📤 Sending ${coreFeatures.length} features to ${algorithmType} algorithm (from ${enhancedFeatures.length} indicators)`)
    
    // Create algorithm instance and get predictions
    const algorithm = createAlgorithm(algorithmType, { 
      mlServiceUrl: process.env.ML_SERVICE_URL 
    })
    
    const algorithmResponse = await algorithm.predict(coreFeatures)
    
    if (!algorithmResponse.success) {
      console.error(`❌ ${algorithmType} algorithm failed:`, algorithmResponse.error)
      throw new Error(`${algorithmType} algorithm failed: ${algorithmResponse.error}`)
    }
    
    if (!algorithmResponse.signals || !Array.isArray(algorithmResponse.signals)) {
      console.error(`❌ ${algorithmType} algorithm returned invalid signals`)
      throw new Error(`${algorithmType} algorithm did not return valid signals array`)
    }
    
    console.log(`✅ ${algorithmType} predictions received: ${algorithmResponse.signals.length} signals for ${coreFeatures.length} features`)
    
    // Warn if we got fewer signals than features
    if (algorithmResponse.signals.length < coreFeatures.length) {
      console.warn(`⚠️  ${algorithmType} returned ${algorithmResponse.signals.length} signals but we sent ${coreFeatures.length} features (${coreFeatures.length - algorithmResponse.signals.length} missing)`)
      const returnedSymbols = new Set(algorithmResponse.signals.map((s: any) => s.symbol))
      const missingSymbols = coreFeatures.filter((f: any) => !returnedSymbols.has(f.symbol))
      if (missingSymbols.length > 0) {
        console.warn(`⚠️  Missing signals for: ${missingSymbols.slice(0, 10).map((f: any) => f.symbol).join(', ')}${missingSymbols.length > 10 ? ` ... and ${missingSymbols.length - 10} more` : ''}`)
      }
    }
    
    // Convert algorithm response to mlData format for compatibility with rest of code
    const mlData = {
      success: true,
      signals: algorithmResponse.signals,
      model_version: algorithmResponse.model_version || algorithmType,
      algorithm_type: algorithmType
    }

    // STEP 8: Current positions already retrieved above (moved earlier to include in ML predictions)

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

    // STEP 9: Process ML Signals - Separate BUY and SELL
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
        is_held: currentHoldings.includes(s.symbol),
        indicators: s.indicators || {},
        probabilities: s.probabilities || {}
      }
    })

    console.log(`📥 Total ML Signals Received: ${allSignals.length}`)
    
    // Count signals by action
    const buyCount = allSignals.filter((s: any) => s.action === 'buy').length
    const sellCount = allSignals.filter((s: any) => s.action === 'sell').length
    const holdCount = allSignals.filter((s: any) => s.action === 'hold').length
    console.log(`   - BUY: ${buyCount} | SELL: ${sellCount} | HOLD: ${holdCount}`)
    
    // Log which symbols got which action types (for debugging)
    if (buyCount > 0) {
      const buySymbols = allSignals.filter((s: any) => s.action === 'buy').map((s: any) => `${s.symbol}(${(s.adjusted_confidence * 100).toFixed(0)}%)`).join(', ')
      console.log(`   📈 BUY signals: ${buySymbols}`)
    }
    if (sellCount > 0) {
      const sellSymbols = allSignals.filter((s: any) => s.action === 'sell').map((s: any) => `${s.symbol}(${(s.adjusted_confidence * 100).toFixed(0)}%)`).join(', ')
      console.log(`   📉 SELL signals: ${sellSymbols}`)
    }
    if (holdCount > 0 && holdCount === allSignals.length) {
      console.log(`   ⚠️  ALL signals are HOLD - this means the ML model is not finding any trading opportunities`)
      console.log(`   💡 This is normal if market conditions are neutral or if the model is being conservative`)
    }
    
    // Count signals by confidence
    const highConfidence = allSignals.filter((s: any) => s.adjusted_confidence >= minConfidence).length
    const lowConfidence = allSignals.filter((s: any) => s.adjusted_confidence < minConfidence).length
    console.log(`   - High Confidence (≥${(minConfidence * 100).toFixed(1)}%): ${highConfidence}`)
    console.log(`   - Low Confidence (<${(minConfidence * 100).toFixed(1)}%): ${lowConfidence}`)
    
    // Count signals by position status
    const heldSignals = allSignals.filter((s: any) => s.is_held).length
    const notHeldSignals = allSignals.filter((s: any) => !s.is_held).length
    console.log(`   - For Held Positions: ${heldSignals} | For New Positions: ${notHeldSignals}`)

    const allowShortEntries = config.accountType === 'margin' && isShortSellingEnabled
    // SELL signals: positions we hold, plus optional short entries
    const sellSignalsBeforeFilter = allSignals.filter((s: any) => {
      if (s.action !== 'sell') return false
      if (s.is_held) return true
      return allowShortEntries
    })
    const sellSignals = sellSignalsBeforeFilter
      .filter((s: any) => s.adjusted_confidence >= minConfidenceForSell)
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

    // STEP 10: Process SELL Signals (exit existing positions)
    console.log('═══════════════════════════════════════════════════════════')
    console.log(`🔄 PROCESSING SELL SIGNALS: ${sellSignals.length} positions to exit`)
    console.log('═══════════════════════════════════════════════════════════')
    
    // Filter out sell signals that don't have valid positions
    const validSellSignals: any[] = []
    
    for (const sellSignal of sellSignals) {
      console.log(`📉 SELL ${sellSignal.symbol} @ $${sellSignal.price.toFixed(2)}`)
      console.log(`   Confidence: ${(sellSignal.adjusted_confidence * 100).toFixed(1)}%`)
      console.log(`   Reasoning: ${sellSignal.reasoning}`)

      if (sellSignal.is_held === false) {
        (sellSignal as any).shares = (sellSignal as any).shares || 1
        ;(sellSignal as any).allocated_capital = (sellSignal as any).allocated_capital || ((sellSignal as any).shares * sellSignal.price)
        console.log(`   Short entry: ${(sellSignal as any).shares} shares = $${(sellSignal as any).allocated_capital.toFixed(2)}`)
        validSellSignals.push(sellSignal)
        continue
      }

      // Get current position details
      const position = positions.find((p: any) => p.symbol === sellSignal.symbol)
      if (position) {
        (sellSignal as any).shares = Math.abs(parseInt(position.qty));
        (sellSignal as any).allocated_capital = Math.abs(parseFloat(position.market_value))
        console.log(`   Selling entire position: ${(sellSignal as any).shares} shares = $${(sellSignal as any).allocated_capital.toFixed(2)}`)
        validSellSignals.push(sellSignal)
      } else {
        // Position not found in Alpaca - try to get from trade_logs as fallback
        console.warn(`⚠️  Position for ${sellSignal.symbol} not found in Alpaca positions, checking trade_logs...`)
        try {
          const { data: tradeLog } = await supabase
            .from('trade_logs')
            .select('qty')
            .eq('user_id', userId)
            .eq('symbol', sellSignal.symbol)
            .eq('status', 'open')
            .eq('action', 'buy')
            .order('buy_timestamp', { ascending: false })
            .limit(1)
            .single()
          
          if (tradeLog && tradeLog.qty) {
            (sellSignal as any).shares = Math.abs(parseInt(tradeLog.qty));
            (sellSignal as any).allocated_capital = (sellSignal as any).shares * sellSignal.price
            console.log(`   Found position in trade_logs: ${(sellSignal as any).shares} shares = $${(sellSignal as any).allocated_capital.toFixed(2)}`)
            validSellSignals.push(sellSignal)
          } else {
            console.error(`❌ No open position found for ${sellSignal.symbol} in Alpaca or trade_logs - skipping sell signal`)
          }
        } catch (error) {
          console.error(`❌ Error checking trade_logs for ${sellSignal.symbol}:`, error)
        }
      }
    }
    
    // Update sellSignals array with only valid signals
    sellSignals.length = 0
    sellSignals.push(...validSellSignals)

    // STEP 11: Intelligent Capital Allocation for BUY Signals
    const account = await alpacaClient.getAccount()
    // For cash accounts, use true cash (equity - long_market_value) to prevent margin trading
    // For margin accounts, use buying power which includes margin
    const isCashAccount = config.accountType === 'cash'
    let availableCash = isCashAccount 
      ? parseFloat(account.equity) - parseFloat(account.long_market_value)  // True cash
      : parseFloat(account.buying_power)  // Margin buying power
    
    console.log('═══════════════════════════════════════════════════════════')
    console.log(`💰 ALLOCATING CAPITAL FOR BUY SIGNALS: ${buySignals.length} candidates`)
    console.log('═══════════════════════════════════════════════════════════')
    
    console.log(`💰 Account Type: ${isCashAccount ? 'CASH' : 'MARGIN'}`)
    console.log(`💰 Available ${isCashAccount ? 'Cash' : 'Buying Power'}: $${availableCash.toFixed(2)}`)
    const allocationResult = await allocateCapital(buySignals, availableCash, marketRisk, positions, config, supabase, userId)
    const allocatedBuySignals = allocationResult.signals
    const forcedSells = allocationResult.forcedSells || []
    
    // Process forced sells first (before regular sells)
    if (forcedSells.length > 0) {
      console.log('═══════════════════════════════════════════════════════════')
      console.log(`🔄 PROCESSING FORCED SELLS: ${forcedSells.length} position(s)`)
      console.log('═══════════════════════════════════════════════════════════')
      
      for (const forcedSell of forcedSells) {
        console.log(`📉 FORCED SELL ${forcedSell.symbol} @ $${forcedSell.price.toFixed(2)}`)
        console.log(`   Reason: ${forcedSell.reasoning}`)
        console.log(`   Making room for: ${forcedSell.replacement_symbol} (${(forcedSell.replacement_confidence * 100).toFixed(1)}% confidence)`)
        
        // Add to sellSignals (will be processed before buys)
        sellSignals.push(forcedSell)
      }
    }
    
    if (buySignals.length > 0 && allocatedBuySignals.length < buySignals.length) {
      const skipped = buySignals.length - allocatedBuySignals.length
      console.log(`⚠️  ${skipped} BUY signal(s) skipped due to capital allocation limits`)
    }
    
    // Combine all signals: SELLs (including forced) + allocated BUYs
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
          () => executeTradeSignal(supabase, userId, signal, alpacaClient, config, accountId),
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
    
    const filteredSellSignals = sellSignalsBeforeFilter.filter((s: any) => s.adjusted_confidence < minConfidenceForSell)
    
    console.log('═══════════════════════════════════════════════════════════')
    console.log('📊 TRADING LOOP SUMMARY')
    console.log('═══════════════════════════════════════════════════════════')
    console.log(`✅ Signals to Execute: ${executedCount}`)
    console.log(`📈 Market Status: ${isMarketOpen() ? 'OPEN' : 'CLOSED'}`)
    console.log(`🎯 Confidence Thresholds: BUY ${(minConfidence * 100).toFixed(1)}% | SELL ${(minConfidenceForSell * 100).toFixed(1)}%`)
    console.log(`📊 Market Risk: ${(marketRisk * 100).toFixed(1)}%`)
    console.log(`💼 Positions Before: ${currentHoldings.length}`)
    console.log(`📝 DIAGNOSTICS VALUES BEING SAVED:`)
    console.log(`   - min_confidence_threshold: ${minConfidence} (${(minConfidence * 100).toFixed(1)}%)`)
    console.log(`   - min_sell_confidence_threshold: ${minConfidenceForSell} (${(minConfidenceForSell * 100).toFixed(1)}%)`)
    console.log(`   - market_risk: ${marketRisk} (${(marketRisk * 100).toFixed(1)}%)`)
    if (filteredBuySignals.length > 0) {
      console.log(`⚠️  Filtered BUY signals (low confidence):`)
      filteredBuySignals.forEach((s: any) => {
        console.log(`   - ${s.symbol}: ${(s.confidence * 100).toFixed(1)}% base + ${(s.news_sentiment * 15).toFixed(1)}% sentiment = ${(s.adjusted_confidence * 100).toFixed(1)}% (need ${(minConfidence * 100).toFixed(1)}%)`)
      })
    }
    if (filteredSellSignals.length > 0) {
      console.log(`⚠️  Filtered SELL signals (low confidence):`)
      filteredSellSignals.forEach((s: any) => {
        console.log(`   - ${s.symbol}: ${(s.confidence * 100).toFixed(1)}% base + ${(s.news_sentiment * 15).toFixed(1)}% sentiment = ${(s.adjusted_confidence * 100).toFixed(1)}% (need ${(minConfidenceForSell * 100).toFixed(1)}%)`)
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
              threshold: minConfidenceForSell,
              reason: s.adjusted_confidence < minConfidenceForSell ? 'confidence_below_threshold' : 'other'
            }))
          },
          diagnostics: {
            min_confidence_threshold: minConfidence,
            min_sell_confidence_threshold: minConfidenceForSell,
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
            filtered_sell_count: filteredSellSignals.length,
            algorithm_type: algorithmType
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
 * Intelligent capital allocation with forced sell for high-confidence opportunities
 */
function allocateCapital(
  signals: any[], 
  availableCash: number, 
  marketRisk: number,
  currentPositions: any[],  // Current positions for forced sell comparison
  config: BotConfig,  // To get max_exposure setting
  supabase: any,  // To fetch position confidence from trade_logs
  userId: string  // To fetch position confidence from trade_logs
): Promise<{ signals: any[], forcedSells: any[] }> {
  return new Promise(async (resolve) => {
    console.log(`💰 Allocating capital: $${availableCash.toFixed(2)} available`)
    
    // Get max exposure from settings (default 90%)
    const maxExposurePct = (config.settings.max_exposure ?? 90) / 100
    
    // In high risk markets, reduce position sizes
    const riskAdjustment = 1 - (marketRisk * 0.5)
    const maxPositionPct = 0.15 * riskAdjustment // Max 15% per position, adjusted for risk
    const maxTotalExposure = maxExposurePct * riskAdjustment // Use configurable max exposure
    
    console.log(`   Risk Adjustment: ${(riskAdjustment * 100).toFixed(0)}%`)
    console.log(`   Max Per Position: ${(maxPositionPct * 100).toFixed(1)}%`)
    console.log(`   Max Total Exposure: ${(maxTotalExposure * 100).toFixed(1)}% (configurable, default 90%)`)
    
    const maxPositionSize = availableCash * maxPositionPct
    const maxTotalCash = availableCash * maxTotalExposure

    // Fetch confidence for current positions from trade_logs
    const positionConfidences: { [symbol: string]: number } = {}
    if (currentPositions.length > 0) {
      const positionSymbols = currentPositions.map(p => p.symbol)
      const { data: tradeLogs } = await supabase
        .from('trade_logs')
        .select('symbol, buy_decision_metrics')
        .eq('user_id', userId)
        .eq('status', 'open')
        .eq('action', 'buy')
        .in('symbol', positionSymbols)
      
      if (tradeLogs) {
        for (const log of tradeLogs) {
          const confidence = log.buy_decision_metrics?.adjusted_confidence || log.buy_decision_metrics?.confidence || 0.5
          positionConfidences[log.symbol] = confidence
        }
      }
    }

    let totalAllocated = 0
    const allocatedSignals = []
    const forcedSells: any[] = []

    for (const signal of signals) {
      const confidenceWeight = signal.adjusted_confidence || signal.confidence
      const baseAllocation = maxPositionSize * (confidenceWeight / 1.0)
      const positionValue = Math.min(baseAllocation, maxPositionSize)

      if (totalAllocated + positionValue > maxTotalCash) {
        // Check if this is a high-confidence opportunity worth forcing a sell
        if (confidenceWeight > 0.75) {
          console.log(`   🔥 High-confidence opportunity detected: ${signal.symbol} at ${(confidenceWeight * 100).toFixed(1)}%`)
          
          // Find lowest confidence position that could be replaced
          let replaceablePosition: any | null = null
          let lowestConfidence = 1.0
          
          for (const position of currentPositions) {
            const positionConfidence = positionConfidences[position.symbol] || 0.5
            
            // Criteria: position confidence < 65% AND new signal is 15%+ higher
            if (positionConfidence < 0.65 && (confidenceWeight - positionConfidence) >= 0.15) {
              if (positionConfidence < lowestConfidence) {
                lowestConfidence = positionConfidence
                replaceablePosition = position
              }
            }
          }
          
          if (replaceablePosition) {
            const replaceableConfidence = positionConfidences[replaceablePosition.symbol] || 0.5
            console.log(`   💡 Forcing sell of ${replaceablePosition.symbol} (${(replaceableConfidence * 100).toFixed(1)}%) to make room for ${signal.symbol} (${(confidenceWeight * 100).toFixed(1)}%)`)
            
            // Get position details for forced sell
            const positionValue = Math.abs(parseFloat(replaceablePosition.market_value || replaceablePosition.cost_basis || 0))
            const positionQty = Math.abs(parseInt(replaceablePosition.qty || 0))
            const positionPrice = parseFloat(replaceablePosition.current_price || replaceablePosition.market_value / positionQty || 0)
            
            forcedSells.push({
              symbol: replaceablePosition.symbol,
              confidence: replaceableConfidence,
              adjusted_confidence: replaceableConfidence,
              price: positionPrice,
              reasoning: `Forced sell to make room for higher-confidence opportunity (${signal.symbol} at ${(confidenceWeight * 100).toFixed(1)}%)`,
              shares: positionQty,
              allocated_capital: positionValue,
              is_forced_sell: true,
              replacement_symbol: signal.symbol,
              replacement_confidence: confidenceWeight
            })
            
            // Free up capital from the position we're going to sell
            totalAllocated = Math.max(0, totalAllocated - positionValue)
            console.log(`   💰 Freed $${positionValue.toFixed(2)} from ${replaceablePosition.symbol}, new available: $${(maxTotalCash - totalAllocated).toFixed(2)}`)
          } else {
            console.log(`   ⚠️  Capital limit reached, no suitable position to replace for ${signal.symbol}`)
            break
          }
        } else {
          console.log(`   ⚠️  Capital limit reached at ${totalAllocated.toFixed(2)}, skipping ${signal.symbol} (confidence: ${(confidenceWeight * 100).toFixed(1)}%)`)
          break
        }
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
    
    if (forcedSells.length > 0) {
      console.log(`   🔄 Forced sells triggered: ${forcedSells.map(p => `${p.symbol} (${(p.confidence * 100).toFixed(1)}%)`).join(', ')}`)
    }
    
    resolve({
      signals: allocatedSignals,
      forcedSells: forcedSells
    })
  })
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
  config: BotConfig,
  accountId?: string
) {
  try {
    // Use pre-allocated position size from capital allocation
    const positionSize = signal.shares || 1
    const totalCost = signal.allocated_capital || (positionSize * signal.price)

    console.log(`📝 Executing: ${signal.action.toUpperCase()} ${positionSize} shares of ${signal.symbol} @ $${signal.price.toFixed(2)} = $${totalCost.toFixed(2)}`)

    // Get account info for final validation
    const account = await alpacaClient.getAccount()
    const buyingPower = parseFloat(account.buying_power)
    
    // For cash accounts, use true cash (equity - long_market_value) to prevent margin trading
    // For margin accounts, use buying power which includes margin
    const isCashAccount = config.accountType === 'cash'
    const availableFunds = isCashAccount 
      ? parseFloat(account.equity) - parseFloat(account.long_market_value)  // True cash
      : buyingPower  // Margin buying power

    // Strictly disable shorting in cash accounts
    if (isCashAccount && signal.action === 'sell' && signal.is_held === false) {
      console.log(`❌ Shorting disabled in Cash account for ${signal.symbol}`)
      return
    }

    // For BUY orders, check available funds based on account type
    if (signal.action === 'buy') {
      if (totalCost > availableFunds) {
        console.log(`❌ Insufficient ${isCashAccount ? 'cash' : 'buying power'} for ${signal.symbol}: need $${totalCost.toFixed(2)}, have $${availableFunds.toFixed(2)}`)
        return
      }
      
      // Validate trade parameters
      const validation = TradingErrorHandler.validateTradeParams({
        symbol: signal.symbol,
        quantity: positionSize,
        price: signal.price,
        accountBalance: cash,
        buyingPower: availableFunds
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

    // Wait for order to fill and get actual execution price
    let actualPrice = signal.price // Fallback to signal price
    let orderFillTimestamp: string | null = null // Track when order was actually filled
    if (order && order.id) {
      console.log(`⏳ Waiting for order ${order.id} to fill...`)
      const filledPrice = await alpacaClient.waitForOrderFill(order.id, 10000) // Wait up to 10 seconds
      if (filledPrice && filledPrice > 0) {
        actualPrice = filledPrice
        console.log(`✅ Order filled at actual price: $${actualPrice.toFixed(4)} (signal price was $${signal.price.toFixed(4)})`)
      } else {
        // If order not filled yet, try to get current order status
        const orderStatus = await alpacaClient.getOrder(order.id)
        if (orderStatus && orderStatus.filled_avg_price && parseFloat(orderStatus.filled_avg_price) > 0) {
          actualPrice = parseFloat(orderStatus.filled_avg_price)
          console.log(`✅ Got filled price from order status: $${actualPrice.toFixed(4)}`)
        } else {
          console.warn(`⚠️  Could not get filled price for order ${order.id}, using signal price $${signal.price.toFixed(4)}`)
        }
      }
      
      // Get the final order status to retrieve the actual fill timestamp
      const finalOrderStatus = await alpacaClient.getOrder(order.id)
      if (finalOrderStatus) {
        // Use filled_at if available (when order is filled), otherwise use submitted_at (when order was placed)
        orderFillTimestamp = finalOrderStatus.filled_at || finalOrderStatus.submitted_at || finalOrderStatus.created_at || null
        if (orderFillTimestamp) {
          console.log(`📅 Order timestamp: ${orderFillTimestamp} (${finalOrderStatus.filled_at ? 'filled' : 'submitted'})`)
        }
      }
    }

    // Log the trade (legacy trades table)
    const { error: tradeError } = await supabase
      .from('trades')
      .insert({
        user_id: userId,
        symbol: signal.symbol,
        action: signal.action,
        qty: positionSize,
        price: actualPrice, // Use actual execution price
        trade_timestamp: new Date().toISOString(),
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
      price: signal.price, // Keep signal price in metrics for reference
      actual_execution_price: actualPrice, // Store actual execution price
      timestamp: new Date().toISOString(),
      alpaca_order_id: order.id,
      order_status: order.status,
      indicators: signal.indicators || {},
      probabilities: signal.probabilities || {},
      model_version: '2.0',
      sentiment_boost: signal.adjusted_confidence - signal.confidence
    }

    if (signal.action === 'buy') {
      // Get account name if accountId is provided
      let accountName: string | null = null
      if (accountId) {
        const { data: accountData } = await supabase
          .from('paper_trading_accounts')
          .select('account_name')
          .eq('id', accountId)
          .single()
        
        if (accountData) {
          accountName = accountData.account_name
        }
      }
      
      // Create new trade log entry for buy
      // Use the actual order fill timestamp from Alpaca, not the current time
      const tradeTimestamp = orderFillTimestamp || order.filled_at || order.submitted_at || order.created_at || new Date().toISOString()
      
      const { error: logError } = await supabase
        .from('trade_logs')
        .insert({
          user_id: userId,
          symbol: signal.symbol,
          action: 'buy',
          qty: positionSize,
          price: actualPrice, // Use actual execution price
          total_value: positionSize * actualPrice, // Use actual execution price
          timestamp: tradeTimestamp, // Use actual order fill/submit time from Alpaca
          status: 'open',
          buy_timestamp: tradeTimestamp, // Use actual order fill/submit time from Alpaca
          buy_price: actualPrice, // Use actual execution price
          buy_decision_metrics: decisionMetrics,
          account_type: config.accountType,
          alpaca_order_id: order.id,
          order_status: order.status,
          account_id: accountId || null,
          account_name: accountName
        })

      if (logError) {
        console.error('Error logging to trade_logs:', logError)
      }
    } else if (signal.action === 'sell') {
      // Use the actual order fill timestamp from Alpaca for the sell
      const sellTimestamp = orderFillTimestamp || order.filled_at || order.submitted_at || order.created_at || new Date().toISOString()
      
      // Update existing trade log entry for sell
      // Note: The close_trade_position function uses now() for sell_timestamp, but we should ideally pass the actual fill time
      // For now, we'll update it manually after closing to use the actual order fill time
      const { error: closeError } = await supabase.rpc('close_trade_position', {
        user_uuid: userId,
        symbol_param: signal.symbol,
        sell_qty: positionSize,
        sell_price_param: actualPrice, // Use actual execution price
        sell_metrics: decisionMetrics
      })
      
      // Update the sell_timestamp to use the actual order fill time instead of now()
      if (!closeError && orderFillTimestamp) {
        const { error: updateTimestampError } = await supabase
          .from('trade_logs')
          .update({ 
            sell_timestamp: sellTimestamp 
          })
          .eq('user_id', userId)
          .eq('symbol', signal.symbol)
          .eq('status', 'closed')
          .order('sell_timestamp', { ascending: false })
          .limit(1)
        
        if (updateTimestampError) {
          console.warn('Could not update sell_timestamp with actual fill time:', updateTimestampError)
        } else {
          console.log(`✅ Updated sell_timestamp to actual fill time: ${sellTimestamp}`)
        }
      }

      if (closeError) {
        console.error('Error closing trade in trade_logs:', closeError)
      }
    }

    console.log(`Trade executed: ${signal.action} ${positionSize} ${signal.symbol} @ $${actualPrice.toFixed(4)} (signal: $${signal.price.toFixed(4)})`)

  } catch (error) {
    console.error(`Error executing trade signal for ${signal.symbol}:`, error)
    throw error
  }
}

// Get bot status
async function getBotStatus(supabase: any, userId: string, accountId?: string): Promise<BotStatus> {
  try {
    // Get bot state from database with retry logic
    let botStateData = null
    let botStateError = null
    const maxRetries = 3
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      let result
      if (accountId) {
        result = await supabase.rpc('get_account_bot_state', {
          account_uuid: accountId,
          user_uuid: userId
        })
      } else {
        result = await supabase.rpc('get_bot_state', {
          user_uuid: userId
        })
      }
      
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
      alwaysOn: dbBotState.always_on || false,
      config: dbBotState.config || null
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
async function toggleAlwaysOn(supabase: any, userId: string, alwaysOn: boolean, accountId?: string): Promise<NextResponse> {
  try {
    console.log('🔄 toggleAlwaysOn called:', { userId, alwaysOn, accountId })
    
    // Update always_on in database
    let data, error
    if (accountId) {
      const result = await supabase.rpc('toggle_account_always_on', {
        account_uuid: accountId,
        user_uuid: userId,
        always_on_param: alwaysOn
      })
      data = result.data
      error = result.error
    } else {
      const result = await supabase.rpc('toggle_always_on', {
        user_uuid: userId,
        always_on_param: alwaysOn
      })
      data = result.data
      error = result.error
    }

    // If RPC function doesn't exist or fails, try direct update as fallback
    if (error) {
      console.warn('⚠️ RPC toggle_always_on failed, trying direct update:', {
        error: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint
      })
      
      // Try direct update/insert as fallback
      const tableName = accountId ? 'account_bot_state' : 'bot_state'
      const filterKey = accountId ? 'account_id' : 'user_id'
      const filterValue = accountId || userId
      
      const { data: existingState, error: selectError } = await supabase
        .from(tableName)
        .select(`${filterKey}, always_on`)
        .eq(filterKey, filterValue)
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
          .from(tableName)
          .update({ always_on: alwaysOn, updated_at: new Date().toISOString() })
          .eq(filterKey, filterValue)
        
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
        const insertData = accountId
          ? { account_id: accountId, user_id: userId, always_on: alwaysOn, is_running: false, updated_at: new Date().toISOString() }
          : { user_id: userId, always_on: alwaysOn, is_running: false, updated_at: new Date().toISOString() }
        
        const { error: insertError } = await supabase
          .from(tableName)
          .insert(insertData)
        
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
        let botStateData
        if (accountId) {
          const result = await supabase.rpc('get_account_bot_state', {
            account_uuid: accountId,
            user_uuid: userId
          })
          botStateData = result.data
        } else {
          const result = await supabase.rpc('get_bot_state', {
            user_uuid: userId
          })
          botStateData = result.data
        }

        const dbBotState = botStateData?.[0]
        if (dbBotState?.config && !dbBotState.is_running) {
          console.log('🔄 Always-on enabled and market is open - attempting to start bot...')
          try {
            await startBot(supabase, userId, dbBotState.config as BotConfig, accountId)
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