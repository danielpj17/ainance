'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, XCircle, AlertCircle, Loader2, Zap } from 'lucide-react'

interface ModelStatus {
  hasRealModel: boolean
  isActive: boolean
  hasMetadata: boolean
  modelFile?: string
  metadataFile?: string
  mlServiceActive?: boolean
  mlServiceUrl?: string
  modelLocation?: string
  loading: boolean
}

export default function ModelStatus() {
  const [status, setStatus] = useState<ModelStatus>({
    hasRealModel: false,
    isActive: false,
    hasMetadata: false,
    loading: true
  })

  useEffect(() => {
    checkModelStatus()
    // Refresh status every 30 seconds
    const interval = setInterval(checkModelStatus, 30000)
    return () => clearInterval(interval)
  }, [])

  const checkModelStatus = async () => {
    try {
      const res = await fetch('/api/model/status')
      const data = await res.json()
      
      if (data.success) {
        setStatus({
          hasRealModel: data.hasRealModel || false,
          isActive: data.isActive || false,
          hasMetadata: data.hasMetadata || false,
          modelFile: data.modelFile,
          metadataFile: data.metadataFile,
          mlServiceActive: data.mlServiceActive,
          mlServiceUrl: data.mlServiceUrl,
          modelLocation: data.modelLocation,
          loading: false
        })
      } else {
        setStatus({ hasRealModel: false, isActive: false, hasMetadata: false, loading: false })
      }
    } catch (error) {
      console.error('Error checking model status:', error)
      setStatus({ hasRealModel: false, isActive: false, hasMetadata: false, loading: false })
    }
  }

  if (status.loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        Checking model status...
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <h4 className="font-medium text-sm mb-2">Model Status:</h4>
      <div className="space-y-2">
        {status.isActive ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-green-400">
              <CheckCircle2 className="h-4 w-4" />
              <span>✅ ML Model Active: <code className="bg-gray-800 px-1 rounded">{status.modelFile || 'scalping_model_v2.pkl'}</code></span>
            </div>
            {status.mlServiceActive && (
              <div className="flex items-center gap-2 text-sm text-green-300">
                <Zap className="h-4 w-4" />
                <span>ML Service Running: <code className="bg-gray-800 px-1 rounded text-xs">{status.mlServiceUrl}</code></span>
              </div>
            )}
            {status.modelLocation && (
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <AlertCircle className="h-4 w-4" />
                <span>Model Location: <code className="bg-gray-800 px-1 rounded">{status.modelLocation}</code></span>
              </div>
            )}
            <div className="mt-3 p-3 bg-green-950 border border-green-800 rounded text-xs text-green-200">
              <strong>✅ Currently using ML predictions.</strong> The trading bot is actively using the trained Random Forest model for all trading decisions.
            </div>
          </div>
        ) : status.hasRealModel ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-yellow-400">
              <AlertCircle className="h-4 w-4" />
              <span>⚠️ ML Model Found but Not Active: <code className="bg-gray-800 px-1 rounded">{status.modelFile}</code></span>
            </div>
            <div className="mt-3 p-3 bg-yellow-950 border border-yellow-800 rounded text-xs text-yellow-200">
              <strong>⚠️ Model file exists but service is not accessible.</strong> Check your ML_SERVICE_URL environment variable or ensure the ML service is running.
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-red-400">
              <XCircle className="h-4 w-4" />
              <span>❌ No ML Model Found</span>
            </div>
            <div className="mt-3 p-3 bg-red-950 border border-red-800 rounded text-xs text-red-200">
              <strong>⚠️ ML model not found.</strong> Train the model using the Python script to enable ML predictions. The bot will use rule-based predictions until a model is trained.
            </div>
          </div>
        )}
        
        {status.hasMetadata && (
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <AlertCircle className="h-4 w-4" />
            <span>Metadata file: <code className="bg-gray-800 px-1 rounded">{status.metadataFile}</code></span>
          </div>
        )}
      </div>
    </div>
  )
}

