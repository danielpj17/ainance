'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import ApiKeysForm from '@/components/ApiKeysForm'
import StrategySettings from '@/components/StrategySettings'
import TrainModelButton from '@/components/TrainModelButton'
import ModelStatus from '@/components/ModelStatus'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Settings, Key, TrendingUp, Brain, Sparkles, FlaskConical, User, LogOut } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import Link from 'next/link'

// Ensure this page is rendered dynamically, not statically
export const dynamic = 'force-dynamic'

export default function SettingsPage() {
  const router = useRouter()
  const [isDemo, setIsDemo] = useState(false)
  const [userName, setUserName] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [userAvatar, setUserAvatar] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    const checkAuth = async () => {
      // Check for real session first (not just getUser which might return demo user)
      const { data: { session } } = await supabase.auth.getSession()
      
      let isDemoUser = true
      if (session && session.user && session.user.id !== '00000000-0000-0000-0000-000000000000') {
        // Real authenticated user with valid session
        isDemoUser = false
        setUserName(session.user.user_metadata?.full_name || session.user.user_metadata?.name || null)
        setUserEmail(session.user.email || null)
        setUserAvatar(session.user.user_metadata?.avatar_url || session.user.user_metadata?.picture || null)
      } else {
        // Fallback to getUser check
        const { data: { user } } = await supabase.auth.getUser()
        isDemoUser = !user || user.id === '00000000-0000-0000-0000-000000000000'
        if (user && user.id !== '00000000-0000-0000-0000-000000000000') {
          setUserName(user.user_metadata?.full_name || user.user_metadata?.name || null)
          setUserEmail(user.email || null)
          setUserAvatar(user.user_metadata?.avatar_url || user.user_metadata?.picture || null)
        }
      }
      
      setIsDemo(isDemoUser)
    }
    checkAuth()
  }, [supabase])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/auth')
  }
  return (
    <div className="min-h-screen text-white pl-20">
      <div className="container mx-auto px-6 py-8 max-w-6xl">
        <div className="mb-8">
          <h1 className="text-4xl font-bold flex items-center gap-3 mb-2">
            <Settings className="h-8 w-8 text-purple-500" />
            Settings
          </h1>
          <p className="text-white/80">
            Configure your API keys and trading strategy parameters
          </p>
        </div>

        {isDemo && (
          <Alert className="mb-6 border-blue-200 bg-blue-50 dark:bg-blue-950 dark:border-blue-800">
            <Sparkles className="h-4 w-4" />
            <AlertTitle>Demo Mode Active</AlertTitle>
            <AlertDescription>
              You're currently using demo mode with shared API keys. To use your own Alpaca API keys,{' '}
              <Link href="/auth" className="underline font-semibold">
                sign in with Google
              </Link>.
            </AlertDescription>
          </Alert>
        )}

        <Tabs defaultValue="account" className="space-y-6">
          <TabsList className="glass-card">
            <TabsTrigger value="account" className="flex items-center gap-2">
              <User className="h-4 w-4" />
              Account
            </TabsTrigger>
            <TabsTrigger value="api-keys" className="flex items-center gap-2">
              <Key className="h-4 w-4" />
              API Keys
            </TabsTrigger>
            <TabsTrigger value="strategy" className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Strategy Settings
            </TabsTrigger>
            <TabsTrigger value="model" className="flex items-center gap-2">
              <Brain className="h-4 w-4" />
              AI Model
            </TabsTrigger>
          </TabsList>

          <TabsContent value="account" className="space-y-6">
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5 text-blue-500" />
                  Account Details
                </CardTitle>
                <CardDescription>
                  Your account information and session management
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {isDemo ? (
                  <div className="text-center py-8">
                    <div className="w-20 h-20 rounded-full bg-blue-500/20 border-2 border-blue-400 flex items-center justify-center mx-auto mb-4">
                      <Sparkles className="h-10 w-10 text-blue-400" />
                    </div>
                    <h3 className="text-xl font-semibold text-white mb-2">Demo Mode</h3>
                    <p className="text-white/70 mb-6">
                      You're using the app in demo mode with shared API keys.
                    </p>
                    <Link href="/auth">
                      <Button className="bg-blue-600 hover:bg-blue-700">
                        Sign in with Google
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-4 flex-wrap">
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        {userAvatar ? (
                          <img 
                            src={userAvatar} 
                            alt="Profile" 
                            className="w-16 h-16 rounded-full border-2 border-blue-400 flex-shrink-0"
                          />
                        ) : (
                          <div className="w-16 h-16 rounded-full bg-blue-500/20 border-2 border-blue-400 flex items-center justify-center flex-shrink-0">
                            <User className="h-8 w-8 text-blue-400" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <h3 className="text-xl font-semibold text-white">{userName || 'User'}</h3>
                          <p className="text-white/70 truncate">{userEmail || 'No email'}</p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2 px-3 py-2 bg-green-500/10 rounded-lg border border-green-500/30 flex-shrink-0">
                        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                        <div>
                          <p className="text-green-400 font-medium text-sm">Signed In</p>
                          <p className="text-xs text-white/60">Google</p>
                        </div>
                      </div>
                    </div>

                    <div className="pt-4 border-t border-gray-700">
                      <Button 
                        onClick={handleLogout}
                        variant="destructive"
                        className="w-full bg-red-600 hover:bg-red-700"
                      >
                        <LogOut className="mr-2 h-4 w-4" />
                        Sign Out
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="api-keys" className="space-y-6">
            <ApiKeysForm />
          </TabsContent>

          <TabsContent value="strategy" className="space-y-6">
            <StrategySettings mode="paper" />
          </TabsContent>

          <TabsContent value="model" className="space-y-6">
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Brain className="h-5 w-5 text-purple-500" />
                  Random Forest Trading Model
                </CardTitle>
                <CardDescription>
                  Train the AI model that generates trading signals
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                  <p className="text-sm text-blue-900 dark:text-blue-100 font-semibold mb-2">
                    ℹ️ ML Model Status
                  </p>
                  <p className="text-sm text-blue-800 dark:text-blue-200">
                    The trading bot is currently using a <strong>trained Random Forest ML model</strong> (scalping_model_v2.pkl) 
                    for all trading predictions. The model uses technical indicators, news sentiment, and market data to generate 
                    buy/sell signals with confidence scores.
                  </p>
                </div>

                <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-4">
                  <p className="text-sm text-green-900 dark:text-green-100 font-semibold mb-2">
                    ✅ Model Information:
                  </p>
                  <ul className="text-sm text-green-800 dark:text-green-200 list-disc list-inside space-y-1">
                    <li><strong>Model Type:</strong> Random Forest Classifier</li>
                    <li><strong>Model File:</strong> <code className="bg-gray-800 px-1 rounded">scalping_model_v2.pkl</code></li>
                    <li><strong>Test Accuracy:</strong> 60.72%</li>
                    <li><strong>Train Accuracy:</strong> 76.44%</li>
                    <li><strong>Status:</strong> Active and in use by trading bot</li>
                  </ul>
                </div>

                <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                  <p className="text-sm text-gray-900 dark:text-gray-100 font-semibold mb-2">
                    🔄 To Re-Train the Model:
                  </p>
                  <ol className="text-sm text-gray-800 dark:text-gray-200 list-decimal list-inside space-y-2">
                    <li>Install Python dependencies: <code className="bg-gray-800 px-1 rounded">pip install -r python-functions/requirements.txt</code></li>
                    <li>Set environment variables: <code className="bg-gray-800 px-1 rounded">SUPABASE_URL</code> and <code className="bg-gray-800 px-1 rounded">SUPABASE_SERVICE_ROLE_KEY</code></li>
                    <li>Run the training script: <code className="bg-gray-800 px-1 rounded">python python-functions/model/train_with_real_data.py</code></li>
                    <li>This will fetch 5 years of historical data from Alpaca, train a new Random Forest model, and save it as <code className="bg-gray-800 px-1 rounded">scalping_model_v2.pkl</code></li>
                    <li>The trading bot will automatically use the newly trained model once it's available</li>
                  </ol>
                </div>
                
                <div className="space-y-2">
                  <h4 className="font-medium">Model Features:</h4>
                  <ul className="text-sm text-gray-600 dark:text-gray-400 list-disc list-inside space-y-1">
                    <li>RSI (Relative Strength Index)</li>
                    <li>MACD (Moving Average Convergence Divergence)</li>
                    <li>Bollinger Band Width</li>
                    <li>Volume Ratio</li>
                    <li>News Sentiment Score</li>
                    <li>EMA Trend</li>
                  </ul>
                </div>

                <div className="pt-4 border-t border-gray-700">
                  <ModelStatus />
                </div>

                <div className="pt-4 border-t border-gray-700">
                  <p className="text-xs text-gray-500 mb-2">Metadata Update Only (Not Real Training):</p>
                  <TrainModelButton />
                </div>
              </CardContent>
            </Card>

            {/* ML Testing Card */}
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FlaskConical className="h-5 w-5 text-blue-500" />
                  ML Model Testing
                </CardTitle>
                <CardDescription>
                  Test your trained model with real-time stock predictions
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-white/70 mb-4">
                  Enter stock symbols and get real ML predictions from your trained Random Forest model. 
                  View confidence scores, technical indicators, and AI reasoning for each prediction.
                </p>
                <Link href="/test-ml">
                  <Button className="w-full bg-blue-600 hover:bg-blue-700">
                    <FlaskConical className="mr-2 h-4 w-4" />
                    Open ML Testing
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

