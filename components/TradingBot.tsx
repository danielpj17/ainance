'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Play, Square, Activity, AlertTriangle, CheckCircle, XCircle, Info } from 'lucide-react'

export interface BotStatus {
  isRunning: boolean
  lastRun: string | null
  totalTrades: number
  activePositions: number
  currentSignals: Array<{
    symbol: string
    action: 'buy' | 'sell' | 'hold'
    confidence: number
    price: number
    timestamp: string
    reasoning: string
    news_sentiment?: number
    market_risk?: number
    vix?: number
    data_timestamp?: string
    market_open?: boolean
  }>
  error?: string
  marketOpen?: boolean
  nextMarketOpen?: string
  alwaysOn?: boolean
}

export interface BotConfig {
  symbols: string[]
  interval: number
  settings: {
    strategy: 'cash' | '25k_plus'
    account_type: 'cash' | 'margin'
    confidence_threshold?: number
    max_exposure?: number
  }
  accountType: string
  strategy: string
}

interface TradingBotProps {
  mode: 'paper' | 'live'
}

export default function TradingBot({ mode }: TradingBotProps) {
  const [botStatus, setBotStatus] = useState<BotStatus | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isMarketOpen, setIsMarketOpen] = useState(true) // Default to true
  const requestInProgressRef = useRef(false) // Track if a request is in progress
  const [showDiagnostics, setShowDiagnostics] = useState(false)
  const [diagnostics, setDiagnostics] = useState<any>(null)
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false)
  const [config, setConfig] = useState<BotConfig>({
    symbols: ['AAPL', 'MSFT', 'TSLA', 'SPY'],
    interval: 10, // 10 seconds
    settings: {
      strategy: mode === 'paper' ? 'cash' : '25k_plus',
      account_type: 'cash',
      max_exposure: 90
    },
    accountType: mode,
    strategy: mode === 'paper' ? 'cash' : '25k_plus'
  })
  
  // Check market hours
  const checkMarketHours = () => {
    const now = new Date()
    const et = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}))
    const day = et.getDay()
    const hours = et.getHours()
    const minutes = et.getMinutes()
    
    // Market closed on weekends
    if (day === 0 || day === 6) return false
    
    // Market open 9:30 AM - 4:00 PM ET
    const currentMinutes = hours * 60 + minutes
    const marketOpen = 9 * 60 + 30 // 9:30 AM
    const marketClose = 16 * 60 // 4:00 PM
    
    return currentMinutes >= marketOpen && currentMinutes < marketClose
  }

  // Fetch diagnostics
  const fetchDiagnostics = async () => {
    if (!botStatus?.isRunning) {
      console.log('📊 Diagnostics: Bot not running, skipping fetch')
      return
    }
    
    setDiagnosticsLoading(true)
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      const response = await fetch('/api/trading/diagnostics', {
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
      })
      
      if (!response.ok) {
        console.error('❌ Diagnostics API error:', response.status, response.statusText)
        const errorText = await response.text()
        console.error('Error response:', errorText)
        return
      }
      
      const data = await response.json()
      console.log('📊 Diagnostics fetched:', { 
        success: data.success, 
        diagnosticsCount: data.diagnostics?.length || 0,
        hasBotState: !!data.botState 
      })
      
      if (data.success) {
        setDiagnostics(data)
        if (data.diagnostics && data.diagnostics.length === 0) {
          console.log('⚠️  No diagnostics available - bot may not have executed trading loop yet')
        }
      } else {
        console.error('❌ Diagnostics fetch failed:', data.error)
      }
    } catch (error) {
      console.error('❌ Error fetching diagnostics:', error)
    } finally {
      setDiagnosticsLoading(false)
    }
  }

  // Fetch bot status on component mount
  useEffect(() => {
    fetchBotStatus()
    
    // Check market hours on mount and every minute
    setIsMarketOpen(checkMarketHours())
    const marketCheckInterval = setInterval(() => {
      setIsMarketOpen(checkMarketHours())
    }, 60000) // Check every minute
    
    // Set up polling for bot status
    const statusInterval = setInterval(fetchBotStatus, 5000) // Poll every 5 seconds
    
    // Health check: ensures bot keeps running during market hours
    // Note: Health check doesn't require authentication (uses service role internally)
    const healthCheck = async () => {
      try {
        console.log('🔄 Running health check...')
        // Health check doesn't need auth - it uses service role internally
        const response = await fetch('/api/trading/health-check')
        
        if (!response.ok) {
          console.error('❌ Health check failed:', response.status, response.statusText)
          const errorText = await response.text().catch(() => '')
          console.error('Error response:', errorText)
          return
        }
        
        const data = await response.json()
        console.log('📊 Health check response:', { 
          success: data.success, 
          message: data.message,
          executed: data.executed,
          total: data.total,
          restarted: data.restarted
        })
        
        if (data.success && data.restarted) {
          console.log('✅ Bot was restarted by health check')
          // Refresh status after restart
          setTimeout(fetchBotStatus, 1000)
        }
        
        // If health check executed trading loops, refresh diagnostics
        if (data.success && data.executed > 0) {
          console.log(`✅ Health check executed ${data.executed} trading loop(s)`)
          setTimeout(() => fetchDiagnostics(), 3000) // Wait 3 seconds for logs to be written
        } else if (data.success && data.executed === 0 && data.total > 0) {
          console.log('⚠️  Health check found bots but executed 0 loops - check logs for errors')
        }
      } catch (error) {
        console.error('❌ Health check error:', error)
      }
    }
    
    // Run health check every 60 seconds to ensure bot stays running
    // This executes the trading loop directly, keeping the bot alive even if server restarts
    // More frequent than 30 seconds to ensure continuous operation
    const healthCheckInterval = setInterval(healthCheck, 60000) // Every 60 seconds
    
    // Auto-start check: if always-on is enabled and market is open, try to start bot
    const autoStartCheck = async () => {
      try {
        const supabase = createClient()
        const { data: { session } } = await supabase.auth.getSession()
        
        // Call auto-start API (this will start all always-on bots if market is open)
        if (session?.access_token) {
          fetch('/api/trading/auto-start', {
            headers: { Authorization: `Bearer ${session.access_token}` }
          }).catch(err => console.log('Auto-start check failed (this is normal):', err))
        }
      } catch (error) {
        // Silently fail - this is just a convenience check
        console.log('Auto-start check error (this is normal):', error)
      }
    }
    
    // Run auto-start check once on mount (with delay to let status load first)
    setTimeout(autoStartCheck, 2000)
    
    return () => {
      clearInterval(marketCheckInterval)
      clearInterval(statusInterval)
      clearInterval(healthCheckInterval)
    }
  }, [])
  
  // Fetch diagnostics when bot is running
  useEffect(() => {
    if (!botStatus?.isRunning) return
    
    fetchDiagnostics()
    const diagnosticsInterval = setInterval(fetchDiagnostics, 30000) // Every 30 seconds
    
    return () => {
      clearInterval(diagnosticsInterval)
    }
  }, [botStatus?.isRunning])

  const fetchBotStatus = async () => {
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      const response = await fetch('/api/trading', {
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
      })
      const data = await response.json()
      
      if (data.success) {
        // Only update if we got valid status data
        if (data.status) {
          console.log('📊 Bot status fetched:', { 
            isRunning: data.status.isRunning, 
            alwaysOn: data.status.alwaysOn,
            lastRun: data.status.lastRun,
            error: data.status.error 
          })
          // If bot was just started and status shows it's not running, 
          // it might be a timing issue - don't overwrite optimistic update immediately
          const wasJustStarted = botStatus?.isRunning && !data.status.isRunning
          // If always-on was just toggled, don't overwrite immediately
          // Only check for changes if botStatus already exists (not on first load)
          const alwaysOnChanged = botStatus && botStatus.alwaysOn !== undefined && botStatus.alwaysOn !== data.status.alwaysOn
          
          if (wasJustStarted) {
            console.log('⚠️  Status shows bot not running, but it was just started - might be timing issue')
            // Wait a bit longer before updating
            setTimeout(() => {
              setBotStatus(data.status)
            }, 1000)
          } else if (alwaysOnChanged) {
            // Always-on was just toggled, wait a bit to ensure database is updated
            console.log('⚠️  Always-on status changed, waiting before updating:', {
              prev: botStatus?.alwaysOn,
              new: data.status.alwaysOn
            })
            setTimeout(() => {
              setBotStatus(data.status)
            }, 1500)
          } else {
            setBotStatus(data.status)
          }
          setError(null)
        }
      } else {
        // Don't overwrite error state if we're just polling
        if (data.error && !botStatus?.isRunning) {
          setError(data.error)
        }
      }
    } catch (error) {
      console.error('Error fetching bot status:', error)
      // Don't set error on fetch failure during polling - it's not critical
      if (!botStatus?.isRunning) {
        setError('Failed to fetch bot status')
      }
    }
  }

  const startBot = async () => {
    // Prevent duplicate requests
    if (requestInProgressRef.current || isLoading) {
      console.log('⚠️ Start bot request already in progress, ignoring duplicate click')
      return
    }
    
    requestInProgressRef.current = true
    setIsLoading(true)
    setError(null)
    
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      
      let response: Response
      try {
        response = await fetch('/api/trading', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
          },
          body: JSON.stringify({
            action: 'start',
            config
          })
        })
      } catch (fetchError: any) {
        console.error('Network error during fetch:', fetchError)
        setError(`Network error: ${fetchError.message || 'Failed to connect to server. Please check your connection and try again.'}`)
        setIsLoading(false)
        return
      }
      
      // Check if response is ok before parsing JSON
      if (!response.ok) {
        let errorMessage = `Server error: ${response.status} ${response.statusText}`
        try {
          const errorData = await response.json()
          errorMessage = errorData.error || errorMessage
        } catch {
          // If we can't parse JSON, use the status text
          errorMessage = `Server error: ${response.status} ${response.statusText}`
        }
        setError(errorMessage)
        setIsLoading(false)
        return
      }
      
      let data
      try {
        data = await response.json()
        console.log('Start bot response:', data)
      } catch (parseError) {
        console.error('Error parsing response:', parseError)
        setError('Invalid response from server. Please try again.')
        setIsLoading(false)
        return
      }
      
      if (data.success) {
        console.log('✅ Bot start successful, updating state...')
        // Update state optimistically
        setBotStatus(prev => prev ? { ...prev, isRunning: true, error: undefined } : null)
        // Refresh status after a longer delay to ensure database is fully updated
        // Also give the serverless function time to complete the database write
        setTimeout(async () => {
          console.log('🔄 Refreshing bot status after start...')
          await fetchBotStatus()
        }, 2000) // Increased to 2 seconds to allow database write to complete
      } else {
        const errorMsg = data.error || 'Failed to start trading bot'
        console.error('❌ Bot start failed:', errorMsg)
        setError(errorMsg)
      }
    } catch (error: any) {
      console.error('Error starting bot:', error)
      setError(error?.message || 'Failed to start trading bot. Please try again.')
    } finally {
      setIsLoading(false)
      requestInProgressRef.current = false
    }
  }

  const stopBot = async () => {
    setIsLoading(true)
    setError(null)
    
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      const response = await fetch('/api/trading', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          action: 'stop'
        })
      })
      
      const data = await response.json()
      
      if (data.success) {
        setBotStatus(prev => prev ? { ...prev, isRunning: false, error: undefined } : null)
        await fetchBotStatus() // Refresh status
      } else {
        setError(data.error)
      }
    } catch (error) {
      console.error('Error stopping bot:', error)
      setError('Failed to stop trading bot')
    } finally {
      setIsLoading(false)
    }
  }

  const toggleAlwaysOn = async () => {
    // Prevent duplicate requests
    if (requestInProgressRef.current || isLoading) {
      console.log('⚠️ Toggle always-on request already in progress, ignoring duplicate click')
      return
    }
    
    requestInProgressRef.current = true
    setIsLoading(true)
    setError(null)
    
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      const newAlwaysOn = !botStatus?.alwaysOn
      
      let response: Response
      try {
        response = await fetch('/api/trading', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
          },
          body: JSON.stringify({
            action: 'toggle-always-on',
            alwaysOn: newAlwaysOn
          })
        })
      } catch (fetchError: any) {
        console.error('Network error during fetch:', fetchError)
        setError(`Network error: ${fetchError.message || 'Failed to connect to server. Please check your connection and try again.'}`)
        setIsLoading(false)
        return
      }
      
      // Check if response is ok before parsing JSON
      if (!response.ok) {
        let errorMessage = `Server error: ${response.status} ${response.statusText}`
        try {
          const errorData = await response.json()
          errorMessage = errorData.error || errorMessage
        } catch {
          // If we can't parse JSON, use the status text
          errorMessage = `Server error: ${response.status} ${response.statusText}`
        }
        setError(errorMessage)
        setIsLoading(false)
        return
      }
      
      let data
      try {
        data = await response.json()
      } catch (parseError) {
        console.error('Error parsing response:', parseError)
        setError('Invalid response from server. Please try again.')
        setIsLoading(false)
        return
      }
      
      if (data.success) {
        console.log('✅ Always-on toggle successful:', { 
          requested: newAlwaysOn, 
          returned: data.alwaysOn,
          message: data.message 
        })
        // Update state immediately with the new value from the response
        const updatedAlwaysOn = data.alwaysOn !== undefined ? data.alwaysOn : newAlwaysOn
        console.log('🔄 Updating state with alwaysOn:', updatedAlwaysOn)
        setBotStatus(prev => {
          const updated = prev ? { ...prev, alwaysOn: updatedAlwaysOn } : null
          console.log('📊 State updated:', { prev: prev?.alwaysOn, new: updated?.alwaysOn })
          return updated
        })
        // Refresh status after a delay to ensure database is updated
        setTimeout(() => {
          console.log('🔄 Refreshing bot status after toggle...')
          fetchBotStatus()
        }, 2000) // Increased to 2 seconds to allow database write to complete
      } else {
        const errorMsg = data.error || 'Failed to toggle always-on mode'
        console.error('❌ Always-on toggle failed:', errorMsg)
        setError(errorMsg)
      }
    } catch (error: any) {
      console.error('Error toggling always-on:', error)
      setError(error?.message || 'Failed to toggle always-on mode. Please try again.')
    } finally {
      setIsLoading(false)
      requestInProgressRef.current = false
    }
  }

  const generateTestSignals = async () => {
    setIsLoading(true)
    setError(null)
    
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      const response = await fetch('/api/test-signals', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          symbols: config.symbols
        })
      })
      
      const data = await response.json()
      
      if (data.success) {
        await fetchBotStatus() // Refresh status to show new signals
      } else {
        setError(data.error)
      }
    } catch (error) {
      console.error('Error generating test signals:', error)
      setError('Failed to generate test signals')
    } finally {
      setIsLoading(false)
    }
  }

  const formatTime = (timestamp: string | null) => {
    if (!timestamp) return 'Never'
    return new Date(timestamp).toLocaleTimeString()
  }

  const getStatusIcon = () => {
    if (!botStatus) return <Activity className="h-4 w-4" />
    if (botStatus.isRunning) return <CheckCircle className="h-4 w-4 text-blue-500" />
    return <XCircle className="h-4 w-4 text-gray-500" />
  }

  const getStatusBadge = () => {
    if (!botStatus) return <Badge variant="secondary">Unknown</Badge>
    if (botStatus.isRunning) return <Badge className="bg-blue-500">Running</Badge>
    return <Badge variant="secondary">Stopped</Badge>
  }

  return (
    <div className="space-y-6">
      {/* Bot Status Card */}
      <Card className="glass-card">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {getStatusIcon()}
              <CardTitle className="text-white">
                Trading Bot Status - {mode === 'paper' ? 'Paper Trading' : 'Live Trading'}
              </CardTitle>
            </div>
            {getStatusBadge()}
          </div>
          <CardDescription className="text-gray-400">
            Automated trading bot using Random Forest ML model with real-time technical indicators
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          
          {botStatus?.error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>Bot Error: {botStatus.error}</AlertDescription>
            </Alert>
          )}

          {/* Bot Statistics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-white">{botStatus?.totalTrades || 0}</div>
              <div className="text-sm text-gray-400">Total Trades</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-white">{botStatus?.activePositions || 0}</div>
              <div className="text-sm text-gray-400">Active Positions</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-white">{botStatus?.currentSignals.length || 0}</div>
              <div className="text-sm text-gray-400">Current Signals</div>
            </div>
            <div className="text-center">
              <div className="text-sm font-medium text-white">{formatTime(botStatus?.lastRun || null)}</div>
              <div className="text-sm text-gray-400">Last Run</div>
            </div>
          </div>

          {/* Bot Configuration */}
          <div className="p-4 rounded-lg bg-blue-500/10 backdrop-blur-sm border border-blue-500/20">
            <h4 className="font-medium mb-2 text-white">Bot Configuration</h4>
            <div className="grid grid-cols-2 gap-2 text-sm text-gray-300">
              <div>Symbols: {config.symbols.join(', ')}</div>
              <div>Interval: {config.interval}s</div>
              <div>Strategy: {config.settings.strategy}</div>
              <div>Account: {config.settings.account_type}</div>
              <div className="col-span-2">Mode: Market Hours (9:30 AM - 4:00 PM ET)</div>
            </div>
            <div className="mt-2 text-xs text-gray-400">
              Bot runs continuously during market hours. Signals are generated by your trained Random Forest ML model deployed on Google Cloud Run.
            </div>
            {botStatus?.alwaysOn && (
              <div className="mt-2 p-2 rounded bg-green-500/20 border border-green-500/30">
                <div className="text-sm text-green-400 font-medium">✓ Always-On Mode Active</div>
                <div className="text-xs text-green-300/80 mt-1">
                  Bot will automatically start when market opens and persist across server restarts.
                </div>
              </div>
            )}
          </div>

          {/* Control Buttons */}
          <div className="flex gap-2 flex-wrap">
            {!botStatus?.isRunning ? (
              <Button 
                onClick={startBot} 
                disabled={isLoading}
                className="flex items-center gap-2"
              >
                <Play className="h-4 w-4" />
                {isLoading ? 'Starting...' : 'Start Bot'}
              </Button>
            ) : (
              <Button 
                onClick={stopBot} 
                disabled={isLoading}
                variant="destructive"
                className="flex items-center gap-2"
              >
                <Square className="h-4 w-4" />
                {isLoading ? 'Stopping...' : 'Stop Bot'}
              </Button>
            )}
            
            {/* Always-On Toggle */}
            <Button
              onClick={toggleAlwaysOn}
              disabled={isLoading}
              variant={botStatus?.alwaysOn ? "default" : "outline"}
              className={`flex items-center gap-2 ${
                botStatus?.alwaysOn 
                  ? "bg-green-600 hover:bg-green-700 text-white" 
                  : "border-gray-600 text-gray-300 hover:bg-gray-800"
              }`}
            >
              <Activity className="h-4 w-4" />
              {botStatus?.alwaysOn ? 'Always-On: Enabled' : 'Always-On: Disabled'}
            </Button>
            
            {/* Test Signals Button (for when market is closed) */}
            <Button 
              onClick={generateTestSignals} 
              disabled={isLoading || botStatus?.isRunning}
              variant="outline"
              className="flex items-center gap-2"
            >
              <Activity className="h-4 w-4" />
              {isLoading ? 'Generating...' : 'Test Signals'}
            </Button>
            
            {/* Diagnostics Button */}
            {botStatus?.isRunning && (
              <Button 
                onClick={() => {
                  setShowDiagnostics(!showDiagnostics)
                  if (!showDiagnostics && !diagnostics) {
                    fetchDiagnostics()
                  }
                }}
                variant="outline"
                className="flex items-center gap-2"
              >
                <Info className="h-4 w-4" />
                {showDiagnostics ? 'Hide' : 'Show'} Diagnostics
              </Button>
            )}
          </div>
          
          {/* Diagnostics Panel */}
          {showDiagnostics && botStatus?.isRunning && (
            <div className="mt-4 p-4 rounded-lg bg-gray-900/50 border border-gray-700">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium text-white flex items-center gap-2">
                  <Info className="h-4 w-4" />
                  Bot Activity & Diagnostics
                </h4>
                {diagnosticsLoading && (
                  <div className="text-xs text-gray-400">Loading...</div>
                )}
              </div>
              
              {diagnostics && diagnostics.diagnostics && diagnostics.diagnostics.length > 0 ? (
                <div className="space-y-3">
                  {diagnostics.diagnostics.slice(0, 3).map((diag: any, idx: number) => (
                    <div key={idx} className="p-3 bg-gray-800/50 rounded border border-gray-700">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-sm font-medium text-white">
                          {new Date(diag.timestamp).toLocaleString()}
                        </div>
                        <Badge variant={diag.action === 'execute' ? 'default' : diag.action === 'error' ? 'destructive' : 'secondary'}>
                          {diag.action}
                        </Badge>
                      </div>
                      
                      {diag.diagnostics && (
                        <div className="text-xs text-gray-300 space-y-1 mt-2">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <span className="text-gray-400">ML Signals:</span>{' '}
                              <span className="text-white">{diag.diagnostics.total_ml_signals || 0}</span>
                            </div>
                            <div>
                              <span className="text-gray-400">Confidence Threshold:</span>{' '}
                              <span className="text-white">
                                {diag.diagnostics.min_confidence_threshold 
                                  ? `${(diag.diagnostics.min_confidence_threshold * 100).toFixed(1)}%`
                                  : 'N/A'}
                              </span>
                            </div>
                            <div>
                              <span className="text-gray-400">Buy Signals:</span>{' '}
                              <span className="text-white">
                                {diag.diagnostics.final_buy_signals || 0} / {diag.diagnostics.buy_signals_before_filter || 0} (before filter)
                              </span>
                            </div>
                            <div>
                              <span className="text-gray-400">Sell Signals:</span>{' '}
                              <span className="text-white">
                                {diag.diagnostics.final_sell_signals || 0} / {diag.diagnostics.sell_signals_before_filter || 0} (before filter)
                              </span>
                            </div>
                            <div>
                              <span className="text-gray-400">Executed:</span>{' '}
                              <span className="text-white">{diag.diagnostics.executed_signals || 0}</span>
                            </div>
                            <div>
                              <span className="text-gray-400">Market Risk:</span>{' '}
                              <span className="text-white">
                                {diag.diagnostics.market_risk 
                                  ? `${(diag.diagnostics.market_risk * 100).toFixed(1)}%`
                                  : 'N/A'}
                              </span>
                            </div>
                          </div>
                          
                          {diag.diagnostics.executed_signals === 0 && diag.diagnostics.total_ml_signals > 0 && (
                            <div className="mt-2 p-2 bg-yellow-900/30 border border-yellow-700/50 rounded text-yellow-200">
                              <strong>Why no trades?</strong>
                              <ul className="list-disc list-inside mt-1 space-y-0.5">
                                {diag.diagnostics.final_buy_signals === 0 && diag.diagnostics.buy_signals_before_filter > 0 && (
                                  <>
                                    <li>
                                      {diag.diagnostics.filtered_buy_count > 0 
                                        ? `${diag.diagnostics.filtered_buy_count} buy signal(s) filtered out due to low confidence (below ${(diag.diagnostics.min_confidence_threshold * 100).toFixed(1)}% threshold)`
                                        : 'Buy signals filtered out (confidence below threshold or last 30 minutes)'}
                                    </li>
                                    {diag.data?.filtered_signals?.buy && diag.data.filtered_signals.buy.length > 0 && (
                                      <li className="ml-4 mt-1">
                                        <span className="text-xs">Filtered buy signals:</span>
                                        <ul className="list-disc list-inside ml-2 mt-0.5">
                                          {diag.data.filtered_signals.buy.slice(0, 3).map((f: any, idx: number) => (
                                            <li key={idx} className="text-xs">
                                              {f.symbol}: {(f.base_confidence * 100).toFixed(1)}% base
                                              {f.sentiment_boost > 0 && ` + ${(f.sentiment_boost * 100).toFixed(1)}% sentiment`}
                                              {f.sentiment_boost < 0 && ` ${(f.sentiment_boost * 100).toFixed(1)}% sentiment`}
                                              {' '}= {(f.adjusted_confidence * 100).toFixed(1)}% (need {(f.threshold * 100).toFixed(1)}%)
                                            </li>
                                          ))}
                                          {diag.data.filtered_signals.buy.length > 3 && (
                                            <li className="text-xs text-gray-400">
                                              ... and {diag.data.filtered_signals.buy.length - 3} more
                                            </li>
                                          )}
                                        </ul>
                                      </li>
                                    )}
                                  </>
                                )}
                                {diag.diagnostics.final_sell_signals === 0 && diag.diagnostics.sell_signals_before_filter > 0 && (
                                  <>
                                    <li>
                                      {diag.diagnostics.filtered_sell_count > 0
                                        ? `${diag.diagnostics.filtered_sell_count} sell signal(s) filtered out due to low confidence`
                                        : 'Sell signals filtered out (confidence below threshold)'}
                                    </li>
                                    {diag.data?.filtered_signals?.sell && diag.data.filtered_signals.sell.length > 0 && (
                                      <li className="ml-4 mt-1">
                                        <span className="text-xs">Filtered sell signals:</span>
                                        <ul className="list-disc list-inside ml-2 mt-0.5">
                                          {diag.data.filtered_signals.sell.slice(0, 3).map((f: any, idx: number) => (
                                            <li key={idx} className="text-xs">
                                              {f.symbol}: {(f.base_confidence * 100).toFixed(1)}% base
                                              {f.sentiment_boost > 0 && ` + ${(f.sentiment_boost * 100).toFixed(1)}% sentiment`}
                                              {f.sentiment_boost < 0 && ` ${(f.sentiment_boost * 100).toFixed(1)}% sentiment`}
                                              {' '}= {(f.adjusted_confidence * 100).toFixed(1)}% (need {(f.threshold * 100).toFixed(1)}%)
                                            </li>
                                          ))}
                                        </ul>
                                      </li>
                                    )}
                                  </>
                                )}
                                {diag.diagnostics.allocated_buy_signals !== undefined && diag.diagnostics.allocated_buy_signals < diag.diagnostics.final_buy_signals && (
                                  <li>Some buy signals skipped due to capital allocation limits</li>
                                )}
                                {diag.diagnostics.in_last_30_minutes && diag.diagnostics.final_buy_signals === 0 && (
                                  <li>Last 30 minutes of trading - new positions blocked</li>
                                )}
                              </ul>
                            </div>
                          )}
                          
                          {diag.diagnostics.total_ml_signals === 0 && (
                            <div className="mt-2 p-2 bg-blue-900/30 border border-blue-700/50 rounded text-blue-200">
                              <strong>No ML signals generated.</strong> This could mean:
                              <ul className="list-disc list-inside mt-1 space-y-0.5">
                                <li>ML service may be unavailable or timing out</li>
                                <li>Market data may not be available</li>
                                <li>Technical indicators may have failed to calculate</li>
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                      
                      {diag.message && (
                        <div className="mt-2 text-xs text-gray-400">{diag.message}</div>
                      )}
                    </div>
                  ))}
                  
                  {diagnostics.diagnostics.length === 0 && (
                    <div className="text-sm text-gray-400 text-center py-4 space-y-2">
                      <p>No recent activity. The bot may have just started or hasn't executed a trading loop yet.</p>
                      <p className="text-xs text-gray-500">
                        Last run: {diagnostics.botState?.lastRun 
                          ? new Date(diagnostics.botState.lastRun).toLocaleString() 
                          : 'Never'}
                      </p>
                      <Button
                        onClick={async () => {
                          console.log('🔄 Manually triggering health check...')
                          try {
                            const supabase = createClient()
                            const { data: { session } } = await supabase.auth.getSession()
                            const response = await fetch('/api/trading/health-check', {
                              headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
                            })
                            const data = await response.json()
                            console.log('Health check response:', data)
                            if (data.success) {
                              setTimeout(() => fetchDiagnostics(), 2000)
                            }
                          } catch (error) {
                            console.error('Error triggering health check:', error)
                          }
                        }}
                        variant="outline"
                        size="sm"
                        className="mt-2"
                      >
                        Trigger Health Check
                      </Button>
                    </div>
                  )}
                </div>
              ) : diagnosticsLoading ? (
                <div className="text-sm text-gray-400 text-center py-4">Loading diagnostics...</div>
              ) : (
                <div className="text-sm text-gray-400 text-center py-4">
                  No diagnostics available yet. The bot will show activity after it runs its first trading loop.
                </div>
              )}
            </div>
          )}
          
          {/* Market Hours Info */}
          {botStatus?.marketOpen === false && (
            <div className="text-xs text-yellow-300 bg-yellow-950 border border-yellow-800 p-2 rounded">
              <strong>⏰ Market Closed:</strong> Bot is running in standby mode. 
              {botStatus?.nextMarketOpen && (
                <span> Next market open: {new Date(botStatus.nextMarketOpen).toLocaleString('en-US', { 
                  timeZone: 'America/New_York',
                  month: 'numeric',
                  day: 'numeric',
                  year: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                  hour12: true
                })} ET</span>
              )}
              {mode === 'paper' && ' Use "Test Signals" to see how the bot works with last available data.'}
            </div>
          )}
          {botStatus?.marketOpen === true && (
            <div className="text-xs text-green-300 bg-green-950 border border-green-800 p-2 rounded">
              <strong>🟢 Market Open:</strong> Live trading active. Bot will scan 70+ stocks and make intelligent decisions.
            </div>
          )}
          {botStatus?.marketOpen === undefined && (
            <div className="text-xs text-blue-300 bg-blue-950 border border-blue-800 p-2 rounded">
              <strong>🔄 Market Hours Mode:</strong> Bot runs continuously during market hours (9:30 AM - 4:00 PM ET).
            </div>
          )}
        </CardContent>
      </Card>

      {/* Current Signals */}
      {botStatus?.currentSignals && botStatus.currentSignals.length > 0 && (
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-white">Current Trading Signals</CardTitle>
            <CardDescription className="text-gray-400">
              Latest AI-generated trading signals
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {botStatus.currentSignals.map((signal, index) => (
                <div key={index} className="p-4 bg-blue-500/10 backdrop-blur-sm rounded-lg border border-blue-500/20 hover:border-blue-400 transition-colors">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <Badge 
                        variant={signal.action === 'buy' ? 'default' : signal.action === 'sell' ? 'destructive' : 'secondary'}
                        className={signal.action === 'buy' ? 'bg-blue-400' : signal.action === 'sell' ? 'bg-red-600' : ''}
                      >
                        {signal.action.toUpperCase()}
                      </Badge>
                      <div className="font-semibold text-lg text-white">{signal.symbol}</div>
                      {signal.price > 0 && (
                        <div className="text-sm text-gray-400">
                          @ ${signal.price.toFixed(2)}
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-lg text-white">{(signal.confidence * 100).toFixed(1)}%</div>
                      <div className="text-sm text-gray-400">Confidence</div>
                    </div>
                  </div>
                  <div className="text-sm text-gray-300 bg-blue-500/10 backdrop-blur-sm p-2 rounded border border-blue-500/20">
                    <strong className="text-white">Reasoning:</strong> {signal.reasoning}
                  </div>
                  
                  {/* Enhanced Metrics */}
                  {(signal.news_sentiment !== undefined || signal.market_risk !== undefined || signal.vix !== undefined) && (
                    <div className="mt-3 pt-3 border-t border-gray-700">
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        {signal.news_sentiment !== undefined && (
                          <div className="text-center">
                            <div className={`font-bold ${signal.news_sentiment > 0 ? 'text-green-400' : signal.news_sentiment < 0 ? 'text-red-400' : 'text-gray-400'}`}>
                              {signal.news_sentiment > 0 ? '📈' : signal.news_sentiment < 0 ? '📉' : '➡️'} {(signal.news_sentiment * 100).toFixed(1)}%
                            </div>
                            <div className="text-gray-500">News</div>
                          </div>
                        )}
                        {signal.market_risk !== undefined && (
                          <div className="text-center">
                            <div className={`font-bold ${signal.market_risk < 0.3 ? 'text-green-400' : signal.market_risk < 0.6 ? 'text-yellow-400' : 'text-red-400'}`}>
                              {(signal.market_risk * 100).toFixed(0)}%
                            </div>
                            <div className="text-gray-500">Risk</div>
                          </div>
                        )}
                        {signal.vix !== undefined && (
                          <div className="text-center">
                            <div className={`font-bold ${signal.vix < 20 ? 'text-green-400' : signal.vix < 30 ? 'text-yellow-400' : 'text-red-400'}`}>
                              {signal.vix.toFixed(1)}
                            </div>
                            <div className="text-gray-500">VIX</div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  
                  <div className="text-xs text-gray-500 mt-2">
                    {signal.data_timestamp && !signal.market_open && (
                      <div className="text-yellow-400 mb-1">⏰ Data from: {signal.data_timestamp}</div>
                    )}
                    Generated: {new Date(signal.timestamp).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Risk Warning for Live Trading */}
      {mode === 'live' && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>Warning:</strong> Live trading involves real money and significant risk. 
            Make sure you understand the risks and have proper API keys configured before starting the bot.
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}
