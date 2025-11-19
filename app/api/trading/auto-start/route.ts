export const runtime = 'nodejs'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/utils/supabase/server'
import { isMarketOpen, startBot } from '../route'
import { BotConfig } from '../route'

// This endpoint can be called periodically (e.g., via cron job) to auto-start bots
// when market opens for users who have always_on enabled
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    // Check for Vercel Cron secret (required for Vercel cron jobs)
    const authHeader = req.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET
    const vercelCronHeader = req.headers.get('x-vercel-cron')
    
    // Allow if it's a Vercel cron job (has x-vercel-cron header) OR has valid secret token
    const isVercelCron = vercelCronHeader !== null
    const hasValidToken = cronSecret && authHeader === `Bearer ${cronSecret}`
    
    if (!isVercelCron && !hasValidToken && cronSecret) {
      return NextResponse.json({ 
        success: false, 
        error: 'Unauthorized - Missing cron secret or Vercel cron header' 
      }, { status: 401 })
    }

    const supabase = await createServerClient(req, {})

    // Check if market is open
    if (!isMarketOpen()) {
      return NextResponse.json({
        success: true,
        message: 'Market is closed, no bots to start',
        started: 0
      })
    }

    // Get all users with always_on enabled
    const { data: alwaysOnUsers, error: fetchError } = await supabase.rpc('get_always_on_users')

    if (fetchError) {
      console.error('Error fetching always-on users:', fetchError)
      return NextResponse.json({ 
        success: false, 
        error: 'Failed to fetch always-on users' 
      }, { status: 500 })
    }

    if (!alwaysOnUsers || alwaysOnUsers.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No users with always-on enabled',
        started: 0
      })
    }

    let startedCount = 0
    const errors: string[] = []

    // Try to start each bot
    for (const user of alwaysOnUsers) {
      try {
        const userId = user.user_id
        const config = user.config as BotConfig

        if (!config) {
          console.log(`⚠️  User ${userId} has always-on enabled but no config`)
          continue
        }

        // Check if bot is already running (check database state)
        const { data: botStateData } = await supabase.rpc('get_bot_state', {
          user_uuid: userId
        })

        const dbBotState = botStateData?.[0]
        if (dbBotState?.is_running) {
          console.log(`✅ Bot already running for user ${userId}`)
          continue
        }

        // Start the bot
        console.log(`🔄 Auto-starting bot for user ${userId} (always-on enabled)`)
        const result = await startBot(supabase, userId, config)
        
        if (result.status === 200) {
          const resultData = await result.json()
          if (resultData.success) {
            startedCount++
            console.log(`✅ Successfully started bot for user ${userId}`)
          } else {
            errors.push(`User ${userId}: ${resultData.error || 'Failed to start'}`)
          }
        } else {
          errors.push(`User ${userId}: HTTP ${result.status}`)
        }

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        console.error(`Error starting bot for user ${user.user_id}:`, errorMsg)
        errors.push(`User ${user.user_id}: ${errorMsg}`)
      }
    }

    return NextResponse.json({
      success: true,
      message: `Auto-start check completed`,
      started: startedCount,
      total: alwaysOnUsers.length,
      errors: errors.length > 0 ? errors : undefined
    })

  } catch (error) {
    console.error('Error in auto-start:', error)
    return NextResponse.json({ 
      success: false, 
      error: 'Internal server error' 
    }, { status: 500 })
  }
}

