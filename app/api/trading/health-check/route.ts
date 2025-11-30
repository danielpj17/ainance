export const runtime = 'nodejs'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, getDemoUserIdServer } from '@/utils/supabase/server'
import { isMarketOpen, startBot, executeTradingLoop } from '../route'
import { BotConfig } from '../route'
import { isDemoMode } from '@/lib/demo-user'

// Enhanced health check endpoint that:
// 1. Checks if bots should be running
// 2. Executes trading loop directly if bot should be running (keeps it alive)
// 3. Restarts bot if it's not running but should be
// This can be called frequently to keep the bot running even when no one is on the page
// Can be called with or without authentication (for external cron services)
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    // Check for authorization token (optional - allows external services to call this)
    const authHeader = req.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET
    const vercelCronHeader = req.headers.get('x-vercel-cron')
    
    // Allow if it's a Vercel cron job OR has valid secret token
    // If neither, we'll still try to process always-on users (they don't need auth)
    const isVercelCron = vercelCronHeader !== null
    const hasValidToken = cronSecret && authHeader === `Bearer ${cronSecret}`
    
    // Only require auth if we're checking current user (fallback case)
    // For always-on users, we can process without auth since we're using RPC functions

    const supabase = await createServerClient(req, {})

    // Note: We still process bots even when market is closed
    // This ensures logs are written and bot state is maintained
    // The executeTradingLoop function will handle the market closed case

    // Get all users with always_on enabled
    // This works for all always-on users, not just the current user
    const { data: alwaysOnUsers, error: fetchError } = await supabase.rpc('get_always_on_users')

    if (fetchError) {
      console.error('❌ Error fetching always-on users:', fetchError)
    } else {
      console.log(`📊 Health check: Found ${alwaysOnUsers?.length || 0} always-on user(s)`)
    }

    // Also get all users with is_running = true (manually started bots)
    // This ensures manually started bots continue running even if not always-on
    const { data: runningBots, error: runningBotsError } = await supabase
      .from('bot_state')
      .select('user_id, config, always_on, is_running')
      .eq('is_running', true)

    if (runningBotsError) {
      console.error('❌ Error fetching running bots:', runningBotsError)
    } else {
      console.log(`📊 Health check: Found ${runningBots?.length || 0} manually running bot(s)`)
    }

    // Combine always-on users and manually started bots
    const allActiveBots = new Map<string, any>()
    
    // Add always-on users
    if (alwaysOnUsers && alwaysOnUsers.length > 0) {
      alwaysOnUsers.forEach((user: any) => {
        allActiveBots.set(user.user_id, user)
      })
    }
    
    // Add manually started bots (is_running = true)
    if (runningBots && runningBots.length > 0) {
      runningBots.forEach((bot: any) => {
        if (!allActiveBots.has(bot.user_id)) {
          allActiveBots.set(bot.user_id, {
            user_id: bot.user_id,
            config: bot.config,
            always_on: bot.always_on || false
          })
        }
      })
    }

    if (allActiveBots.size === 0) {
      console.log('📊 Health check: No active bots found, checking current user...')
      // No active bots, but check current user anyway
      return await checkAndRunCurrentUser(supabase, req)
    }

    console.log(`📊 Health check: Found ${allActiveBots.size} active bot(s) to process`)
    const results = []
    
    // Process each active bot (always-on or manually started)
    for (const user of Array.from(allActiveBots.values())) {
      try {
        const userId = user.user_id
        const config = user.config as BotConfig

        if (!config) {
          console.log(`⚠️  User ${userId} has always-on enabled but no config`)
          continue
        }

        // Execute trading loop directly (this keeps the bot running)
        console.log(`🔄 Health check: Executing trading loop for user ${userId} (Always-On: ${user.always_on})`)
        
        // Get API keys - prioritize user-specific keys from database
        // For authenticated users: use their saved Alpaca keys
        // For demo mode: fallback to environment variables
        // News API key is always shared from environment (not user-specific)
        let alpacaApiKey: string | undefined
        let alpacaSecretKey: string | undefined
        const newsApiKey: string | undefined = process.env.NEWS_API_KEY // Always use shared key
        
        const isDemo = isDemoMode() && userId === '00000000-0000-0000-0000-000000000000'
        
        // Declare apiKeys outside the if block so it's accessible later
        let apiKeys: any[] | null = null
        
        // For authenticated users, always try database first (user-specific Alpaca keys only)
        if (!isDemo) {
          const { data: fetchedApiKeys, error: apiKeysError } = await supabase.rpc('get_user_api_keys', {
            user_uuid: userId
          })

          if (apiKeysError) {
            console.error(`❌ Error fetching API keys for user ${userId}:`, apiKeysError)
            results.push({
              userId,
              success: false,
              error: `Failed to fetch API keys: ${apiKeysError.message}`
            })
            continue
          }

          apiKeys = fetchedApiKeys

          if (apiKeys?.[0]) {
            const userKeys = apiKeys[0]
            alpacaApiKey = userKeys.alpaca_paper_key
            alpacaSecretKey = userKeys.alpaca_paper_secret
            // Note: newsApiKey is always from environment, not user-specific
          }
        }
        
        // Fallback to environment variables if no user keys found (or demo mode)
        if (!alpacaApiKey || !alpacaSecretKey) {
          alpacaApiKey = process.env.ALPACA_PAPER_KEY
          alpacaSecretKey = process.env.ALPACA_PAPER_SECRET
        }

        // Final check to ensure Alpaca keys are available
        if (!alpacaApiKey || !alpacaSecretKey) {
          console.log(`⚠️  User ${userId} has no API keys configured (checked env vars${!isDemo ? ' and database' : ''})`)
          results.push({
            userId,
            success: false,
            error: 'No API keys configured. Please set ALPACA_PAPER_KEY and ALPACA_PAPER_SECRET environment variables or configure in database.'
          })
          continue
        }

        // Get all user keys (both paper and live) for getAlpacaKeys function
        const userKeys = !isDemo && apiKeys?.[0] ? apiKeys[0] : null
        
        // Create a keys object with both paper and live keys (for getAlpacaKeys function)
        const keys = {
          alpaca_paper_key: userKeys?.alpaca_paper_key || alpacaApiKey,
          alpaca_paper_secret: userKeys?.alpaca_paper_secret || alpacaSecretKey,
          alpaca_live_key: userKeys?.alpaca_live_key || process.env.ALPACA_LIVE_KEY || null,
          alpaca_live_secret: userKeys?.alpaca_live_secret || process.env.ALPACA_LIVE_SECRET || null,
          news_api_key: newsApiKey || null
        }

        // Execute trading loop directly
        console.log(`🚀 Health check: Calling executeTradingLoop for user ${userId}...`)
        await executeTradingLoop(supabase, userId, config, keys)
        console.log(`✅ Health check: Trading loop completed for user ${userId}`)
        
        // Update last_run timestamp
        const { error: updateError } = await supabase.rpc('update_bot_state', {
          user_uuid: userId,
          is_running_param: true,
          config_param: config,
          error_param: null,
          always_on_param: user.always_on
        })

        if (updateError) {
          console.error(`⚠️  Error updating bot state for user ${userId}:`, updateError)
        } else {
          console.log(`✅ Health check: Bot state updated for user ${userId}`)
        }

        results.push({
          userId,
          success: true,
          message: 'Trading loop executed'
        })

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        const errorStack = error instanceof Error ? error.stack : undefined
        console.error(`❌ Error executing trading loop for user ${user.user_id}:`, errorMsg)
        console.error('Error stack:', errorStack)
        results.push({
          userId: user.user_id,
          success: false,
          error: errorMsg
        })
      }
    }

    return NextResponse.json({
      success: true,
      message: `Health check completed for ${allActiveBots.size} active bot(s)`,
      results,
      executed: results.filter(r => r.success).length,
      total: allActiveBots.size
    })

  } catch (error) {
    console.error('Error in health check:', error)
    return NextResponse.json({ 
      success: false, 
      error: 'Internal server error' 
    }, { status: 500 })
  }
}

// Helper function to check and run bot for current user (fallback)
async function checkAndRunCurrentUser(supabase: any, req: NextRequest): Promise<NextResponse> {
  // In demo mode, always use demo user ID
  let userId: string
  if (isDemoMode()) {
    userId = getDemoUserIdServer()
  } else {
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ 
        success: false, 
        error: 'Unauthorized' 
      }, { status: 401 })
    }
    userId = user.id
  }

  // Get bot state from database
  const { data: botStateData } = await supabase.rpc('get_bot_state', {
    user_uuid: userId
  })

  const dbBotState = botStateData?.[0]

  // If bot should be running (has always_on or is marked as running) but market is open
  if (dbBotState && (dbBotState.always_on || dbBotState.is_running) && dbBotState.config) {
    // Check if bot is actually running (check if last_run was recent - within the last 5 minutes)
    const lastRun = dbBotState.last_run ? new Date(dbBotState.last_run) : null
    const now = new Date()
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000)

    // If last run was more than 5 minutes ago and market is open, restart the bot
    if (!lastRun || lastRun < fiveMinutesAgo) {
      console.log(`🔄 Health check: Bot should be running but last run was ${lastRun ? lastRun.toISOString() : 'never'}, restarting...`)
      
      try {
        const config = dbBotState.config as BotConfig
        const result = await startBot(supabase, userId, config)
        
        if (result.status === 200) {
          return NextResponse.json({
            success: true,
            message: 'Bot restarted',
            botRunning: true,
            restarted: true
          })
        } else {
          return NextResponse.json({
            success: false,
            message: 'Failed to restart bot',
            botRunning: false,
            restarted: false
          })
        }
      } catch (error) {
        console.error('Error restarting bot in health check:', error)
        return NextResponse.json({
          success: false,
          message: 'Error restarting bot',
          botRunning: false,
          restarted: false,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    } else {
      // Bot is running (last run was recent) - execute trading loop to keep it alive
      try {
        const config = dbBotState.config as BotConfig
        
        // Get API keys
        const { data: apiKeys } = await supabase.rpc('get_user_api_keys', {
          user_uuid: userId
        })

        if (apiKeys?.[0]) {
          const keys = {
            alpaca_paper_key: apiKeys[0].alpaca_paper_key,
            alpaca_paper_secret: apiKeys[0].alpaca_paper_secret,
            news_api_key: apiKeys[0].news_api_key || null,
            alpaca_live_key: null,
            alpaca_live_secret: null
          }

          // Execute trading loop to keep bot alive
          await executeTradingLoop(supabase, userId, config, keys)
          
          // Update last_run
          await supabase.rpc('update_bot_state', {
            user_uuid: userId,
            is_running_param: true,
            config_param: config,
            error_param: null,
            always_on_param: dbBotState.always_on
          })
        }
      } catch (error) {
        console.error('Error executing trading loop in health check:', error)
      }

      return NextResponse.json({
        success: true,
        message: 'Bot is running',
        botRunning: true,
        restarted: false,
        lastRun: lastRun.toISOString()
      })
    }
  }

  // Bot is not supposed to be running
  return NextResponse.json({
    success: true,
    message: 'Bot is not configured to run',
    botRunning: false,
    restarted: false
  })
}

