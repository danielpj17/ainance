import { NextRequest, NextResponse } from 'next/server'
import { getUserIdFromRequest, getAlpacaKeysForUser } from '@/utils/supabase/server'
import { createAlpacaClient } from '@/lib/alpaca-client'
import type { AccountType } from '@/types/trading'

export async function POST(req: NextRequest) {
  try {
    const { userId, isDemo } = await getUserIdFromRequest(req)
    
    const body = await req.json()
    const { order_id, account_type, account_id } = body
    
    if (!order_id) {
      return NextResponse.json({ 
        success: false, 
        error: 'Missing order_id' 
      }, { status: 400 })
    }
    
    // Get Alpaca keys
    const alpacaAccountType: AccountType = account_type === 'live' ? 'live' : 'paper'
    const { apiKey, secretKey, paper: isPaper } = await getAlpacaKeysForUser(
      userId, 
      isDemo, 
      alpacaAccountType, 
      account_id
    )
    
    if (!apiKey || !secretKey) {
      return NextResponse.json({ 
        success: false, 
        error: 'API keys not found' 
      }, { status: 400 })
    }
    
    const alpacaClient = createAlpacaClient({
      apiKey,
      secretKey,
      baseUrl: isPaper ? 'https://paper-api.alpaca.markets' : 'https://api.alpaca.markets',
      paper: isPaper
    })
    
    await alpacaClient.initialize()
    await alpacaClient.cancelOrder(order_id)
    
    return NextResponse.json({
      success: true,
      message: 'Order cancelled successfully'
    })
    
  } catch (error: any) {
    console.error('Error cancelling order:', error)
    return NextResponse.json({ 
      success: false, 
      error: error.message || 'Failed to cancel order' 
    }, { status: 500 })
  }
}
