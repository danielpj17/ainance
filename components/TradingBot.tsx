'use client'

import { useState, useEffect } from 'react'
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

  // Fetch bot status on component mount
  useEffect(() => {
    fetchBotStatus()
    
    // Set up polling for bot status
    const interval = setInterval(fetchBotStatus, 5000) // Poll every 5 seconds
    
    return () => clearInterval(interval)
  }, [])

  const fetchBotStatus = async () => {
    try {
      const response = await fetch('/api/trading')
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
      const response = await fetch('/api/trading', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
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
      const response = await fetch('/api/trading', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
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

  const formatTime = (timestamp: string | null) => {
    if (!timestamp) return 'Never'
    return new Date(timestamp).toLocaleTimeString()
  }

  const getStatusIcon = () => {
    if (!botStatus) return <Activity className="h-4 w-4" />
    if (botStatus.isRunning) return <CheckCircle className="h-4 w-4 text-green-500" />
    return <XCircle className="h-4 w-4 text-gray-500" />
  }

  const getStatusBadge = () => {
    if (!botStatus) return <Badge variant="secondary">Unknown</Badge>
    if (botStatus.isRunning) return <Badge className="bg-green-500">Running</Badge>
    return <Badge variant="secondary">Stopped</Badge>
  }

  return (
    <div className="space-y-6">
      {/* Bot Status Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {getStatusIcon()}
              <CardTitle>
                Trading Bot Status - {mode === 'paper' ? 'Paper Trading' : 'Live Trading'}
              </CardTitle>
            </div>
            {getStatusBadge()}
          </div>
          <CardDescription>
            Automated trading bot using AI predictions and news sentiment
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
              <div className="text-2xl font-bold">{botStatus?.totalTrades || 0}</div>
              <div className="text-sm text-gray-500">Total Trades</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">{botStatus?.activePositions || 0}</div>
              <div className="text-sm text-gray-500">Active Positions</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">{botStatus?.currentSignals.length || 0}</div>
              <div className="text-sm text-gray-500">Current Signals</div>
            </div>
            <div className="text-center">
              <div className="text-sm font-medium">{formatTime(botStatus?.lastRun || null)}</div>
              <div className="text-sm text-gray-500">Last Run</div>
            </div>
          </div>

          {/* Bot Configuration */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <h4 className="font-medium mb-2">Bot Configuration</h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>Symbols: {config.symbols.join(', ')}</div>
              <div>Interval: {config.interval}s</div>
              <div>Strategy: {config.settings.strategy}</div>
              <div>Account: {config.settings.account_type}</div>
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
          </div>
        </CardContent>
      </Card>

      {/* Current Signals */}
      {botStatus?.currentSignals && botStatus.currentSignals.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Current Trading Signals</CardTitle>
            <CardDescription>
              Latest AI-generated trading signals
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {botStatus.currentSignals.map((signal, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Badge variant={signal.action === 'buy' ? 'default' : signal.action === 'sell' ? 'destructive' : 'secondary'}>
                      {signal.action.toUpperCase()}
                    </Badge>
                    <div>
                      <div className="font-medium">{signal.symbol}</div>
                      <div className="text-sm text-gray-500">{signal.reasoning}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium">{(signal.confidence * 100).toFixed(1)}%</div>
                    <div className="text-sm text-gray-500">Confidence</div>
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
