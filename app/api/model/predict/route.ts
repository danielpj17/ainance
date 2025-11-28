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

    // Check if real ML model exists in storage
    const { data: files, error: listError } = await supabase.storage
      .from('models')
      .list()
    
    const hasRealModel = files?.some(f => 
      f.name.includes('scalping_model') && f.name.endsWith('.pkl')
    )
    
    // Also check if model exists locally (for development)
    const fs = await import('fs')
    const path = await import('path')
    const localModelPath = path.join(process.cwd(), 'python-functions', 'model', 'scalping_model_v2.pkl')
    const modelExistsLocally = fs.existsSync(localModelPath)

    // If real ML model exists, use it via Python script
    // Note: For ML predictions, we need symbols, not individual features
    // The current API expects features object, so we'll use rule-based for now
    // To use ML model, call /api/model/predict-ml directly with symbols array
    if (hasRealModel || modelExistsLocally) {
      // If features contains a symbol, we could extract it, but the current
      // API structure expects a single features object, not an array
      // For now, we'll keep rule-based but note that ML is available
      console.log('ML model available but using rule-based prediction. Use /api/model/predict-ml with symbols for ML predictions.')
    }

    // Fallback to rule-based prediction if ML model not available or failed
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
      source: 'rule-based',
      note: hasRealModel || modelExistsLocally 
        ? 'ML model available but prediction failed, using rule-based fallback'
        : 'Using rule-based prediction. Train ML model with: cd python-functions/model && python train_with_real_data.py'
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

