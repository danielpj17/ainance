'use client'

import { useEffect, useState, useRef } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TrendingUp, TrendingDown, Clock, DollarSign, Activity, Target } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'

interface CurrentTrade {
  id: number | string
  symbol: string
  qty: number
  buy_price: number
  buy_timestamp: string
  current_price: number
  current_value: number
  unrealized_pl: number
  unrealized_pl_percent: number
  holding_duration: string
  buy_decision_metrics: any
  strategy: string
  account_type: string
  trade_pair_id: string
  transaction_ids?: string[]
  transaction_count?: number
}

interface CompletedTrade {
  id: number | string
  symbol: string
  qty: number
  buy_price: number
  buy_timestamp: string
  sell_price: number
  sell_timestamp: string
  profit_loss: number
  profit_loss_percent: number
  holding_duration: string
  buy_decision_metrics: any
  sell_decision_metrics: any
  strategy: string
  account_type: string
  trade_pair_id: string
  transaction_ids?: string[]
  transaction_count?: number
}

interface TradeStatistics {
  total_trades: number
  open_trades: number
  closed_trades: number
  winning_trades: number
  losing_trades: number
  total_profit_loss: number
  avg_profit_loss: number
  win_rate: number
  avg_holding_duration: string
  best_trade: number
  worst_trade: number
}

export default function TradeLogsPage() {
  const [currentTrades, setCurrentTrades] = useState<CurrentTrade[]>([])
  const [completedTrades, setCompletedTrades] = useState<CompletedTrade[]>([])
  const [statistics, setStatistics] = useState<TradeStatistics | null>(null)
  const [selectedTrade, setSelectedTrade] = useState<CurrentTrade | CompletedTrade | null>(null)
  const [showDetails, setShowDetails] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null)
  const [showTransactions, setShowTransactions] = useState(false)
  const [transactions, setTransactions] = useState<any[]>([])
  const [loadingTransactions, setLoadingTransactions] = useState(false)
  const [showAllCurrent, setShowAllCurrent] = useState(false)
  const [showAllCompleted, setShowAllCompleted] = useState(false)
  
  // Debug: Log state changes
  useEffect(() => {
    console.log('[TRADE-LOGS PAGE] State updated:', {
      currentTrades: currentTrades.length,
      completedTrades: completedTrades.length,
      isLoading
    })
  }, [currentTrades, completedTrades, isLoading])

  useEffect(() => {
    let mounted = true
    const supabase = createClient()
    
    const setupRealtime = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user?.id || !mounted) return
      
      fetchTradeData()
      
      // Set up realtime subscription for trade_logs table
      const channel = supabase
        .channel('trade-logs-changes')
        .on(
          'postgres_changes',
          {
            event: '*', // Listen to INSERT, UPDATE, DELETE
            schema: 'public',
            table: 'trade_logs',
            filter: `user_id=eq.${session.user.id}`
          },
          (payload: any) => {
            console.log('Trade log change detected:', payload.eventType, payload.new || payload.old)
            // Refresh trade data when any change occurs
            if (mounted) {
              fetchTradeData()
            }
          }
        )
        .subscribe()

      // Keep the 30 second refresh as backup
      const interval = setInterval(() => {
        if (mounted) {
          fetchTradeData()
        }
      }, 30000)
      
      return () => {
        channel.unsubscribe()
        clearInterval(interval)
      }
    }
    
    const cleanupPromise = setupRealtime()
    
    return () => {
      mounted = false
      cleanupPromise.then(cleanup => cleanup?.())
    }
  }, [])

  const fetchTradeData = async () => {
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      
      const response = await fetch('/api/trade-logs?view=all', {
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
      })
      
      const data = await response.json()
      
      console.log('[TRADE-LOGS PAGE] API Response:', {
        success: data.success,
        currentTradesCount: data.data?.currentTrades?.length || 0,
        completedTradesCount: data.data?.completedTrades?.length || 0,
        hasStatistics: !!data.data?.statistics,
        fullResponse: data
      })
      
      if (data.success) {
        const current = data.data.currentTrades || []
        const completed = data.data.completedTrades || []
        
        console.log('[TRADE-LOGS PAGE] Setting trades:', {
          current: current.length,
          completed: completed.length,
          currentSample: current[0],
          completedSample: completed[0],
          currentTrades: current,
          completedTrades: completed
        })
        
        setCurrentTrades(current)
        setCompletedTrades(completed)
        setStatistics(data.data.statistics)
        
        // Force a re-render check
        console.log('[TRADE-LOGS PAGE] State updated, currentTrades.length will be:', current.length)
      } else {
        console.error('[TRADE-LOGS PAGE] API returned error:', data.error, data)
      }
    } catch (error) {
      console.error('[TRADE-LOGS PAGE] Error fetching trade data:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const formatDuration = (duration: string) => {
    // Parse PostgreSQL interval format (can be HH:MM:SS or days HH:MM:SS format)
    // First try to match days if present (PostgreSQL interval format like "3 days 01:30:00")
    const daysMatch = duration.match(/(\d+)\s+days?/i)
    const days = daysMatch ? parseInt(daysMatch[1]) : 0
    
    // Then match the time portion (HH:MM:SS)
    const timeMatch = duration.match(/(\d+):(\d+):(\d+)/)
    if (!timeMatch) return duration
    
    const hours = parseInt(timeMatch[1])
    const minutes = parseInt(timeMatch[2])
    
    // Calculate total hours including days
    const totalHours = days * 24 + hours
    
    if (totalHours >= 24) {
      const totalDays = Math.floor(totalHours / 24)
      const remainingHours = totalHours % 24
      if (remainingHours > 0) {
        return `${totalDays}d ${remainingHours}h`
      } else {
        return `${totalDays}d`
      }
    } else if (totalHours > 0) {
      return `${totalHours}h ${minutes}m`
    } else {
      return `${minutes}m`
    }
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value)
  }

  const openTradeDetails = (trade: CurrentTrade | CompletedTrade) => {
    setSelectedTrade(trade)
    setShowDetails(true)
  }

  const closeTradeDetails = () => {
    setShowDetails(false)
    setSelectedTrade(null)
  }

  const fetchTransactions = async (symbol: string) => {
    try {
      setLoadingTransactions(true)
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      
      const response = await fetch(`/api/trade-logs?view=transactions&symbol=${symbol}`, {
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
      })
      
      const data = await response.json()
      
      if (data.success) {
        setTransactions(data.data.transactions || [])
        setSelectedSymbol(symbol)
        setShowTransactions(true)
      }
    } catch (error) {
      console.error('Error fetching transactions:', error)
    } finally {
      setLoadingTransactions(false)
    }
  }

  const closeTransactions = () => {
    setShowTransactions(false)
    setSelectedSymbol(null)
    setTransactions([])
  }

  return (
    <div className="min-h-screen text-white p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Trade Logs</h1>
        <p className="text-white/80">Comprehensive trading history with decision metrics</p>
      </div>

      {/* Statistics Cards */}
      {statistics && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card className="glass-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-400">Win Rate</CardTitle>
              <Target className="h-5 w-5 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-white">
                {statistics.win_rate.toFixed(1)}%
              </div>
              <p className="text-xs text-gray-400 mt-1">
                {statistics.winning_trades} wins / {statistics.losing_trades} losses
              </p>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-400">Total P&L</CardTitle>
              {statistics.total_profit_loss >= 0 ? (
                <TrendingUp className="h-5 w-5 text-green-500" />
              ) : (
                <TrendingDown className="h-5 w-5 text-red-500" />
              )}
            </CardHeader>
            <CardContent>
              <div className={`text-3xl font-bold ${statistics.total_profit_loss >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {formatCurrency(statistics.total_profit_loss)}
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Avg: {formatCurrency(statistics.avg_profit_loss)}
              </p>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-400">Open Positions</CardTitle>
              <Activity className="h-5 w-5 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-white">{statistics.open_trades}</div>
              <p className="text-xs text-gray-400 mt-1">
                {statistics.closed_trades} completed
              </p>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-400">Best Trade</CardTitle>
              <DollarSign className="h-5 w-5 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-500">
                {formatCurrency(statistics.best_trade)}
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Worst: {formatCurrency(statistics.worst_trade)}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs for Current and Completed Trades */}
      <Tabs defaultValue="current" className="w-full">
        <TabsList className="grid w-full md:w-[400px] grid-cols-2 bg-[#1a1d2e] border border-gray-700">
          <TabsTrigger value="current">
            Current Trades ({currentTrades.length})
          </TabsTrigger>
          <TabsTrigger value="completed">
            Completed ({completedTrades.length})
          </TabsTrigger>
        </TabsList>

        {/* Current Trades Tab */}
        <TabsContent value="current" className="mt-6">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-white">Current Positions</CardTitle>
              <CardDescription className="text-gray-400">
                Active trades that have been bought but not sold yet
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8 text-gray-400">Loading...</div>
              ) : currentTrades.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Activity className="h-12 w-12 mx-auto mb-2 opacity-20" />
                  <p>No current positions</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {(showAllCurrent ? currentTrades : currentTrades.slice(0, 10)).map((trade) => (
                    <div
                      key={trade.id.toString()}
                      onClick={() => openTradeDetails(trade)}
                      className="p-4 bg-[#252838] rounded-lg border border-gray-700 hover:border-blue-500 transition-all cursor-pointer"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="text-2xl font-bold text-white">{trade.symbol}</div>
                          <Badge className="bg-blue-400">BUY</Badge>
                          <Badge variant="outline" className="border-gray-600 text-gray-400">
                            {trade.qty} shares
                          </Badge>
                          {trade.transaction_count && trade.transaction_count > 1 && (
                            <Badge variant="outline" className="border-blue-500/50 text-blue-400 text-xs">
                              {trade.transaction_count} transactions
                            </Badge>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation()
                              fetchTransactions(trade.symbol)
                            }}
                            className="border-blue-500/50 text-blue-400 hover:bg-blue-500/10 text-xs"
                          >
                            View Transactions
                          </Button>
                        </div>
                        <div className="text-right">
                          <div className={`text-xl font-bold ${trade.unrealized_pl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                            {formatCurrency(trade.unrealized_pl)}
                          </div>
                          <div className={`text-sm ${trade.unrealized_pl_percent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {trade.unrealized_pl_percent >= 0 ? '+' : ''}{trade.unrealized_pl_percent.toFixed(2)}%
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <div className="text-gray-500 mb-1">Buy Price</div>
                          <div className="font-semibold text-white">{formatCurrency(trade.buy_price)}</div>
                        </div>
                        <div>
                          <div className="text-gray-500 mb-1">Current Price</div>
                          <div className="font-semibold text-white">{formatCurrency(trade.current_price)}</div>
                        </div>
                        <div>
                          <div className="text-gray-500 mb-1">Position Value</div>
                          <div className="font-semibold text-white">{formatCurrency(trade.current_value)}</div>
                        </div>
                        <div>
                          <div className="text-gray-500 mb-1 flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Holding Time
                          </div>
                          <div className="font-semibold text-white">{formatDuration(trade.holding_duration)}</div>
                        </div>
                      </div>

                      <div className="mt-3 pt-3 border-t border-gray-700">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4 text-xs text-gray-400">
                            <div>
                              Bought: {new Date(trade.buy_timestamp).toLocaleString()}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation()
                                fetchTransactions(trade.symbol)
                              }}
                              className="border-blue-500 text-blue-400 hover:bg-blue-500/10"
                            >
                              View Transactions
                            </Button>
                            <div className="text-blue-400 hover:text-blue-300 text-xs">
                              Click card for metrics →
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {currentTrades.length > 10 && (
                    <div className="pt-4 border-t border-gray-700">
                      <Button
                        variant="outline"
                        onClick={() => setShowAllCurrent(!showAllCurrent)}
                        className="w-full border-blue-500 text-blue-400 hover:bg-blue-500/10"
                      >
                        {showAllCurrent ? 'Show Less' : `See More (${currentTrades.length - 10} more)`}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Completed Trades Tab */}
        <TabsContent value="completed" className="mt-6">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-white">Completed Trades</CardTitle>
              <CardDescription className="text-gray-400">
                Trades that have been both bought and sold
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8 text-gray-400">Loading...</div>
              ) : completedTrades.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Activity className="h-12 w-12 mx-auto mb-2 opacity-20" />
                  <p>No completed trades yet</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {(showAllCompleted ? completedTrades : completedTrades.slice(0, 10)).map((trade) => (
                    <div
                      key={trade.id.toString()}
                      onClick={() => openTradeDetails(trade)}
                      className="p-4 bg-[#252838] rounded-lg border border-gray-700 hover:border-purple-500 transition-all cursor-pointer"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="text-2xl font-bold text-white">{trade.symbol}</div>
                          <Badge variant="outline" className="border-gray-600 text-gray-400">
                            {trade.qty} shares
                          </Badge>
                          {trade.transaction_count && trade.transaction_count > 1 && (
                            <Badge variant="outline" className="border-purple-500/50 text-purple-400 text-xs">
                              {trade.transaction_count} transactions
                            </Badge>
                          )}
                          <Badge 
                            className={trade.profit_loss >= 0 ? 'bg-green-600' : 'bg-red-600'}
                          >
                            {trade.profit_loss >= 0 ? 'WIN' : 'LOSS'}
                          </Badge>
                        </div>
                        <div className="text-right">
                          <div className={`text-xl font-bold ${trade.profit_loss >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                            {formatCurrency(trade.profit_loss)}
                          </div>
                          <div className={`text-sm ${trade.profit_loss_percent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {trade.profit_loss_percent >= 0 ? '+' : ''}{trade.profit_loss_percent.toFixed(2)}%
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <div className="text-gray-500 mb-1">Buy Price</div>
                          <div className="font-semibold text-white">{formatCurrency(trade.buy_price)}</div>
                        </div>
                        <div>
                          <div className="text-gray-500 mb-1">Sell Price</div>
                          <div className="font-semibold text-white">{formatCurrency(trade.sell_price)}</div>
                        </div>
                        <div>
                          <div className="text-gray-500 mb-1">Return</div>
                          <div className={`font-semibold ${trade.profit_loss >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {trade.profit_loss_percent >= 0 ? '+' : ''}{trade.profit_loss_percent.toFixed(2)}%
                          </div>
                        </div>
                        <div>
                          <div className="text-gray-500 mb-1 flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Duration
                          </div>
                          <div className="font-semibold text-white">{formatDuration(trade.holding_duration)}</div>
                        </div>
                      </div>

                      <div className="mt-3 pt-3 border-t border-gray-700">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4 text-xs text-gray-400">
                            <div>
                              {new Date(trade.buy_timestamp).toLocaleDateString()} → {new Date(trade.sell_timestamp).toLocaleDateString()}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation()
                                fetchTransactions(trade.symbol)
                              }}
                              className="border-purple-500 text-purple-400 hover:bg-purple-500/10"
                            >
                              View Transactions
                            </Button>
                            <div className="text-purple-400 hover:text-purple-300 text-xs">
                              Click card for metrics →
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {completedTrades.length > 10 && (
                    <div className="pt-4 border-t border-gray-700">
                      <Button
                        variant="outline"
                        onClick={() => setShowAllCompleted(!showAllCompleted)}
                        className="w-full border-purple-500 text-purple-400 hover:bg-purple-500/10"
                      >
                        {showAllCompleted ? 'Show Less' : `See More (${completedTrades.length - 10} more)`}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Trade Details Modal */}
      {showDetails && selectedTrade && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={closeTradeDetails}>
          <div className="bg-[#1a1d2e] rounded-lg border border-gray-700 max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-white">Trade Details: {selectedTrade.symbol}</h2>
                <button
                  onClick={closeTradeDetails}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Buy Decision Metrics */}
              <div className="mb-6">
                <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-blue-500" />
                  Buy Decision Metrics
                </h3>
                <div className="bg-[#252838] p-4 rounded-lg border border-gray-700">
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <div className="text-gray-500 text-sm mb-1">Confidence</div>
                      <div className="text-2xl font-bold text-white">
                        {((selectedTrade.buy_decision_metrics?.confidence || 0) * 100).toFixed(1)}%
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-500 text-sm mb-1">Adjusted Confidence</div>
                      <div className="text-2xl font-bold text-purple-400">
                        {((selectedTrade.buy_decision_metrics?.adjusted_confidence || 0) * 100).toFixed(1)}%
                      </div>
                    </div>
                  </div>
                  
                  <div className="mb-4">
                    <div className="text-gray-500 text-sm mb-1">Reasoning</div>
                    <div className="text-white bg-[#1a1d2e] p-3 rounded border border-gray-700">
                      {selectedTrade.buy_decision_metrics?.reasoning || 'No reasoning provided'}
                    </div>
                  </div>

                  {/* Technical Indicators */}
                  {selectedTrade.buy_decision_metrics?.indicators && Object.keys(selectedTrade.buy_decision_metrics.indicators).length > 0 && (
                    <div className="mb-4">
                      <div className="text-gray-500 text-sm mb-2">Technical Indicators</div>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                        {selectedTrade.buy_decision_metrics.indicators.rsi !== undefined && (
                          <div className="bg-[#1a1d2e] p-2 rounded border border-gray-700">
                            <div className="text-gray-400 text-xs mb-1">RSI</div>
                            <div className={`font-bold ${
                              selectedTrade.buy_decision_metrics.indicators.rsi > 70 
                                ? 'text-red-400' 
                                : selectedTrade.buy_decision_metrics.indicators.rsi < 30 
                                  ? 'text-green-400' 
                                  : 'text-white'
                            }`}>
                              {selectedTrade.buy_decision_metrics.indicators.rsi.toFixed(2)}
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              {selectedTrade.buy_decision_metrics.indicators.rsi > 70 ? 'Overbought' : 
                               selectedTrade.buy_decision_metrics.indicators.rsi < 30 ? 'Oversold' : 'Neutral'}
                            </div>
                          </div>
                        )}
                        {selectedTrade.buy_decision_metrics.indicators.macd !== undefined && (
                          <div className="bg-[#1a1d2e] p-2 rounded border border-gray-700">
                            <div className="text-gray-400 text-xs mb-1">MACD</div>
                            <div className={`font-bold ${
                              selectedTrade.buy_decision_metrics.indicators.macd > 0 
                                ? 'text-green-400' 
                                : 'text-red-400'
                            }`}>
                              {selectedTrade.buy_decision_metrics.indicators.macd.toFixed(4)}
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              {selectedTrade.buy_decision_metrics.indicators.macd > 0 ? 'Bullish' : 'Bearish'}
                            </div>
                          </div>
                        )}
                        {selectedTrade.buy_decision_metrics.indicators.stochastic !== undefined && (
                          <div className="bg-[#1a1d2e] p-2 rounded border border-gray-700">
                            <div className="text-gray-400 text-xs mb-1">Stochastic</div>
                            <div className={`font-bold ${
                              selectedTrade.buy_decision_metrics.indicators.stochastic > 80 
                                ? 'text-red-400' 
                                : selectedTrade.buy_decision_metrics.indicators.stochastic < 20 
                                  ? 'text-green-400' 
                                  : 'text-white'
                            }`}>
                              {selectedTrade.buy_decision_metrics.indicators.stochastic.toFixed(2)}
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              {selectedTrade.buy_decision_metrics.indicators.stochastic > 80 ? 'Overbought' : 
                               selectedTrade.buy_decision_metrics.indicators.stochastic < 20 ? 'Oversold' : 'Neutral'}
                            </div>
                          </div>
                        )}
                        {selectedTrade.buy_decision_metrics.indicators.bb_position !== undefined && (
                          <div className="bg-[#1a1d2e] p-2 rounded border border-gray-700">
                            <div className="text-gray-400 text-xs mb-1">BB Position</div>
                            <div className={`font-bold ${
                              selectedTrade.buy_decision_metrics.indicators.bb_position > 0.9 
                                ? 'text-red-400' 
                                : selectedTrade.buy_decision_metrics.indicators.bb_position < 0.1 
                                  ? 'text-green-400' 
                                  : 'text-white'
                            }`}>
                              {(selectedTrade.buy_decision_metrics.indicators.bb_position * 100).toFixed(1)}%
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              {selectedTrade.buy_decision_metrics.indicators.bb_position > 0.9 ? 'Upper Band' : 
                               selectedTrade.buy_decision_metrics.indicators.bb_position < 0.1 ? 'Lower Band' : 'Mid Range'}
                            </div>
                          </div>
                        )}
                        {selectedTrade.buy_decision_metrics.indicators.volume_ratio !== undefined && (
                          <div className="bg-[#1a1d2e] p-2 rounded border border-gray-700">
                            <div className="text-gray-400 text-xs mb-1">Volume Ratio</div>
                            <div className={`font-bold ${
                              selectedTrade.buy_decision_metrics.indicators.volume_ratio > 2 
                                ? 'text-green-400' 
                                : selectedTrade.buy_decision_metrics.indicators.volume_ratio < 0.5 
                                  ? 'text-yellow-400' 
                                  : 'text-white'
                            }`}>
                              {selectedTrade.buy_decision_metrics.indicators.volume_ratio.toFixed(2)}x
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              {selectedTrade.buy_decision_metrics.indicators.volume_ratio > 2 ? 'High Volume' : 
                               selectedTrade.buy_decision_metrics.indicators.volume_ratio < 0.5 ? 'Low Volume' : 'Normal'}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Model Probabilities */}
                  {selectedTrade.buy_decision_metrics?.probabilities && Object.keys(selectedTrade.buy_decision_metrics.probabilities).length > 0 && (
                    <div className="mb-4">
                      <div className="text-gray-500 text-sm mb-2">ML Model Probabilities</div>
                      <div className="grid grid-cols-3 gap-2 text-sm">
                        {Object.entries(selectedTrade.buy_decision_metrics.probabilities).map(([action, prob]: [string, any]) => (
                          <div key={action} className="bg-[#1a1d2e] p-2 rounded border border-gray-700 text-center">
                            <div className="text-gray-400 text-xs mb-1 capitalize">{action}</div>
                            <div className={`font-bold ${
                              action === 'buy' ? 'text-green-400' : 
                              action === 'sell' ? 'text-red-400' : 
                              'text-gray-400'
                            }`}>
                              {(prob * 100).toFixed(1)}%
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div className="text-center">
                      <div className="text-gray-500 mb-1">News Sentiment</div>
                      <div className={`font-bold ${
                        (selectedTrade.buy_decision_metrics?.news_sentiment || 0) > 0 
                          ? 'text-green-400' 
                          : (selectedTrade.buy_decision_metrics?.news_sentiment || 0) < 0 
                            ? 'text-red-400' 
                            : 'text-gray-400'
                      }`}>
                        {((selectedTrade.buy_decision_metrics?.news_sentiment || 0) * 100).toFixed(1)}%
                      </div>
                      {selectedTrade.buy_decision_metrics?.sentiment_boost !== undefined && selectedTrade.buy_decision_metrics.sentiment_boost > 0 && (
                        <div className="text-xs text-purple-400 mt-1">
                          +{((selectedTrade.buy_decision_metrics.sentiment_boost) * 100).toFixed(1)}% boost
                        </div>
                      )}
                    </div>
                    <div className="text-center">
                      <div className="text-gray-500 mb-1">Market Risk</div>
                      <div className={`font-bold ${
                        (selectedTrade.buy_decision_metrics?.market_risk || 0) < 0.3 
                          ? 'text-green-400' 
                          : (selectedTrade.buy_decision_metrics?.market_risk || 0) < 0.6 
                            ? 'text-yellow-400' 
                            : 'text-red-400'
                      }`}>
                        {((selectedTrade.buy_decision_metrics?.market_risk || 0) * 100).toFixed(0)}%
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-gray-500 mb-1">Buy Price</div>
                      <div className="font-bold text-white">
                        {formatCurrency(selectedTrade.buy_price)}
                      </div>
                    </div>
                  </div>

                  {/* Buy Timestamp */}
                  {selectedTrade.buy_timestamp && (
                    <div className="mt-4 pt-4 border-t border-gray-700">
                      <div className="text-gray-500 text-sm mb-1">Buy Timestamp</div>
                      <div className="text-white text-sm">
                        {new Date(selectedTrade.buy_timestamp).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true,
                          timeZoneName: 'short'
                        })}
                      </div>
                    </div>
                  )}

                  {selectedTrade.buy_decision_metrics?.news_headlines && selectedTrade.buy_decision_metrics.news_headlines.length > 0 && (
                    <div className="mt-4">
                      <div className="text-gray-500 text-sm mb-2">News Headlines</div>
                      <ul className="space-y-1 text-xs text-gray-400">
                        {selectedTrade.buy_decision_metrics.news_headlines.map((headline: string, idx: number) => (
                          <li key={idx} className="flex items-start gap-2">
                            <span className="text-purple-500 mt-1">•</span>
                            <span>{headline}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>

              {/* Buy vs Sell Confidence Comparison (for completed trades) */}
              {'sell_decision_metrics' in selectedTrade && selectedTrade.sell_decision_metrics && (
                <div className="mb-6 p-4 bg-gradient-to-r from-green-500/10 to-red-500/10 rounded-lg border border-gray-700">
                  <h3 className="text-lg font-semibold text-white mb-3">Confidence Comparison</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-[#1a1d2e] p-3 rounded border border-blue-500/30">
                      <div className="text-gray-400 text-xs mb-1">Buy Confidence</div>
                      <div className="text-2xl font-bold text-blue-400">
                        {((selectedTrade.buy_decision_metrics?.confidence || 0) * 100).toFixed(1)}%
                      </div>
                      <div className="text-xs text-gray-500 mt-1">When position was opened</div>
                    </div>
                    <div className="bg-[#1a1d2e] p-3 rounded border border-purple-500/30">
                      <div className="text-gray-400 text-xs mb-1">Sell Confidence</div>
                      <div className="text-2xl font-bold text-purple-400">
                        {((selectedTrade.sell_decision_metrics.confidence || 0) * 100).toFixed(1)}%
                      </div>
                      <div className="text-xs text-gray-500 mt-1">When position was closed</div>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-gray-700">
                    <div className="text-xs text-gray-400">
                      <strong className="text-white">Note:</strong> Buy and sell confidences are independent evaluations. 
                      A higher sell confidence means the ML model detected favorable conditions to exit at that moment, 
                      not that the original buy was better. The model evaluates current market conditions (technical indicators, 
                      momentum, volume) to determine the best time to sell, regardless of the original buy confidence.
                    </div>
                  </div>
                </div>
              )}

              {/* Sell Decision Metrics (only for completed trades) */}
              {'sell_decision_metrics' in selectedTrade && selectedTrade.sell_decision_metrics && (
                <div>
                  <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                    <TrendingDown className="h-5 w-5 text-red-500" />
                    Sell Decision Metrics
                  </h3>
                  <div className="bg-[#252838] p-4 rounded-lg border border-gray-700">
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <div className="text-gray-500 text-sm mb-1">Confidence</div>
                        <div className="text-2xl font-bold text-white">
                          {((selectedTrade.sell_decision_metrics.confidence || 0) * 100).toFixed(1)}%
                        </div>
                      </div>
                      <div>
                        <div className="text-gray-500 text-sm mb-1">Adjusted Confidence</div>
                        <div className="text-2xl font-bold text-purple-400">
                          {((selectedTrade.sell_decision_metrics.adjusted_confidence || 0) * 100).toFixed(1)}%
                        </div>
                      </div>
                    </div>
                    
                    <div className="mb-4">
                      <div className="text-gray-500 text-sm mb-1">Reasoning</div>
                      <div className="text-white bg-[#1a1d2e] p-3 rounded border border-gray-700">
                        {selectedTrade.sell_decision_metrics.reasoning || 'No reasoning provided'}
                      </div>
                    </div>

                    {/* Technical Indicators */}
                    {selectedTrade.sell_decision_metrics.indicators && Object.keys(selectedTrade.sell_decision_metrics.indicators).length > 0 && (
                      <div className="mb-4">
                        <div className="text-gray-500 text-sm mb-2">Technical Indicators</div>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                          {selectedTrade.sell_decision_metrics.indicators.rsi !== undefined && (
                            <div className="bg-[#1a1d2e] p-2 rounded border border-gray-700">
                              <div className="text-gray-400 text-xs mb-1">RSI</div>
                              <div className={`font-bold ${
                                selectedTrade.sell_decision_metrics.indicators.rsi > 70 
                                  ? 'text-red-400' 
                                  : selectedTrade.sell_decision_metrics.indicators.rsi < 30 
                                    ? 'text-green-400' 
                                    : 'text-white'
                              }`}>
                                {selectedTrade.sell_decision_metrics.indicators.rsi.toFixed(2)}
                              </div>
                              <div className="text-xs text-gray-500 mt-1">
                                {selectedTrade.sell_decision_metrics.indicators.rsi > 70 ? 'Overbought' : 
                                 selectedTrade.sell_decision_metrics.indicators.rsi < 30 ? 'Oversold' : 'Neutral'}
                              </div>
                            </div>
                          )}
                          {selectedTrade.sell_decision_metrics.indicators.macd !== undefined && (
                            <div className="bg-[#1a1d2e] p-2 rounded border border-gray-700">
                              <div className="text-gray-400 text-xs mb-1">MACD</div>
                              <div className={`font-bold ${
                                selectedTrade.sell_decision_metrics.indicators.macd > 0 
                                  ? 'text-green-400' 
                                  : 'text-red-400'
                              }`}>
                                {selectedTrade.sell_decision_metrics.indicators.macd.toFixed(4)}
                              </div>
                              <div className="text-xs text-gray-500 mt-1">
                                {selectedTrade.sell_decision_metrics.indicators.macd > 0 ? 'Bullish' : 'Bearish'}
                              </div>
                            </div>
                          )}
                          {selectedTrade.sell_decision_metrics.indicators.stochastic !== undefined && (
                            <div className="bg-[#1a1d2e] p-2 rounded border border-gray-700">
                              <div className="text-gray-400 text-xs mb-1">Stochastic</div>
                              <div className={`font-bold ${
                                selectedTrade.sell_decision_metrics.indicators.stochastic > 80 
                                  ? 'text-red-400' 
                                  : selectedTrade.sell_decision_metrics.indicators.stochastic < 20 
                                    ? 'text-green-400' 
                                    : 'text-white'
                              }`}>
                                {selectedTrade.sell_decision_metrics.indicators.stochastic.toFixed(2)}
                              </div>
                              <div className="text-xs text-gray-500 mt-1">
                                {selectedTrade.sell_decision_metrics.indicators.stochastic > 80 ? 'Overbought' : 
                                 selectedTrade.sell_decision_metrics.indicators.stochastic < 20 ? 'Oversold' : 'Neutral'}
                              </div>
                            </div>
                          )}
                          {selectedTrade.sell_decision_metrics.indicators.bb_position !== undefined && (
                            <div className="bg-[#1a1d2e] p-2 rounded border border-gray-700">
                              <div className="text-gray-400 text-xs mb-1">BB Position</div>
                              <div className={`font-bold ${
                                selectedTrade.sell_decision_metrics.indicators.bb_position > 0.9 
                                  ? 'text-red-400' 
                                  : selectedTrade.sell_decision_metrics.indicators.bb_position < 0.1 
                                    ? 'text-green-400' 
                                    : 'text-white'
                              }`}>
                                {(selectedTrade.sell_decision_metrics.indicators.bb_position * 100).toFixed(1)}%
                              </div>
                              <div className="text-xs text-gray-500 mt-1">
                                {selectedTrade.sell_decision_metrics.indicators.bb_position > 0.9 ? 'Upper Band' : 
                                 selectedTrade.sell_decision_metrics.indicators.bb_position < 0.1 ? 'Lower Band' : 'Mid Range'}
                              </div>
                            </div>
                          )}
                          {selectedTrade.sell_decision_metrics.indicators.volume_ratio !== undefined && (
                            <div className="bg-[#1a1d2e] p-2 rounded border border-gray-700">
                              <div className="text-gray-400 text-xs mb-1">Volume Ratio</div>
                              <div className={`font-bold ${
                                selectedTrade.sell_decision_metrics.indicators.volume_ratio > 2 
                                  ? 'text-green-400' 
                                  : selectedTrade.sell_decision_metrics.indicators.volume_ratio < 0.5 
                                    ? 'text-yellow-400' 
                                    : 'text-white'
                              }`}>
                                {selectedTrade.sell_decision_metrics.indicators.volume_ratio.toFixed(2)}x
                              </div>
                              <div className="text-xs text-gray-500 mt-1">
                                {selectedTrade.sell_decision_metrics.indicators.volume_ratio > 2 ? 'High Volume' : 
                                 selectedTrade.sell_decision_metrics.indicators.volume_ratio < 0.5 ? 'Low Volume' : 'Normal'}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Model Probabilities */}
                    {selectedTrade.sell_decision_metrics.probabilities && Object.keys(selectedTrade.sell_decision_metrics.probabilities).length > 0 && (
                      <div className="mb-4">
                        <div className="text-gray-500 text-sm mb-2">ML Model Probabilities</div>
                        <div className="grid grid-cols-3 gap-2 text-sm">
                          {Object.entries(selectedTrade.sell_decision_metrics.probabilities).map(([action, prob]: [string, any]) => (
                            <div key={action} className="bg-[#1a1d2e] p-2 rounded border border-gray-700 text-center">
                              <div className="text-gray-400 text-xs mb-1 capitalize">{action}</div>
                              <div className={`font-bold ${
                                action === 'buy' ? 'text-green-400' : 
                                action === 'sell' ? 'text-red-400' : 
                                'text-gray-400'
                              }`}>
                                {(prob * 100).toFixed(1)}%
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div className="text-center">
                        <div className="text-gray-500 mb-1">News Sentiment</div>
                        <div className={`font-bold ${
                          (selectedTrade.sell_decision_metrics.news_sentiment || 0) > 0 
                            ? 'text-green-400' 
                            : (selectedTrade.sell_decision_metrics.news_sentiment || 0) < 0 
                              ? 'text-red-400' 
                              : 'text-gray-400'
                        }`}>
                          {((selectedTrade.sell_decision_metrics.news_sentiment || 0) * 100).toFixed(1)}%
                        </div>
                        {selectedTrade.sell_decision_metrics.sentiment_boost !== undefined && selectedTrade.sell_decision_metrics.sentiment_boost > 0 && (
                          <div className="text-xs text-purple-400 mt-1">
                            +{((selectedTrade.sell_decision_metrics.sentiment_boost) * 100).toFixed(1)}% boost
                          </div>
                        )}
                      </div>
                      <div className="text-center">
                        <div className="text-gray-500 mb-1">Market Risk</div>
                        <div className={`font-bold ${
                          (selectedTrade.sell_decision_metrics.market_risk || 0) < 0.3 
                            ? 'text-green-400' 
                            : (selectedTrade.sell_decision_metrics.market_risk || 0) < 0.6 
                              ? 'text-yellow-400' 
                              : 'text-red-400'
                        }`}>
                          {((selectedTrade.sell_decision_metrics.market_risk || 0) * 100).toFixed(0)}%
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-gray-500 mb-1">Sell Price</div>
                        <div className="font-bold text-white">
                          {formatCurrency('sell_price' in selectedTrade ? selectedTrade.sell_price : 0)}
                        </div>
                      </div>
                    </div>

                    {/* Sell Timestamp */}
                    {'sell_timestamp' in selectedTrade && selectedTrade.sell_timestamp && (
                      <div className="mt-4 pt-4 border-t border-gray-700">
                        <div className="text-gray-500 text-sm mb-1">Sell Timestamp</div>
                        <div className="text-white text-sm">
                          {new Date(selectedTrade.sell_timestamp).toLocaleString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                            hour12: true,
                            timeZoneName: 'short'
                          })}
                        </div>
                      </div>
                    )}

                    {selectedTrade.sell_decision_metrics.news_headlines && selectedTrade.sell_decision_metrics.news_headlines.length > 0 && (
                      <div className="mt-4">
                        <div className="text-gray-500 text-sm mb-2">News Headlines</div>
                        <ul className="space-y-1 text-xs text-gray-400">
                          {selectedTrade.sell_decision_metrics.news_headlines.map((headline: string, idx: number) => (
                            <li key={idx} className="flex items-start gap-2">
                              <span className="text-purple-500 mt-1">•</span>
                              <span>{headline}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Trade Outcome (for completed trades) */}
              {'sell_price' in selectedTrade && selectedTrade.sell_price && (
                <div className="mt-6 p-4 bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-lg border border-blue-500/30">
                  <h3 className="text-lg font-semibold text-white mb-3">Trade Outcome</h3>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <div className="text-gray-400 text-sm mb-1">Buy Price</div>
                      <div className="text-xl font-bold text-white">{formatCurrency(selectedTrade.buy_price)}</div>
                    </div>
                    <div>
                      <div className="text-gray-400 text-sm mb-1">Sell Price</div>
                      <div className="text-xl font-bold text-white">{formatCurrency(selectedTrade.sell_price)}</div>
                    </div>
                    <div>
                      <div className="text-gray-400 text-sm mb-1">Profit/Loss</div>
                      <div className={`text-2xl font-bold ${selectedTrade.profit_loss >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {formatCurrency(selectedTrade.profit_loss)}
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-400 text-sm mb-1">Return %</div>
                      <div className={`text-2xl font-bold ${selectedTrade.profit_loss_percent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {selectedTrade.profit_loss_percent >= 0 ? '+' : ''}{selectedTrade.profit_loss_percent.toFixed(2)}%
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-blue-500/30">
                    <div className="text-xs text-gray-400">
                      <strong className="text-white">Why did it sell?</strong> The ML model evaluates current market conditions independently for buy and sell decisions. 
                      A sell confidence of {((selectedTrade.sell_decision_metrics?.confidence || 0) * 100).toFixed(1)}% means the model detected favorable conditions to exit the position at that moment, 
                      {selectedTrade.profit_loss >= 0 
                        ? ` resulting in a ${selectedTrade.profit_loss_percent.toFixed(2)}% gain.` 
                        : ` resulting in a ${Math.abs(selectedTrade.profit_loss_percent).toFixed(2)}% loss.`}
                      {' '}The sell decision is based on current technical indicators, not a comparison to the original buy confidence.
                    </div>
                  </div>
                </div>
              )}

              {/* Trade Summary */}
              <div className="mt-6 p-4 bg-blue-500/10 rounded-lg border border-blue-500/30">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-gray-400 mb-1">Trade ID</div>
                    <div className="text-white font-mono">{selectedTrade.trade_pair_id.slice(0, 8)}...</div>
                  </div>
                  <div>
                    <div className="text-gray-400 mb-1">Strategy</div>
                    <div className="text-white">{selectedTrade.strategy}</div>
                  </div>
                  <div>
                    <div className="text-gray-400 mb-1">Account Type</div>
                    <div className="text-white capitalize">{selectedTrade.account_type}</div>
                  </div>
                  <div>
                    <div className="text-gray-400 mb-1">Quantity</div>
                    <div className="text-white">{selectedTrade.qty} shares</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Transactions Modal */}
      {showTransactions && selectedSymbol && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={closeTransactions}>
          <div className="bg-[#1a1d2e] rounded-lg border border-gray-700 max-w-4xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-white">All Transactions: {selectedSymbol}</h2>
                <button
                  onClick={closeTransactions}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {loadingTransactions ? (
                <div className="text-center py-8 text-gray-400">Loading transactions...</div>
              ) : transactions.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Activity className="h-12 w-12 mx-auto mb-2 opacity-20" />
                  <p>No transactions found for {selectedSymbol}</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="mb-4 p-3 bg-[#252838] rounded-lg border border-gray-700">
                    <div className="text-sm text-gray-400">Total Transactions: <span className="text-white font-bold">{transactions.length}</span></div>
                    <div className="text-sm text-gray-400 mt-1">
                      Buy: <span className="text-green-400">{transactions.filter(t => t.action === 'buy').length}</span> | 
                      Sell: <span className="text-red-400">{transactions.filter(t => t.action === 'sell').length}</span>
                    </div>
                  </div>

                  {transactions.map((transaction, idx) => (
                    <div
                      key={transaction.id || idx}
                      className={`p-4 rounded-lg border ${
                        transaction.action === 'buy' 
                          ? 'bg-blue-500/10 border-blue-500/30' 
                          : 'bg-red-500/10 border-red-500/30'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <Badge className={transaction.action === 'buy' ? 'bg-blue-400' : 'bg-red-400'}>
                            {transaction.action.toUpperCase()}
                          </Badge>
                          <div className="text-lg font-bold text-white">
                            {transaction.qty} shares @ {formatCurrency(transaction.price)}
                          </div>
                          {transaction.trade_pair_id && (
                            <Badge variant="outline" className="border-gray-600 text-gray-400 text-xs">
                              Pair: {transaction.trade_pair_id.substring(0, 8)}...
                            </Badge>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="text-sm text-gray-400">
                            {new Date(transaction.timestamp).toLocaleString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit',
                              hour12: true
                            })}
                          </div>
                          {transaction.status && (
                            <Badge variant="outline" className={`mt-1 ${
                              transaction.status === 'open' ? 'border-blue-500 text-blue-400' : 'border-gray-500 text-gray-400'
                            }`}>
                              {transaction.status}
                            </Badge>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <div className="text-gray-500 mb-1">Total Value</div>
                          <div className="font-semibold text-white">{formatCurrency(transaction.total_value)}</div>
                        </div>
                        {transaction.alpaca_order_id && (
                          <div>
                            <div className="text-gray-500 mb-1">Order ID</div>
                            <div className="font-semibold text-white text-xs">{transaction.alpaca_order_id.substring(0, 20)}...</div>
                          </div>
                        )}
                        {transaction.order_status && (
                          <div>
                            <div className="text-gray-500 mb-1">Order Status</div>
                            <div className="font-semibold text-white">{transaction.order_status}</div>
                          </div>
                        )}
                        {transaction.profit_loss !== null && transaction.profit_loss !== undefined && (
                          <div>
                            <div className="text-gray-500 mb-1">P&L</div>
                            <div className={`font-semibold ${transaction.profit_loss >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {formatCurrency(transaction.profit_loss)}
                            </div>
                          </div>
                        )}
                      </div>

                      {(transaction.buy_decision_metrics || transaction.sell_decision_metrics) && (
                        <div className="mt-3 pt-3 border-t border-gray-700">
                          <div className="text-xs text-gray-400">
                            {transaction.action === 'buy' && transaction.buy_decision_metrics && (
                              <div>
                                <strong className="text-white">Buy Confidence:</strong> {((transaction.buy_decision_metrics.confidence || 0) * 100).toFixed(1)}%
                                {transaction.buy_decision_metrics.reasoning && (
                                  <div className="mt-1 text-gray-500">{transaction.buy_decision_metrics.reasoning}</div>
                                )}
                              </div>
                            )}
                            {transaction.action === 'sell' && transaction.sell_decision_metrics && (
                              <div>
                                <strong className="text-white">Sell Confidence:</strong> {((transaction.sell_decision_metrics.confidence || 0) * 100).toFixed(1)}%
                                {transaction.sell_decision_metrics.reasoning && (
                                  <div className="mt-1 text-gray-500">{transaction.sell_decision_metrics.reasoning}</div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

