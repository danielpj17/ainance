'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'

export default function TrainModelButton() {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string>('')

  const runTrain = async () => {
    setLoading(true)
    setMessage('')
    try {
      const res = await fetch('/api/model/train', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || 'Training failed')
      }
      const ts = data?.lastTrainedAt || new Date().toISOString()
      setMessage(`Model trained: ${ts}`)
    } catch (e: any) {
      setMessage(e?.message || 'Training failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-3">
      <Button onClick={runTrain} disabled={loading}>
        {loading ? (<><Loader2 className="h-4 w-4 animate-spin mr-2" /> Training...</>) : 'Re-Train Model'}
      </Button>
      {message && <span className="text-xs text-muted-foreground">{message}</span>}
    </div>
  )
}


