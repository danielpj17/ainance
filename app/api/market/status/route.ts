import { NextRequest, NextResponse } from 'next/server'
import { getUserIdFromRequest, getAlpacaKeysForUser } from '@/utils/supabase/server'
import { createAlpacaClient } from '@/lib/alpaca-client'

export async function GET(req: NextRequest) {
  try {
    const { userId, isDemo } = await getUserIdFromRequest(req)
    
    // Get account_id from query params if provided
    const { searchParams } = new URL(req.url)
    const accountId = searchParams.get('account_id') || undefined

    // Get Alpaca keys
    const { apiKey, secretKey } = await getAlpacaKeysForUser(userId, isDemo, 'paper', accountId)
    
    if (!apiKey || !secretKey) {
      // Return a default response if no keys configured
      return NextResponse.json({
        success: true,
        data: {
          is_open: false,
          next_open: null,
          next_close: null,
          message: 'API keys not configured'
        }
      })
    }
    
    const alpaca = createAlpacaClient({
      apiKey,
      secretKey,
      baseUrl: 'https://paper-api.alpaca.markets',
      paper: true
    })
    await alpaca.initialize()

    const isOpen = await alpaca.isMarketOpen()
    
    // Get clock info for more details
    let clockInfo = null
    try {
      // Access the underlying client to get clock
      const clock = await (alpaca as any).client.getClock()
      clockInfo = {
        timestamp: clock.timestamp,
        is_open: clock.is_open,
        next_open: clock.next_open,
        next_close: clock.next_close
      }
    } catch (e) {
      // Ignore if clock fetch fails
    }

    return NextResponse.json({
      success: true,
      data: {
        is_open: isOpen,
        next_open: clockInfo?.next_open || null,
        next_close: clockInfo?.next_close || null,
        timestamp: clockInfo?.timestamp || new Date().toISOString()
      }
    })
  } catch (error: any) {
    console.error('Error checking market status:', error)
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to check market status',
      data: {
        is_open: false,
        next_open: null,
        next_close: null
      }
    }, { status: 500 })
  }
}
