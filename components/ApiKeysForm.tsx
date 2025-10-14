'use client'

import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, Key, Shield, AlertTriangle } from 'lucide-react'

export default function ApiKeysForm() {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string>('')
  const [apiKeys, setApiKeys] = useState({
    alpacaPaperKey: '',
    alpacaPaperSecret: '',
    alpacaLiveKey: '',
    alpacaLiveSecret: '',
    newsApiKey: ''
  })

  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    try {
      if (!apiKeys.alpacaPaperKey || !apiKeys.alpacaPaperSecret || !apiKeys.newsApiKey) {
        setMessage('Paper trading keys and NewsAPI key are required')
        return
      }

      const { data: { session } } = await supabase.auth.getSession()

      const response = await fetch('/api/settings/api-keys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify(apiKeys),
      })

      const result = await response.json()
      if (!result.success) {
        throw new Error(result.error || 'Failed to save API keys')
      }

      setMessage('API keys saved successfully')
    } catch (err: any) {
      setMessage(err.message || 'Failed to save API keys')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Key className="h-5 w-5" />
          Trading API Keys
        </CardTitle>
        <CardDescription>
          Your keys are encrypted at rest. Paper keys are required to run the bot in test mode.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Alert>
          <Shield className="h-4 w-4" />
          <AlertDescription>
            We use pgcrypto to encrypt keys in `user_settings`. Never share your keys publicly.
          </AlertDescription>
        </Alert>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Paper Trading (Required)</h3>
              <div>
                <Label htmlFor="alpacaPaperKey">Alpaca Paper API Key</Label>
                <Input id="alpacaPaperKey" value={apiKeys.alpacaPaperKey} onChange={(e) => setApiKeys(p => ({ ...p, alpacaPaperKey: e.target.value }))} placeholder="PK..." />
              </div>
              <div>
                <Label htmlFor="alpacaPaperSecret">Alpaca Paper Secret</Label>
                <Input id="alpacaPaperSecret" type="password" value={apiKeys.alpacaPaperSecret} onChange={(e) => setApiKeys(p => ({ ...p, alpacaPaperSecret: e.target.value }))} placeholder="Secret key" />
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Live Trading (Optional)</h3>
              <div>
                <Label htmlFor="alpacaLiveKey">Alpaca Live API Key</Label>
                <Input id="alpacaLiveKey" value={apiKeys.alpacaLiveKey} onChange={(e) => setApiKeys(p => ({ ...p, alpacaLiveKey: e.target.value }))} placeholder="AK... (optional)" />
              </div>
              <div>
                <Label htmlFor="alpacaLiveSecret">Alpaca Live Secret</Label>
                <Input id="alpacaLiveSecret" type="password" value={apiKeys.alpacaLiveSecret} onChange={(e) => setApiKeys(p => ({ ...p, alpacaLiveSecret: e.target.value }))} placeholder="Secret key (optional)" />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-lg font-semibold">News Sentiment (Required)</h3>
            <div>
              <Label htmlFor="newsApiKey">NewsAPI Key</Label>
              <Input id="newsApiKey" value={apiKeys.newsApiKey} onChange={(e) => setApiKeys(p => ({ ...p, newsApiKey: e.target.value }))} placeholder="Your NewsAPI key" />
              <p className="text-xs text-muted-foreground mt-1">
                Get a free key at <a href="https://newsapi.org" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">newsapi.org</a>
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <Button type="submit" className="flex-1" disabled={loading}>
              {loading ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Saving...</> : 'Save API Keys'}
            </Button>
          </div>
        </form>

        {message && (
          <Alert className={`mt-2 ${message.toLowerCase().includes('fail') ? 'border-red-200 bg-red-50' : 'border-blue-200 bg-blue-50'}`}>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className={message.toLowerCase().includes('fail') ? 'text-red-700' : 'text-blue-700'}>
              {message}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}


