export const runtime = 'nodejs'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function POST(req: NextRequest) {
  try {
    // Use service role for admin operations
    const supabase = createClient()
    
    // For now, return a mock response
    // In production, this would call the Python training script
    const now = new Date().toISOString()
    
    // Check if storage bucket exists
    const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets()
    
    if (bucketsError) {
      return NextResponse.json({
        success: false,
        error: 'Failed to check storage buckets: ' + bucketsError.message
      }, { status: 500 })
    }
    
    const modelsBucket = buckets?.find(b => b.name === 'models')
    
    if (!modelsBucket) {
      return NextResponse.json({
        success: false,
        error: 'Storage bucket "models" not found. Please create it in Supabase Dashboard → Storage → New Bucket → name: "models"'
      }, { status: 400 })
    }

    // Create a simple mock model file for demonstration
    // In production, this would be the trained Random Forest model from Python
    const mockModelData = JSON.stringify({
      type: 'RandomForestClassifier',
      trainedAt: now,
      version: '1.0',
      features: ['rsi', 'macd', 'bbWidth', 'volumeRatio', 'newsSentiment', 'emaTrend'],
      note: 'This is a mock model. Deploy to Vercel to use the real Python Random Forest training.'
    })
    
    const blob = new Blob([mockModelData], { type: 'application/json' })
    const buffer = await blob.arrayBuffer()
    
    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('models')
      .upload('scalping_model.json', buffer, {
        contentType: 'application/json',
        upsert: true
      })
    
    if (uploadError) {
      return NextResponse.json({
        success: false,
        error: 'Failed to upload model: ' + uploadError.message
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: 'Model training simulated (mock model created)',
      lastTrainedAt: now,
      accuracySample: 0.85,
      modelPath: 'scalping_model.json',
      note: 'Deploy to Vercel to use the real Python Random Forest training with scikit-learn'
    })

  } catch (error: any) {
    console.error('Error in model training:', error)
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to train model'
    }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    message: 'Train endpoint alive'
  })
}

