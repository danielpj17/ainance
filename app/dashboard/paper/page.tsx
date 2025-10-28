'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, TrendingUp, TrendingDown, DollarSign, Activity, Wallet, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import TradingBot from '@/components/TradingBot'
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

interface Trade {
  id: number
  symbol: string
  action: string
  qty: number
  price: number
  trade_timestamp: string
  strategy: string
  account_type: string
  created_at: string
}

interface AlpacaAccount {
  id: string
  account_number: string
  status: string
  currency: string
  buying_power: string
  cash: string
  portfolio_value: string
  equity: string
  last_equity: string
  long_market_value: string
  short_market_value: string
  initial_margin: string
  maintenance_margin: string
  daytrade_count: number
  daytrading_buying_power: string
  pattern_day_trader: boolean
}

interface PortfolioHistory {
  timestamp: number[]
  equity: number[]
  profit_loss: number[]
  profit_loss_pct: number[]
  base_value: number
  timeframe: string
}

interface CurrentPosition {
  id: bigint
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
}

export default function PaperTradingPage() {
  const [trades, setTrades] = useState<Trade[]>([])
  const [account, setAccount] = useState<AlpacaAccount | null>(null)
  const [portfolioHistory, setPortfolioHistory] = useState<PortfolioHistory | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [chartPeriod, setChartPeriod] = useState<'1D' | '1W' | '1M' | '1A'>('1D')
  const [chartData, setChartData] = useState<any[]>([])
  const [currentPositions, setCurrentPositions] = useState<CurrentPosition[]>([])
  const [positionsLoading, setPositionsLoading] = useState(false)

  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null)

  useEffect(() => {
    supabaseRef.current = createClient()
    loadData()
    
    // Set up realtime subscriptions for trades
    let tradesChannel: any = null
    if (supabaseRef.current) {
      tradesChannel = supabaseRef.current
        .channel('paper-trades')
        .on('postgres_changes', 
          { event: 'INSERT', schema: 'public', table: 'trades', filter: 'account_type=eq.paper' },
          () => loadData()
        )
        .subscribe()
    }

    // Refresh account data every 30 seconds
    const accountInterval = setInterval(() => {
      loadAccountData()
    }, 30000)

    // Refresh positions every 30 seconds
    const positionsInterval = setInterval(() => {
      loadCurrentPositions()
    }, 30000)

    return () => {
      tradesChannel?.unsubscribe()
      clearInterval(accountInterval)
      clearInterval(positionsInterval)
    }
  }, [])

  useEffect(() => {
    loadPortfolioHistory()
  }, [chartPeriod])

  const loadData = async () => {
    try {
      setLoading(true)
      await Promise.all([loadAccountData(), loadTradesData(), loadCurrentPositions()])
    } catch (error) {
      console.error('Error loading data:', error)
      setMessage({ type: 'error', text: 'Failed to load data' })
    } finally {
      setLoading(false)
    }
  }

  const loadCurrentPositions = async () => {
    try {
      setPositionsLoading(true)
      const sb = supabaseRef.current
      if (!sb) return
      
      const { data: { session } } = await sb.auth.getSession()
      const response = await fetch('/api/trade-logs?view=current', {
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
      })
      
      const data = await response.json()
      
      if (data.success) {
        setCurrentPositions(data.data.currentTrades || [])
      }
    } catch (error) {
      console.error('Error loading current positions:', error)
    } finally {
      setPositionsLoading(false)
    }
  }

  const loadAccountData = async () => {
    try {
      const response = await fetch('/api/account')
      const result = await response.json()
      
      console.log('Account API response:', result)
      
      if (result.success && result.data) {
        console.log('Account data:', result.data)
        setAccount(result.data)
      } else {
        console.error('Failed to load account data:', result.error)
        setMessage({ type: 'error', text: `Account error: ${result.error || 'Unable to fetch account data'}` })
      }
    } catch (error) {
      console.error('Error loading account data:', error)
      setMessage({ type: 'error', text: 'Failed to connect to account API' })
    }
  }

  const loadTradesData = async () => {
    try {
      const sb = supabaseRef.current
      if (!sb) return

      const { data: tradesData, error: tradesError } = await sb
        .from('trades')
        .select('*')
        .eq('account_type', 'paper')
        .order('created_at', { ascending: false })
        .limit(20)

      if (tradesError) throw tradesError
      setTrades(tradesData || [])
    } catch (error) {
      console.error('Error loading trades data:', error)
    }
  }

  const loadPortfolioHistory = async () => {
    try {
      const timeframeMap = {
        '1D': '5Min',
        '1W': '1H',
        '1M': '1D',
        '1A': '1W'
      }
      
      const response = await fetch(`/api/account/history?period=${chartPeriod}&timeframe=${timeframeMap[chartPeriod]}`)
      const result = await response.json()
      
      if (result.success && result.data) {
        setPortfolioHistory(result.data)
        
        // Transform data for chart
        const timestamps = result.data.timestamp || []
        const equity = result.data.equity || []
        
        const transformed = timestamps.map((ts: number, idx: number) => ({
          time: new Date(ts * 1000).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: chartPeriod === '1D' ? 'numeric' : undefined,
            minute: chartPeriod === '1D' ? '2-digit' : undefined
          }),
          value: equity[idx] || 0
        }))
        
        setChartData(transformed)
      }
    } catch (error) {
      console.error('Error loading portfolio history:', error)
    }
  }

  const formatCurrency = (amount: number | string) => {
    const value = typeof amount === 'string' ? parseFloat(amount) : amount
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString()
  }

  const calculateProfitLoss = () => {
    if (!account) return { amount: 0, percentage: 0 }
    
    const equity = parseFloat(account.equity || '0')
    const lastEquity = parseFloat(account.last_equity || account.equity || '0')
    const amount = equity - lastEquity
    const percentage = lastEquity > 0 ? (amount / lastEquity) * 100 : 0
    
    return { amount, percentage }
  }

  const profitLoss = calculateProfitLoss()

  const getAccountValue = (field: keyof AlpacaAccount, defaultValue: string = '0') => {
    if (!account) return defaultValue
    return account[field] || defaultValue
  }

  if (loading) {
    return (
      <div className="min-h-screen text-white p-8">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span className="ml-2">Loading paper trading data...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen text-white p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">Paper Trading Dashboard</h1>
          <p className="text-gray-400">Practice trading with virtual money - Connected to Alpaca Paper Account</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-sm text-gray-400">Portfolio Value</p>
            <p className="text-2xl font-bold">
              {account ? formatCurrency(account.equity) : '$0.00'}
            </p>
          </div>
          <Badge className={profitLoss.amount >= 0 ? "bg-blue-600 hover:bg-blue-700" : "bg-red-600 hover:bg-red-700"}>
            {profitLoss.amount >= 0 ? <ArrowUpRight className="h-3 w-3 mr-1" /> : <ArrowDownRight className="h-3 w-3 mr-1" />}
            {profitLoss.percentage >= 0 ? '+' : ''}{profitLoss.percentage.toFixed(2)}%
          </Badge>
        </div>
      </div>

      {message && (
        <Alert className={`mb-6 ${message.type === 'error' ? 'border-red-500 bg-red-950' : 'border-blue-500 bg-blue-950'}`}>
          <AlertDescription className={message.type === 'error' ? 'text-red-200' : 'text-blue-200'}>
            {message.text}
          </AlertDescription>
        </Alert>
      )}

      {!account && !loading && (
        <Alert className="mb-6 border-yellow-500 bg-yellow-950">
          <AlertDescription className="text-yellow-200">
            <strong>Note:</strong> Unable to load account data. Please ensure your Alpaca API keys are configured in Settings.
          </AlertDescription>
        </Alert>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">Equity</CardTitle>
            <DollarSign className="h-5 w-5 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white">
              {account ? formatCurrency(account.equity) : '$0.00'}
            </div>
            <p className={`text-xs flex items-center gap-1 mt-1 ${profitLoss.amount >= 0 ? 'text-blue-500' : 'text-red-500'}`}>
              {profitLoss.amount >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {formatCurrency(profitLoss.amount)} today
            </p>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">Cash Balance</CardTitle>
            <Wallet className="h-5 w-5 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white">
              {account ? formatCurrency(account.cash) : '$0.00'}
            </div>
            <p className="text-xs text-gray-400 mt-1">Available cash</p>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">Buying Power</CardTitle>
            <TrendingUp className="h-5 w-5 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white">
              {account ? formatCurrency(account.buying_power) : '$0.00'}
            </div>
            <p className="text-xs text-gray-400 mt-1">Day trades: {account?.daytrade_count || 0}</p>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">Position Value</CardTitle>
            <Activity className="h-5 w-5 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white">
              {account ? formatCurrency(account.long_market_value) : '$0.00'}
            </div>
            <p className="text-xs text-gray-400 mt-1">Long positions</p>
          </CardContent>
        </Card>
      </div>

      {/* Current Positions */}
      <div className="mb-8">
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-white">Current Positions</CardTitle>
            <CardDescription className="text-gray-400">
              Active paper trading positions with real-time P&L
            </CardDescription>
          </CardHeader>
          <CardContent>
            {positionsLoading ? (
              <div className="text-center py-8 text-gray-400">
                <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                Loading positions...
              </div>
            ) : currentPositions.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Activity className="h-12 w-12 mx-auto mb-2 opacity-20" />
                <p>No current positions</p>
                <p className="text-sm mt-1">Start the trading bot to see positions here</p>
              </div>
            ) : (
              <div className="space-y-4">
                {currentPositions.map((position) => (
                  <div
                    key={position.id.toString()}
                    className="p-4 bg-[#252838] rounded-lg border border-gray-700 hover:border-blue-500 transition-all"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="text-2xl font-bold text-white">{position.symbol}</div>
                        <Badge className="bg-blue-600">BUY</Badge>
                        <Badge variant="outline" className="border-gray-600 text-gray-400">
                          {position.qty} shares
                        </Badge>
                      </div>
                      <div className="text-right">
                        <div className={`text-xl font-bold ${position.unrealized_pl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                          {formatCurrency(position.unrealized_pl)}
                        </div>
                        <div className={`text-sm ${position.unrealized_pl_percent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {position.unrealized_pl_percent >= 0 ? '+' : ''}{position.unrealized_pl_percent.toFixed(2)}%
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <div className="text-gray-500 mb-1">Entry Price</div>
                        <div className="font-semibold text-white">{formatCurrency(position.buy_price)}</div>
                      </div>
                      <div>
                        <div className="text-gray-500 mb-1">Current Price</div>
                        <div className="font-semibold text-white">{formatCurrency(position.current_price)}</div>
                      </div>
                      <div>
                        <div className="text-gray-500 mb-1">Position Value</div>
                        <div className="font-semibold text-white">{formatCurrency(position.current_value)}</div>
                      </div>
                      <div>
                        <div className="text-gray-500 mb-1 flex items-center gap-1">
                          <Activity className="h-3 w-3" />
                          Holding Time
                        </div>
                        <div className="font-semibold text-white">{position.holding_duration}</div>
                      </div>
                    </div>

                    <div className="mt-3 pt-3 border-t border-gray-700">
                      <div className="flex items-center justify-between text-xs text-gray-400">
                        <div>
                          Bought: {new Date(position.buy_timestamp).toLocaleString()}
                        </div>
                        <div className="text-blue-400">
                          Strategy: {position.strategy}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Trading Bot */}
      <div className="mb-8">
        <TradingBot mode="paper" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Portfolio Chart */}
        <Card className="lg:col-span-2 glass-card">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-white text-xl">Portfolio Performance</CardTitle>
                <CardDescription className="text-gray-400">Track your paper trading account value</CardDescription>
              </div>
              <div className="flex gap-2">
                <Button 
                  variant={chartPeriod === '1D' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setChartPeriod('1D')}
                  className={chartPeriod === '1D' ? 'bg-purple-600' : 'border-gray-600 text-gray-400'}
                >
                  Day
                </Button>
                <Button 
                  variant={chartPeriod === '1W' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setChartPeriod('1W')}
                  className={chartPeriod === '1W' ? 'bg-purple-600' : 'border-gray-600 text-gray-400'}
                >
                  Week
                </Button>
                <Button 
                  variant={chartPeriod === '1M' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setChartPeriod('1M')}
                  className={chartPeriod === '1M' ? 'bg-purple-600' : 'border-gray-600 text-gray-400'}
                >
                  Month
                </Button>
                <Button 
                  variant={chartPeriod === '1A' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setChartPeriod('1A')}
                  className={chartPeriod === '1A' ? 'bg-purple-600' : 'border-gray-600 text-gray-400'}
                >
                  Year
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="portfolioGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#a855f7" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis 
                      dataKey="time" 
                      stroke="#9ca3af" 
                      tick={{ fontSize: 12 }}
                      angle={-45}
                      textAnchor="end"
                      height={80}
                    />
                    <YAxis 
                      stroke="#9ca3af" 
                      tick={{ fontSize: 12 }}
                      tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#1a1d2e', border: '1px solid #374151', borderRadius: '8px' }}
                      labelStyle={{ color: '#fff' }}
                      formatter={(value: any) => [formatCurrency(value), 'Portfolio Value']}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="value" 
                      stroke="#a855f7" 
                      strokeWidth={3} 
                      fillOpacity={1} 
                      fill="url(#portfolioGradient)" 
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-gray-500">
                  <div className="text-center">
                    <Activity className="h-12 w-12 mx-auto mb-2 opacity-20" />
                    <p>No portfolio data available for selected period</p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Recent Trades Widget */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-white">Recent Trades</CardTitle>
            <CardDescription className="text-gray-400">Latest trading activity</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {trades.length > 0 ? (
                trades.slice(0, 10).map((trade) => (
                  <div key={trade.id} className="p-3 bg-[#252838] rounded-lg">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <Badge 
                          variant={trade.action === 'buy' ? 'default' : 'destructive'} 
                          className={trade.action === 'buy' ? 'bg-blue-600' : 'bg-red-600'}
                        >
                          {trade.action.toUpperCase()}
                        </Badge>
                        <span className="font-bold text-white">{trade.symbol}</span>
                      </div>
                      <span className="text-sm text-gray-400">{trade.qty} shares</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-400">{formatCurrency(trade.price)}</span>
                      <span className="text-gray-500">{formatDate(trade.created_at)}</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <Activity className="h-12 w-12 mx-auto mb-2 opacity-20" />
                  <p>No trades yet</p>
                  <p className="text-xs mt-1">Start the bot to execute trades</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
