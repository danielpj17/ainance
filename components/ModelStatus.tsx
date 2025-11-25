'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, XCircle, AlertCircle, Loader2 } from 'lucide-react'

interface ModelStatus {
  hasRealModel: boolean
  hasMetadata: boolean
  modelFile?: string
  metadataFile?: string
  loading: boolean
}

export default function ModelStatus() {
  const [status, setStatus] = useState<ModelStatus>({
    hasRealModel: false,
    hasMetadata: false,
    loading: true
  })

  useEffect(() => {
    checkModelStatus()
  }, [])

  const checkModelStatus = async () => {
    try {
      const res = await fetch('/api/model/status')
      const data = await res.json()
      
      if (data.success) {
        setStatus({
          hasRealModel: data.hasRealModel || false,
          hasMetadata: data.hasMetadata || false,
          modelFile: data.modelFile,
          metadataFile: data.metadataFile,
          loading: false
        })
      } else {
        setStatus({ hasRealModel: false, hasMetadata: false, loading: false })
      }
    } catch (error) {
      console.error('Error checking model status:', error)
      setStatus({ hasRealModel: false, hasMetadata: false, loading: false })
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
        {status.hasRealModel ? (
          <div className="flex items-center gap-2 text-sm text-green-400">
            <CheckCircle2 className="h-4 w-4" />
            <span>✅ Real ML Model Found: <code className="bg-gray-800 px-1 rounded">{status.modelFile}</code></span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-red-400">
            <XCircle className="h-4 w-4" />
            <span>❌ No Real ML Model Found - Using Rule-Based Predictions</span>
          </div>
        )}
        
        {status.hasMetadata && (
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <AlertCircle className="h-4 w-4" />
            <span>Metadata file exists: <code className="bg-gray-800 px-1 rounded">{status.metadataFile}</code></span>
          </div>
        )}
      </div>
      
      {!status.hasRealModel && (
        <div className="mt-3 p-3 bg-red-950 border border-red-800 rounded text-xs text-red-200">
          <strong>⚠️ Currently using rule-based predictions (not ML).</strong> Train a real model using the Python script to enable ML predictions.
        </div>
      )}
    </div>
  )
}

