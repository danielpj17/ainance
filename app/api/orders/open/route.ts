import { NextRequest, NextResponse } from 'next/server'
import { getUserIdFromRequest, getAlpacaKeysForUser } from '@/utils/supabase/server'
import { createAlpacaClient } from '@/lib/alpaca-client'
import type { AccountType } from '@/types/trading'

export async function GET(req: NextRequest) {
  try {
    const { userId, isDemo } = await getUserIdFromRequest(req)
    
    const { searchParams } = new URL(req.url)
    const accountType = searchParams.get('account_type') || 'paper'
    const accountId = searchParams.get('account_id') || undefined
    
    // Get Alpaca keys
    const alpacaAccountType: AccountType = accountType === 'live' ? 'live' : 'paper'
    const { apiKey, secretKey, paper: isPaper } = await getAlpacaKeysForUser(
      userId, 
      isDemo, 
      alpacaAccountType, 
      accountId
    )
    
    if (!apiKey || !secretKey) {
      return NextResponse.json({ 
        success: true,
        orders: []
      })
    }
    
    const alpacaClient = createAlpacaClient({
      apiKey,
      secretKey,
      baseUrl: isPaper ? 'https://paper-api.alpaca.markets' : 'https://api.alpaca.markets',
      paper: isPaper
    })
    
    await alpacaClient.initialize()
    const openOrders = await alpacaClient.getOpenOrders()
    
    // Get market status for next_open time
    let nextOpen = null
    try {
      const clock = await (alpacaClient as any).client.getClock()
      nextOpen = clock.next_open
    } catch (e) {
      // Ignore
    }
    
    // Format orders for frontend
    const formattedOrders = openOrders.map((order: any) => ({
      id: order.id,
      symbol: order.symbol,
      side: order.side,
      qty: parseFloat(order.qty),
      type: order.type,
      status: order.status,
      created_at: order.created_at,
      submitted_at: order.submitted_at,
      time_in_force: order.time_in_force,
      next_market_open: nextOpen
    }))
    
    return NextResponse.json({
      success: true,
      orders: formattedOrders
    })
    
  } catch (error: any) {
    console.error('Error fetching open orders:', error)
    return NextResponse.json({ 
      success: false,
      error: error.message || 'Failed to fetch open orders',
      orders: []
    }, { status: 500 })
  }
}
