'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Loader2, Key, Shield, AlertTriangle, Sparkles, ChevronDown, ChevronUp, HelpCircle, ExternalLink } from 'lucide-react'
import Link from 'next/link'

export default function ApiKeysForm() {
  const [loading, setLoading] = useState(false)
  const [loadingKeys, setLoadingKeys] = useState(true)
  const [message, setMessage] = useState<string>('')
  const [isDemo, setIsDemo] = useState(false)
  const [hasExistingKeys, setHasExistingKeys] = useState(false)
  const [showInstructions, setShowInstructions] = useState(false)
  const [apiKeys, setApiKeys] = useState({
    alpacaPaperKey: '',
    alpacaPaperSecret: '',
    alpacaLiveKey: '',
    alpacaLiveSecret: ''
  })

  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    const checkAuthAndLoadKeys = async () => {
      // Check for real session first (not just getUser which might return demo user)
      const { data: { session } } = await supabase.auth.getSession()
      
      let isDemoUser = true
      if (session && session.user && session.user.id !== '00000000-0000-0000-0000-000000000000') {
        // Real authenticated user with valid session
        isDemoUser = false
      } else {
        // Fallback to getUser check
        const { data: { user } } = await supabase.auth.getUser()
        isDemoUser = !user || user.id === '00000000-0000-0000-0000-000000000000'
      }
      
      setIsDemo(isDemoUser)
      
      // Load existing keys if user is authenticated
      if (!isDemoUser) {
        try {
          const response = await fetch('/api/settings/api-keys')
          const result = await response.json()
          
          // Only set hasExistingKeys if there are actually keys saved
          if (result.success && result.data && 
              (result.data.alpaca_paper_key || result.data.alpaca_live_key)) {
            setHasExistingKeys(true)
            // Keys are masked, so we'll just show that they exist
            // Users can update them by entering new values
          } else {
            setHasExistingKeys(false)
          }
        } catch (error) {
          console.error('Error loading existing keys:', error)
          setHasExistingKeys(false)
        }
      }
      setLoadingKeys(false)
    }
    checkAuthAndLoadKeys()
  }, [supabase])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    try {
      if (!apiKeys.alpacaPaperKey || !apiKeys.alpacaPaperSecret) {
        setMessage('Paper trading keys are required')
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
      setHasExistingKeys(true)
      // Optionally reload the page or show success state
    } catch (err: any) {
      setMessage(err.message || 'Failed to save API keys')
    } finally {
      setLoading(false)
    }
  }

  if (loadingKeys) {
    return (
      <Card className="glass-card">
        <CardContent className="py-8">
          <div className="flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
          </div>
        </CardContent>
      </Card>
    )
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
        {isDemo && (
          <Alert className="border-blue-200 bg-blue-50 dark:bg-blue-950 dark:border-blue-800">
            <Sparkles className="h-4 w-4" />
            <AlertTitle>Demo Mode</AlertTitle>
            <AlertDescription>
              You're currently using demo mode with shared API keys.{' '}
              <Link href="/auth" className="underline font-semibold">
                Sign in with Google
              </Link>{' '}
              to use your own Alpaca API keys.
            </AlertDescription>
          </Alert>
        )}
        {hasExistingKeys && !isDemo && (
          <Alert className="border-green-200 bg-green-50 dark:bg-green-950 dark:border-green-800">
            <Shield className="h-4 w-4" />
            <AlertTitle>API Keys Saved</AlertTitle>
            <AlertDescription>
              Your API keys are already saved and encrypted. You can update them below if needed.
            </AlertDescription>
          </Alert>
        )}
        <Alert>
          <Shield className="h-4 w-4" />
          <AlertDescription>
            We use pgcrypto to encrypt keys in `user_settings`. Never share your keys publicly.
          </AlertDescription>
        </Alert>

        {/* Instructions Dropdown */}
        <div className="border border-blue-500/30 rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => setShowInstructions(!showInstructions)}
            className="w-full flex items-center justify-between p-4 bg-blue-500/10 hover:bg-blue-500/20 transition-colors text-left"
          >
            <div className="flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-blue-400" />
              <span className="font-medium text-white">How to get Alpaca API Keys</span>
            </div>
            {showInstructions ? (
              <ChevronUp className="h-5 w-5 text-blue-400" />
            ) : (
              <ChevronDown className="h-5 w-5 text-blue-400" />
            )}
          </button>
          
          {showInstructions && (
            <div className="p-4 bg-blue-500/5 border-t border-blue-500/30 space-y-4">
              <ol className="list-decimal list-inside space-y-3 text-sm text-white/80">
                <li>
                  Go to{' '}
                  <a 
                    href="https://alpaca.markets" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 underline inline-flex items-center gap-1"
                  >
                    alpaca.markets
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </li>
                <li>
                  Once logged in, set up the multi-factor authentication in a third-party app 
                  (you can use apps like Duo, Microsoft Entra, Google, or Apple)
                </li>
                <li>
                  On the bottom right of the account's home page, click <strong className="text-white">"Generate New Keys"</strong>
                </li>
                <li>
                  Copy both the <strong className="text-white">Key</strong> and <strong className="text-white">Secret Key</strong> and paste them into this page
                </li>
                <li>
                  Click <strong className="text-white">"Save API Keys"</strong>
                </li>
              </ol>
              
              <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                <p className="text-sm text-yellow-200">
                  <strong>⚠️ Important:</strong> The Secret Key is only shown once when you generate it. 
                  Make sure to copy it immediately! If you lose it, you'll need to generate a new key pair.
                </p>
              </div>

              <div className="mt-3 p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                <p className="text-sm text-green-200">
                  <strong>💡 Tip:</strong> Start with Paper Trading keys to test the bot risk-free with virtual money. 
                  You can add Live Trading keys later when you're ready to trade with real money.
                </p>
              </div>
            </div>
          )}
        </div>

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
            <h3 className="text-lg font-semibold">News Sentiment</h3>
            <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <p className="text-sm text-blue-900 dark:text-blue-100">
                <strong>ℹ️ News API Key:</strong> The News API key is shared across all users and configured via environment variables. 
                You don't need to provide your own News API key.
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


