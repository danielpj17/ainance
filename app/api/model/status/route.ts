export const runtime = 'nodejs'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import fs from 'fs'
import path from 'path'

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Check for model file locally (primary location for ML service)
    const localModelPath = path.join(process.cwd(), 'python-functions', 'model', 'scalping_model_v2.pkl')
    const mlServiceModelPath = path.join(process.cwd(), 'ml-service', 'scalping_model_v2.pkl')
    const hasLocalModel = fs.existsSync(localModelPath) || fs.existsSync(mlServiceModelPath)
    const modelFile = hasLocalModel ? 'scalping_model_v2.pkl' : undefined
    
    // Also check Supabase Storage (backup location)
    let hasStorageModel = false
    let storageModelFile: string | undefined
    try {
      const { data: files, error } = await supabase.storage
        .from('models')
        .list()
      
      if (!error && files) {
        storageModelFile = files.find(f => 
          f.name.includes('scalping_model') && f.name.endsWith('.pkl')
        )?.name
        hasStorageModel = !!storageModelFile
      }
    } catch (storageError) {
      // Storage check is optional, don't fail if it errors
      console.warn('Could not check Supabase storage:', storageError)
    }

    // Check for metadata file
    const metadataPath = path.join(process.cwd(), 'python-functions', 'model', 'scalping_model_metadata.json')
    const hasMetadata = fs.existsSync(metadataPath)
    const metadataFile = hasMetadata ? 'scalping_model_metadata.json' : undefined

    // Check if ML service is accessible
    const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8080'
    let mlServiceActive = false
    try {
      const healthResponse = await fetch(`${ML_SERVICE_URL}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000)
      })
      mlServiceActive = healthResponse.ok
    } catch (error) {
      // Service might not be running, that's okay
      console.log('ML service health check failed (this is normal if service is not deployed):', error)
    }

    // Model is considered active if:
    // 1. Model file exists locally OR in storage, AND
    // 2. ML service is accessible OR we're using the Python script directly
    const hasRealModel = hasLocalModel || hasStorageModel
    const isActive = hasRealModel && (mlServiceActive || hasLocalModel) // Active if service works OR local file exists

    return NextResponse.json({
      success: true,
      hasRealModel: hasRealModel,
      isActive: isActive,
      hasMetadata: hasMetadata,
      modelFile: modelFile || storageModelFile || undefined,
      metadataFile: metadataFile || undefined,
      mlServiceActive: mlServiceActive,
      mlServiceUrl: ML_SERVICE_URL,
      modelLocation: hasLocalModel ? 'local' : hasStorageModel ? 'storage' : 'none'
    })

  } catch (error: any) {
    console.error('Error checking model status:', error)
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to check model status'
    }, { status: 500 })
  }
}

