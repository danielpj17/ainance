export const runtime = 'nodejs'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const body = await req.json()
    
    const { features } = body
    
    if (!features) {
      return NextResponse.json({
        success: false,
        error: 'Missing features in request body'
      }, { status: 400 })
    }

    // Check if model exists in storage
    const { data: files } = await supabase.storage
      .from('models')
      .list()
    
    const hasModel = files?.some(f => 
      f.name.includes('scalping_model') && (f.name.endsWith('.pkl') || f.name.endsWith('.json'))
    )

    if (!hasModel) {
      return NextResponse.json({
        success: false,
        error: 'Model not found. Please train the model first.'
      }, { status: 404 })
    }

    // Simple rule-based prediction logic
    // In production with a real .pkl model, you'd load and use it here
    const { rsi, macd, bbWidth, volumeRatio, newsSentiment, emaTrend } = features
    
    let signal = 0 // 0 = hold, 1 = buy, -1 = sell
    let confidence = 0.5
    
    // Simple trading logic based on technical indicators
    if (rsi > 70) {
      signal = -1 // Overbought - sell
      confidence = 0.7
    } else if (rsi < 30) {
      signal = 1 // Oversold - buy
      confidence = 0.7
    } else if (macd > 0 && emaTrend === 1) {
      signal = 1 // Bullish momentum
      confidence = 0.65
    } else if (macd < 0 && emaTrend === -1) {
      signal = -1 // Bearish momentum
      confidence = 0.65
    }
    
    // Adjust confidence based on sentiment
    if (signal !== 0 && Math.abs(newsSentiment) > 0.2) {
      if ((signal === 1 && newsSentiment > 0) || (signal === -1 && newsSentiment < 0)) {
        confidence = Math.min(0.95, confidence + 0.15)
      } else {
        confidence = Math.max(0.4, confidence - 0.15)
      }
    }

    return NextResponse.json({
      success: true,
      prediction: signal,
      confidence: confidence,
      features: features,
      note: 'Using rule-based prediction. For ML-based predictions, upload a trained .pkl model from python-functions/model/train.py'
    })

  } catch (error: any) {
    console.error('Error in model prediction:', error)
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to make prediction'
    }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    message: 'Predict endpoint alive'
  })
}

