export const runtime = 'nodejs'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/utils/supabase/server'
import { isMarketOpen, startBot, executeTradingLoop } from '../route'
import { BotConfig } from '../route'
import { isDemoMode, getDemoUserIdServer } from '@/lib/demo-user'
import { getAlpacaKeys } from '@/lib/alpaca-client'

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

    // Check if market is open
    if (!isMarketOpen()) {
      return NextResponse.json({
        success: true,
        message: 'Market is closed',
        marketOpen: false,
        botRunning: false
      })
    }

    // Get all users with always_on enabled
    // This works for all always-on users, not just the current user
    const { data: alwaysOnUsers, error: fetchError } = await supabase.rpc('get_always_on_users')

    if (fetchError) {
      console.error('Error fetching always-on users:', fetchError)
      // Fall back to checking current user if RPC fails
      return await checkAndRunCurrentUser(supabase, req)
    }

    if (!alwaysOnUsers || alwaysOnUsers.length === 0) {
      // No always-on users, but check current user anyway
      return await checkAndRunCurrentUser(supabase, req)
    }

    const results = []
    
    // Process each always-on user
    for (const user of alwaysOnUsers) {
      try {
        const userId = user.user_id
        const config = user.config as BotConfig

        if (!config) {
          console.log(`⚠️  User ${userId} has always-on enabled but no config`)
          continue
        }

        // Execute trading loop directly (this keeps the bot running)
        console.log(`🔄 Health check: Executing trading loop for always-on user ${userId}`)
        
        // Get API keys
        const { data: apiKeys } = await supabase.rpc('get_user_api_keys', {
          user_uuid: userId
        })

        if (!apiKeys?.[0]) {
          console.log(`⚠️  User ${userId} has no API keys configured`)
          continue
        }

        const keys = {
          alpaca_paper_key: apiKeys[0].alpaca_paper_key,
          alpaca_paper_secret: apiKeys[0].alpaca_paper_secret,
          news_api_key: apiKeys[0].news_api_key || null,
          alpaca_live_key: null,
          alpaca_live_secret: null
        }

        // Execute trading loop directly
        await executeTradingLoop(supabase, userId, config, keys)
        
        // Update last_run timestamp
        await supabase.rpc('update_bot_state', {
          user_uuid: userId,
          is_running_param: true,
          config_param: config,
          error_param: null,
          always_on_param: true
        })

        results.push({
          userId,
          success: true,
          message: 'Trading loop executed'
        })

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        console.error(`Error executing trading loop for user ${user.user_id}:`, errorMsg)
        results.push({
          userId: user.user_id,
          success: false,
          error: errorMsg
        })
      }
    }

    return NextResponse.json({
      success: true,
      message: `Health check completed for ${alwaysOnUsers.length} always-on user(s)`,
      results,
      executed: results.filter(r => r.success).length,
      total: alwaysOnUsers.length
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

