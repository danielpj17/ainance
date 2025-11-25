export const runtime = 'nodejs'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Check what files exist in the models bucket
    const { data: files, error } = await supabase.storage
      .from('models')
      .list()
    
    if (error) {
      return NextResponse.json({
        success: false,
        error: 'Failed to check model files: ' + error.message
      }, { status: 500 })
    }

    // Check for real ML model (.pkl file)
    const modelFile = files?.find(f => 
      f.name.includes('scalping_model') && f.name.endsWith('.pkl')
    )?.name

    // Check for metadata file
    const metadataFile = files?.find(f => 
      f.name.includes('scalping_model') && f.name.endsWith('.json')
    )?.name

    return NextResponse.json({
      success: true,
      hasRealModel: !!modelFile,
      hasMetadata: !!metadataFile,
      modelFile: modelFile || undefined,
      metadataFile: metadataFile || undefined,
      allFiles: files?.map(f => f.name) || []
    })

  } catch (error: any) {
    console.error('Error checking model status:', error)
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to check model status'
    }, { status: 500 })
  }
}

