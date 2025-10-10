'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, Shield, Key, AlertTriangle } from 'lucide-react'
import { useRouter } from 'next/navigation'

export default function AuthPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [showApiKeys, setShowApiKeys] = useState(false)
  const [apiKeys, setApiKeys] = useState({
    alpacaPaperKey: '',
    alpacaPaperSecret: '',
    alpacaLiveKey: '',
    alpacaLiveSecret: '',
    newsApiKey: ''
  })
  const [currentUser, setCurrentUser] = useState<any>(null)

  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null)
  const router = useRouter()

  useEffect(() => {
    // Check if user is already logged in
    const checkUser = async () => {
      if (!supabaseRef.current) return
      const { data: { user } } = await supabaseRef.current.auth.getUser()
      if (user) {
        setCurrentUser(user)
        router.push('/dashboard')
      }
    }
    supabaseRef.current = createClient()
    checkUser()

    // Listen for auth changes
    const { data: { subscription } } = supabaseRef.current!.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        setCurrentUser(session.user)
        if (!showApiKeys) {
          setShowApiKeys(true)
        }
      } else if (event === 'SIGNED_OUT') {
        setCurrentUser(null)
        setShowApiKeys(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [router, showApiKeys])

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    try {
      if (isSignUp) {
        const { error } = await supabaseRef.current!.auth.signUp({
          email,
          password,
        })
        if (error) throw error
        setMessage('Check your email for the confirmation link!')
      } else {
        const { error } = await supabaseRef.current!.auth.signInWithPassword({
          email,
          password,
        })
        if (error) throw error
        setMessage('Successfully signed in!')
      }
    } catch (error: any) {
      setMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleApiKeysSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    try {
      // Validate required keys
      if (!apiKeys.alpacaPaperKey || !apiKeys.alpacaPaperSecret || !apiKeys.newsApiKey) {
        throw new Error('Paper trading keys and NewsAPI key are required')
      }

      const supabase = createClient()
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

      setMessage('API keys saved successfully! Redirecting to dashboard...')
      setTimeout(() => {
        router.push('/dashboard')
      }, 2000)

    } catch (error: any) {
      setMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  const skipApiKeys = () => {
    setMessage('You can add API keys later in settings. Redirecting to dashboard...')
    setTimeout(() => {
      router.push('/dashboard')
    }, 2000)
  }

  if (showApiKeys && currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <Card className="w-full max-w-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              API Keys Setup
            </CardTitle>
            <CardDescription>
              Configure your trading API keys to enable AI-powered trading. Your keys are encrypted and stored securely.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Alert className="mb-6">
              <Shield className="h-4 w-4" />
              <AlertDescription>
                Your API keys are encrypted using pgcrypto and stored securely. Paper trading keys are safe for testing.
              </AlertDescription>
            </Alert>

            <form onSubmit={handleApiKeysSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Paper Trading Keys */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Paper Trading (Required)</h3>
                  <div>
                    <Label htmlFor="alpacaPaperKey">Alpaca Paper API Key</Label>
                    <Input
                      id="alpacaPaperKey"
                      type="text"
                      placeholder="PK..."
                      value={apiKeys.alpacaPaperKey}
                      onChange={(e) => setApiKeys(prev => ({ ...prev, alpacaPaperKey: e.target.value }))}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="alpacaPaperSecret">Alpaca Paper Secret</Label>
                    <Input
                      id="alpacaPaperSecret"
                      type="password"
                      placeholder="Secret key"
                      value={apiKeys.alpacaPaperSecret}
                      onChange={(e) => setApiKeys(prev => ({ ...prev, alpacaPaperSecret: e.target.value }))}
                      required
                    />
                  </div>
                </div>

                {/* Live Trading Keys */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Live Trading (Optional)</h3>
                  <div>
                    <Label htmlFor="alpacaLiveKey">Alpaca Live API Key</Label>
                    <Input
                      id="alpacaLiveKey"
                      type="text"
                      placeholder="AK... (optional)"
                      value={apiKeys.alpacaLiveKey}
                      onChange={(e) => setApiKeys(prev => ({ ...prev, alpacaLiveKey: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="alpacaLiveSecret">Alpaca Live Secret</Label>
                    <Input
                      id="alpacaLiveSecret"
                      type="password"
                      placeholder="Secret key (optional)"
                      value={apiKeys.alpacaLiveSecret}
                      onChange={(e) => setApiKeys(prev => ({ ...prev, alpacaLiveSecret: e.target.value }))}
                    />
                  </div>
                </div>
              </div>

              {/* News API */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">News Sentiment (Required)</h3>
                <div>
                  <Label htmlFor="newsApiKey">NewsAPI Key</Label>
                  <Input
                    id="newsApiKey"
                    type="text"
                    placeholder="Your NewsAPI key"
                    value={apiKeys.newsApiKey}
                    onChange={(e) => setApiKeys(prev => ({ ...prev, newsApiKey: e.target.value }))}
                    required
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Get your free key at <a href="https://newsapi.org" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">newsapi.org</a>
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <Button
                  type="submit"
                  className="flex-1"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Saving...
                    </>
                  ) : (
                    'Save API Keys & Continue'
                  )}
                </Button>
                
                <Button
                  type="button"
                  variant="outline"
                  onClick={skipApiKeys}
                  disabled={loading}
                >
                  Skip for Now
                </Button>
              </div>
            </form>
            
            {message && (
              <Alert className={`mt-4 ${message.includes('error') ? 'border-red-200 bg-red-50' : 'border-blue-200 bg-blue-50'}`}>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className={message.includes('error') ? 'text-red-700' : 'text-blue-700'}>
                  {message}
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-center">Welcome to Ainance</CardTitle>
          <CardDescription className="text-center">
            {isSignUp ? 'Create your account' : 'Sign in to your account'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAuth} className="space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Loading...
                </>
              ) : (
                isSignUp ? 'Sign Up' : 'Sign In'
              )}
            </Button>
          </form>
          
          {message && (
            <Alert className={`mt-4 ${message.includes('error') ? 'border-red-200 bg-red-50' : 'border-blue-200 bg-blue-50'}`}>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className={message.includes('error') ? 'text-red-700' : 'text-blue-700'}>
                {message}
              </AlertDescription>
            </Alert>
          )}
          
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => setIsSignUp(!isSignUp)}
              className="text-sm text-blue-600 hover:text-blue-500"
            >
              {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
