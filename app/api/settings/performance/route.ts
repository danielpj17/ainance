export const runtime = 'nodejs'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, getUserIdFromRequest } from '@/utils/supabase/server'

export interface PerformanceMetrics {
  winRate: number
  avgWin: number
  avgLoss: number
  monthlyReturn: number
  totalTrades: number
  winningTrades: number
  losingTrades: number
  totalPnL: number
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const supabase = createServerClient(req, {})
    
    // Get user ID from request (checks Authorization header)
    const { userId, isDemo } = await getUserIdFromRequest(req)
    console.log('[PERFORMANCE] User detected:', { userId, isDemo })

    // Get all trades for the user, ordered by timestamp
    const { data: trades, error: tradesError } = await supabase
      .from('trades')
      .select('*')
      .eq('user_id', userId)
      .order('trade_timestamp', { ascending: true })

    if (tradesError) {
      console.error('Error fetching trades:', tradesError)
      return NextResponse.json({ 
        success: false, 
        error: 'Failed to fetch trades' 
      }, { status: 500 })
    }

    if (!trades || trades.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          winRate: 0,
          avgWin: 0,
          avgLoss: 0,
          monthlyReturn: 0,
          totalTrades: 0,
          winningTrades: 0,
          losingTrades: 0,
          totalPnL: 0
        }
      })
    }

    // Calculate round-trip trades (buy + sell pairs)
    const positions: { [symbol: string]: { qty: number; price: number; timestamp: string }[] } = {}
    const roundTrips: { pnl: number; win: boolean }[] = []

    for (const trade of trades) {
      const symbol = trade.symbol
      const action = trade.action.toLowerCase()
      const qty = parseFloat(trade.qty)
      const price = parseFloat(trade.price)

      if (!positions[symbol]) {
        positions[symbol] = []
      }

      if (action === 'buy') {
        positions[symbol].push({ qty, price, timestamp: trade.trade_timestamp })
      } else if (action === 'sell') {
        // Match sell with oldest buy (FIFO)
        let remainingSellQty = qty
        while (remainingSellQty > 0 && positions[symbol].length > 0) {
          const buy = positions[symbol][0]
          const matchedQty = Math.min(remainingSellQty, buy.qty)
          
          // Calculate P&L for this round trip
          const pnl = (price - buy.price) * matchedQty
          roundTrips.push({ pnl, win: pnl > 0 })
          
          // Update position
          buy.qty -= matchedQty
          remainingSellQty -= matchedQty
          
          if (buy.qty <= 0) {
            positions[symbol].shift()
          }
        }
      }
    }

    // Calculate metrics
    const totalTrades = roundTrips.length
    const winningTrades = roundTrips.filter(t => t.win).length
    const losingTrades = roundTrips.filter(t => !t.win).length
    const winRate = totalTrades > 0 ? winningTrades / totalTrades : 0
    
    const wins = roundTrips.filter(t => t.win).map(t => t.pnl)
    const losses = roundTrips.filter(t => !t.win).map(t => t.pnl)
    const avgWin = wins.length > 0 ? wins.reduce((a, b) => a + b, 0) / wins.length : 0
    const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((a, b) => a + b, 0) / losses.length) : 0
    
    const totalPnL = roundTrips.reduce((sum, t) => sum + t.pnl, 0)

    // Calculate monthly return
    // Get account equity to calculate percentage return
    let monthlyReturn = 0
    try {
      // Get trades from last 30 days
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      
      const recentRoundTrips = roundTrips.filter((_, idx) => {
        // This is simplified - in reality, we'd need to track dates per round trip
        return true // For now, use all round trips
      })
      
      const monthlyPnL = recentRoundTrips.reduce((sum, t) => sum + t.pnl, 0)
      
      // Try to get account equity from account API or use default
      // For now, use a default of $100,000 for calculation
      const defaultEquity = 100000
      monthlyReturn = (monthlyPnL / defaultEquity) * 100
    } catch (error) {
      console.warn('Error calculating monthly return:', error)
    }

    const metrics: PerformanceMetrics = {
      winRate: winRate * 100, // Convert to percentage
      avgWin,
      avgLoss,
      monthlyReturn,
      totalTrades,
      winningTrades,
      losingTrades,
      totalPnL
    }

    return NextResponse.json({
      success: true,
      data: metrics
    })

  } catch (error: any) {
    console.error('Error in GET /api/settings/performance:', error)
    return NextResponse.json({ 
      success: false, 
      error: error.message || 'Internal server error' 
    }, { status: 500 })
  }
}

