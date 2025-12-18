export const runtime = 'nodejs'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, getUserIdFromRequest, getAlpacaKeysForUser } from '@/utils/supabase/server'
import { isMarketOpen, startBot, executeTradingLoop } from '../route'
import { BotConfig } from '../route'

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

    // Get all accounts with always_on enabled
    const { data: alwaysOnAccounts, error: fetchError } = await supabase.rpc('get_always_on_accounts')

    if (fetchError) {
      console.error('❌ Error fetching always-on accounts:', fetchError)
    } else {
      console.log(`📊 Health check: Found ${alwaysOnAccounts?.length || 0} always-on account(s)`)
    }

    // Also get all accounts with is_running = true (manually started bots)
    // This ensures manually started bots continue running even if not always-on
    const { data: runningAccounts, error: runningAccountsError } = await supabase.rpc('get_running_accounts')

    if (runningAccountsError) {
      console.error('❌ Error fetching running accounts:', runningAccountsError)
    } else {
      console.log(`📊 Health check: Found ${runningAccounts?.length || 0} manually running account(s)`)
    }

    // Combine always-on accounts and manually started bots
    const allActiveAccounts = new Map<string, any>()
    
    // Add always-on accounts
    if (alwaysOnAccounts && alwaysOnAccounts.length > 0) {
      alwaysOnAccounts.forEach((account: any) => {
        allActiveAccounts.set(account.account_id, account)
      })
    }
    
    // Add manually started accounts (is_running = true)
    if (runningAccounts && runningAccounts.length > 0) {
      runningAccounts.forEach((account: any) => {
        if (!allActiveAccounts.has(account.account_id)) {
          allActiveAccounts.set(account.account_id, account)
        }
      })
    }

    if (allActiveAccounts.size === 0) {
      console.log('📊 Health check: No active accounts found, checking current user...')
      // No active accounts, but check current user anyway
      return await checkAndRunCurrentUser(supabase, req)
    }

    console.log(`📊 Health check: Found ${allActiveAccounts.size} active account(s) to process`)
    const results = []
    
    // Process each active account (always-on or manually started)
    for (const account of Array.from(allActiveAccounts.values())) {
      try {
        const userId = account.user_id
        const accountId = account.account_id
        const config = account.config as BotConfig

        if (!config) {
          console.log(`⚠️  Account ${accountId} has always-on enabled but no config`)
          continue
        }

        // Execute trading loop directly (this keeps the bot running)
        console.log(`🔄 Health check: Executing trading loop for account ${accountId} (user: ${userId}, Always-On: ${account.always_on})`)
        
        // Get API keys for this account using account-specific method
        const { data: accountKeysData, error: accountKeysError } = await supabase.rpc('get_paper_account_keys', {
          account_uuid: accountId,
          user_uuid: userId
        })

        if (accountKeysError) {
          console.error(`❌ Error fetching API keys for account ${accountId}:`, accountKeysError)
          results.push({
            accountId,
            userId,
            success: false,
            error: `Failed to fetch API keys: ${accountKeysError.message}`
          })
          continue
        }

        if (!accountKeysData || !accountKeysData[0]) {
          console.log(`⚠️  Account ${accountId} has no API keys configured`)
          results.push({
            accountId,
            userId,
            success: false,
            error: 'No API keys configured for this account.'
          })
          continue
        }

        const accountKeys = accountKeysData[0]
        const keys = {
          alpaca_paper_key: accountKeys.alpaca_api_key,
          alpaca_paper_secret: accountKeys.alpaca_api_secret,
          alpaca_live_key: null,
          alpaca_live_secret: null,
          news_api_key: process.env.NEWS_API_KEY || null
        }

        // Execute trading loop directly
        console.log(`🚀 Health check: Calling executeTradingLoop for account ${accountId}...`)
        await executeTradingLoop(supabase, userId, config, keys, accountId)
        console.log(`✅ Health check: Trading loop completed for account ${accountId}`)
        
        // Update last_run timestamp
        const { error: updateError } = await supabase.rpc('update_account_bot_state', {
          account_uuid: accountId,
          user_uuid: userId,
          is_running_param: true,
          config_param: config,
          error_param: null,
          always_on_param: account.always_on
        })

        if (updateError) {
          console.error(`⚠️  Error updating bot state for account ${accountId}:`, updateError)
        } else {
          console.log(`✅ Health check: Bot state updated for account ${accountId}`)
        }

        results.push({
          accountId,
          userId,
          success: true,
          message: 'Trading loop executed'
        })

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        const errorStack = error instanceof Error ? error.stack : undefined
        console.error(`❌ Error executing trading loop for account ${account.account_id}:`, errorMsg)
        console.error('Error stack:', errorStack)
        results.push({
          accountId: account.account_id,
          userId: account.user_id,
          success: false,
          error: errorMsg
        })
      }
    }

    return NextResponse.json({
      success: true,
      message: `Health check completed for ${allActiveAccounts.size} active account(s)`,
      results,
      executed: results.filter(r => r.success).length,
      total: allActiveAccounts.size
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
  // Get user ID from request (checks Authorization header)
  const { userId, isDemo } = await getUserIdFromRequest(req)
  console.log('[HEALTH-CHECK] checkAndRunCurrentUser - User detected:', { userId, isDemo })

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

