'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Play, Square, Activity, AlertTriangle, CheckCircle, XCircle } from 'lucide-react'

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
}

export interface BotConfig {
  symbols: string[]
  interval: number
  settings: {
    strategy: 'cash' | '25k_plus'
    account_type: 'cash' | 'margin'
    max_trade_size: number
    daily_loss_limit: number
    take_profit: number
    stop_loss: number
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
  const [config, setConfig] = useState<BotConfig>({
    symbols: ['AAPL', 'MSFT', 'TSLA', 'SPY'],
    interval: 10, // 10 seconds
    settings: {
      strategy: mode === 'paper' ? 'cash' : '25k_plus',
      account_type: 'cash',
      max_trade_size: 2,
      daily_loss_limit: -100,
      take_profit: 5,
      stop_loss: -3
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
    
    return () => {
      clearInterval(marketCheckInterval)
      clearInterval(statusInterval)
    }
  }, [])

  const fetchBotStatus = async () => {
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      const response = await fetch('/api/trading', {
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
      })
      const data = await response.json()
      
      if (data.success) {
        setBotStatus(data.status)
        setError(null)
      } else {
        setError(data.error)
      }
    } catch (error) {
      console.error('Error fetching bot status:', error)
      setError('Failed to fetch bot status')
    }
  }

  const startBot = async () => {
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
          action: 'start',
          config
        })
      })
      
      const data = await response.json()
      
      if (data.success) {
        setBotStatus(prev => prev ? { ...prev, isRunning: true, error: undefined } : null)
        await fetchBotStatus() // Refresh status
      } else {
        setError(data.error)
      }
    } catch (error) {
      console.error('Error starting bot:', error)
      setError('Failed to start trading bot')
    } finally {
      setIsLoading(false)
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
      <Card className="bg-[#1a1d2e] border-gray-800">
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
          <div className="bg-[#252838] p-4 rounded-lg border border-gray-700">
            <h4 className="font-medium mb-2 text-white">Bot Configuration</h4>
            <div className="grid grid-cols-2 gap-2 text-sm text-gray-300">
              <div>Symbols: {config.symbols.join(', ')}</div>
              <div>Interval: {config.interval}s</div>
              <div>Strategy: {config.settings.strategy}</div>
              <div>Account: {config.settings.account_type}</div>
            </div>
            <div className="mt-2 text-xs text-gray-400">
              Signals are generated by your trained Random Forest ML model deployed on Google Cloud Run.
            </div>
          </div>

          {/* Control Buttons */}
          <div className="flex gap-2">
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
          </div>
          
          {/* Market Hours Info */}
          {!isMarketOpen && (
            <div className="text-xs text-yellow-300 bg-yellow-950 border border-yellow-800 p-2 rounded">
              <strong>⏰ Market Closed:</strong> Market is currently closed. Use "Test Signals" to see how the bot works with last available data.
            </div>
          )}
          {isMarketOpen && (
            <div className="text-xs text-green-300 bg-green-950 border border-green-800 p-2 rounded">
              <strong>🟢 Market Open:</strong> Live trading active. Bot will scan 70+ stocks and make intelligent decisions.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Current Signals */}
      {botStatus?.currentSignals && botStatus.currentSignals.length > 0 && (
        <Card className="bg-[#1a1d2e] border-gray-800">
          <CardHeader>
            <CardTitle className="text-white">Current Trading Signals</CardTitle>
            <CardDescription className="text-gray-400">
              Latest AI-generated trading signals
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {botStatus.currentSignals.map((signal, index) => (
                <div key={index} className="p-4 bg-[#252838] rounded-lg border border-gray-700 hover:border-purple-500 transition-colors">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <Badge 
                        variant={signal.action === 'buy' ? 'default' : signal.action === 'sell' ? 'destructive' : 'secondary'}
                        className={signal.action === 'buy' ? 'bg-blue-600' : signal.action === 'sell' ? 'bg-red-600' : ''}
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
                  <div className="text-sm text-gray-300 bg-[#1a1d2e] p-2 rounded border border-gray-700">
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
