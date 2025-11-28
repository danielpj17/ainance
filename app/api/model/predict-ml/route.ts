export const runtime = 'nodejs'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { spawn } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import fs from 'fs'

/**
 * ML Prediction endpoint using Python script
 * Calls the Python prediction script to use the real trained model
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const body = await req.json()
    
    const { features, symbols } = body
    
    if (!features && !symbols) {
      return NextResponse.json({
        success: false,
        error: 'Missing features or symbols in request body'
      }, { status: 400 })
    }

    // Check if model exists in storage
    const { data: files, error: listError } = await supabase.storage
      .from('models')
      .list()
    
    if (listError) {
      console.error('Error listing files:', listError)
    }
    
    const hasModel = files?.some(f => 
      f.name.includes('scalping_model') && f.name.endsWith('.pkl')
    )

    if (!hasModel) {
      // Try to check if model exists locally (for development)
      const localModelPath = path.join(process.cwd(), 'python-functions', 'model', 'scalping_model_v2.pkl')
      const modelExistsLocally = fs.existsSync(localModelPath)
      
      if (!modelExistsLocally) {
        return NextResponse.json({
          success: false,
          error: 'Model not found. Please train the model first.',
          suggestion: 'Run: cd python-functions/model && python train_with_real_data.py'
        }, { status: 404 })
      }
    }

    // If symbols provided, use Python script to fetch data and predict
    if (symbols && Array.isArray(symbols) && symbols.length > 0) {
      return await predictWithPythonScript(symbols)
    }

    // If features provided directly, we need to format them for Python
    if (features && Array.isArray(features) && features.length > 0) {
      return await predictWithFeatures(features)
    }

    return NextResponse.json({
      success: false,
      error: 'Invalid request format'
    }, { status: 400 })

  } catch (error: any) {
    console.error('Error in ML prediction:', error)
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to make prediction'
    }, { status: 500 })
  }
}

/**
 * Call Python script with symbols to fetch data and predict
 */
async function predictWithPythonScript(symbols: string[]): Promise<NextResponse> {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(process.cwd(), 'python-functions', 'model', 'predict_with_real_data.py')
    
    // Check if script exists
    if (!fs.existsSync(scriptPath)) {
      resolve(NextResponse.json({
        success: false,
        error: 'Python prediction script not found',
        path: scriptPath
      }, { status: 404 }))
      return
    }

    // Prepare input as JSON
    const input = JSON.stringify({ symbols })
    
    // Spawn Python process
    const pythonProcess = spawn('python', [scriptPath], {
      cwd: path.join(process.cwd(), 'python-functions', 'model'),
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8'
      }
    })

    let stdout = ''
    let stderr = ''

    // Send input to Python script
    pythonProcess.stdin.write(input)
    pythonProcess.stdin.end()

    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString()
    })

    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        console.error('Python script error:', stderr)
        resolve(NextResponse.json({
          success: false,
          error: 'Python script failed',
          details: stderr,
          code
        }, { status: 500 }))
        return
      }

      try {
        // Try to parse JSON output
        const lines = stdout.trim().split('\n')
        let jsonOutput = ''
        let inJson = false
        
        for (const line of lines) {
          if (line.trim().startsWith('{') || line.trim().startsWith('[')) {
            inJson = true
          }
          if (inJson) {
            jsonOutput += line + '\n'
          }
          if (line.trim().endsWith('}') || line.trim().endsWith(']')) {
            break
          }
        }

        const result = jsonOutput ? JSON.parse(jsonOutput) : { signals: [] }
        
        resolve(NextResponse.json({
          success: true,
          signals: result.signals || result,
          source: 'python-ml-model',
          timestamp: new Date().toISOString()
        }))
      } catch (parseError) {
        // If not JSON, return raw output
        resolve(NextResponse.json({
          success: true,
          output: stdout,
          raw: true,
          source: 'python-ml-model'
        }))
      }
    })

    pythonProcess.on('error', (error) => {
      console.error('Failed to start Python process:', error)
      resolve(NextResponse.json({
        success: false,
        error: 'Failed to start Python process',
        details: error.message
      }, { status: 500 }))
    })
  })
}

/**
 * Predict with pre-calculated features
 */
async function predictWithFeatures(features: any[]): Promise<NextResponse> {
  // For now, return a message that direct feature prediction needs implementation
  // The Python script expects to fetch its own data
  return NextResponse.json({
    success: false,
    error: 'Direct feature prediction not yet implemented',
    suggestion: 'Use symbols parameter instead to let Python script fetch data and calculate features'
  }, { status: 501 })
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    message: 'ML Predict endpoint - Use POST with symbols or features',
    example: {
      method: 'POST',
      body: {
        symbols: ['AAPL', 'TSLA', 'NVDA']
      }
    }
  })
}




