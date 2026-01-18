export const runtime = 'nodejs'
import { NextRequest, NextResponse } from 'next/server'
import { getUserIdFromRequest, getAlpacaKeysForUser } from '@/utils/supabase/server'
import { createAlpacaClient } from '@/lib/alpaca-client'

export async function GET(req: NextRequest) {
  try {
    const { userId, isDemo } = await getUserIdFromRequest(req)
    const { searchParams } = new URL(req.url)

    // 1. Standardize Parameters
    const period = searchParams.get('period') || '1W'
    const accountId = searchParams.get('account_id') || undefined

    let timeframe = searchParams.get('timeframe')
    let effectivePeriod = period

    if (!timeframe) {
      if (period === '1D') timeframe = '5Min'
      else if (period === '1W') timeframe = '1H'
      else timeframe = '1D'
    }

    const { apiKey, secretKey, paper } = await getAlpacaKeysForUser(
      userId,
      isDemo,
      'paper',
      accountId
    )

    if (!apiKey || !secretKey) {
      return NextResponse.json({ success: false, error: 'No API keys' })
    }

    const alpaca = createAlpacaClient({
      apiKey,
      secretKey,
      baseUrl: '[https://paper-api.alpaca.markets](https://paper-api.alpaca.markets)',
      paper: true
    })
    await alpaca.initialize()

    // 2. Fetch History & Account Info
    const history = await alpaca.getPortfolioHistory({
      period: effectivePeriod,
      timeframe,
      extended_hours: true
    })
    const account = await alpaca.getAccount()

    // 3. Robust Data Reconstruction
    // We need a reliable "Anchor Point" (Base Value) to draw the graph
    const currentEquity = parseFloat(account.equity || '0')
    const lastEquity = parseFloat(account.last_equity || account.equity || '0')
    const historyBase = history.base_value && history.base_value > 0 ? history.base_value : lastEquity
    // Guard against obviously bad base values (e.g. 300k+ vs 123k equity)
    const baseValue =
      currentEquity > 0 && (historyBase > currentEquity * 1.5 || historyBase < currentEquity * 0.5)
        ? currentEquity
        : historyBase

    let finalEquity: number[] = []

    // Match 1W logic for all periods: use raw equity with a sanity check.
    const rawEquity = (history.equity || []) as Array<number | null>

    const numericEquity = rawEquity.filter((val): val is number => val !== null && val !== undefined)
    const maxAbsEquity = numericEquity.length
      ? Math.max(...numericEquity.map((val) => Math.abs(val)))
      : 0
    const hasNegative = numericEquity.some((val) => val < 0)

    // Heuristic: if values are all small vs base, or 1D has negatives, treat as P&L
    const looksLikePnl =
      (baseValue > 0 && maxAbsEquity < baseValue * 0.2) ||
      (period === '1D' && hasNegative && maxAbsEquity < baseValue * 0.5)

    finalEquity = rawEquity
      .map((val: number | null) => {
        if (val === null || val === undefined) return null

        if (looksLikePnl) {
          return baseValue + val
        }

        // Sanity Check: Is this value suspiciously small? (e.g. 50 vs 100,000)
        if (baseValue > 0 && Math.abs(val) < baseValue * 0.5) {
          return baseValue + val // Treat as P&L
        }
        return val
      })
      .filter((val): val is number => val !== null)

    // 4. Fill Gaps (Smoothing)
    // If the API returns fewer points than expected, forward-fill the last valid value
    const cleanEquity: number[] = []
    let lastValid = baseValue // Start with base value

    for (const val of finalEquity) {
      if (val && !isNaN(val)) {
        cleanEquity.push(val)
        lastValid = val
      } else {
        cleanEquity.push(lastValid)
      }
    }

    // 5. Final Safety Check
    // If we still somehow have 0 data, return a flat line of the current balance
    if (cleanEquity.length === 0) {
      cleanEquity.push(currentEquity)
    }

    return NextResponse.json({
      success: true,
      data: {
        timestamp: history.timestamp,
        equity: cleanEquity
      }
    })
  } catch (error: any) {
    console.error('History Error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}