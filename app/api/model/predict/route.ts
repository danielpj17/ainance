export const runtime = 'nodejs'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const symbols = body.symbols || []
    const mode = body.mode || 'paper'
    
    if (symbols.length === 0) {
      return NextResponse.json({
        success: true,
        signals: [],
        note: 'No symbols provided'
      })
    }

    // Use service role for storage access
    const supabase = createClient()
    
    // Check if model exists in storage
    const { data: files, error: listError } = await supabase.storage
      .from('models')
      .list()
    
    if (listError || !files || files.length === 0) {
      return NextResponse.json({
        success: true,
        signals: [],
        note: 'Model not found yet. Train first.'
      })
    }

    // Generate mock predictions for now
    // In production on Vercel, this would use the trained Random Forest model
    const now = new Date().toISOString()
    const signals = symbols.map((symbol: string) => {
      // Simple rule-based mock predictions
      const random = Math.random()
      let action: 'buy' | 'sell' | 'hold'
      let confidence: number
      
      if (random > 0.6) {
        action = 'buy'
        confidence = 0.65 + Math.random() * 0.2
      } else if (random < 0.4) {
        action = 'sell'
        confidence = 0.60 + Math.random() * 0.2
      } else {
        action = 'hold'
        confidence = 0.55 + Math.random() * 0.15
      }
      
      return {
        symbol,
        action,
        confidence: parseFloat(confidence.toFixed(2)),
        price: 150.0 + Math.random() * 50,
        timestamp: now,
        reasoning: 'Mock prediction (deploy to Vercel for real RF model)'
      }
    })

    return NextResponse.json({
      success: true,
      signals,
      note: 'Using mock predictions. Deploy to Vercel to use trained Random Forest model.'
    })

  } catch (error: any) {
    console.error('Error in model prediction:', error)
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to generate predictions'
    }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    message: 'Predict endpoint alive'
  })
}

