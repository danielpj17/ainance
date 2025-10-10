export const runtime = 'nodejs'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/utils/supabase/server'

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createServerClient(req, {})
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { symbols = ['AAPL', 'MSFT', 'TSLA', 'SPY'] } = body

    // Generate realistic test signals
    const testSignals = symbols.map((symbol: string, index: number) => {
      const sentiments = [0.156, -0.089, 0.234, 0.045] // Realistic sentiment values
      const prices = [150.25, 430.80, 245.60, 445.30] // Realistic prices
      const confidence = [0.705, 0.682, 0.734, 0.655] // Realistic confidence
      
      const sentiment = sentiments[index] || 0.1
      const price = prices[index] || 100
      const conf = confidence[index] || 0.6
      
      let action: 'buy' | 'sell' | 'hold' = 'buy'
      let reasoning = ''
      
      if (sentiment > 0.1) {
        action = 'buy'
        reasoning = `Positive sentiment (${sentiment.toFixed(3)}) suggests upward momentum | Price: $${price.toFixed(2)} | Sentiment: ${sentiment.toFixed(3)}`
      } else if (sentiment < -0.1) {
        action = 'sell'
        reasoning = `Negative sentiment (${sentiment.toFixed(3)}) suggests downward pressure | Price: $${price.toFixed(2)} | Sentiment: ${sentiment.toFixed(3)}`
      } else {
        action = 'buy'
        reasoning = `Neutral to slightly positive sentiment, market conditions favorable | Price: $${price.toFixed(2)} | Sentiment: ${sentiment.toFixed(3)}`
      }

      return {
        symbol,
        action,
        confidence: conf,
        price,
        timestamp: new Date().toISOString(),
        reasoning
      }
    })

    // Store test signals in bot logs for demonstration
    await supabase
      .from('bot_logs')
      .insert({
        user_id: user.id,
        action: 'test_signals',
        message: `Generated ${testSignals.length} test signals for demonstration`,
        data: {
          symbols,
          signals: testSignals
        }
      })

    return NextResponse.json({
      success: true,
      signals: testSignals,
      message: 'Test signals generated successfully'
    })

  } catch (error) {
    console.error('Error generating test signals:', error)
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to generate test signals' 
    }, { status: 500 })
  }
}
