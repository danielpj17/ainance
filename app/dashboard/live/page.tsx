'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/utils/supabase/client'
import { authFetch } from '@/lib/api-client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, TrendingUp, TrendingDown, DollarSign, Activity, Wallet, ArrowUpRight, ArrowDownRight, Shield, AlertTriangle, Info } from 'lucide-react'
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

export default function LiveTradingPage() {
  const [trades, setTrades] = useState<Trade[]>([])
  const [account, setAccount] = useState<AlpacaAccount | null>(null)
  const [portfolioHistory, setPortfolioHistory] = useState<PortfolioHistory | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null)
  const [chartPeriod, setChartPeriod] = useState<'1D' | '1W' | '1M' | '1A'>('1D')
  const [chartData, setChartData] = useState<any[]>([])
  const [currentPositions, setCurrentPositions] = useState<CurrentPosition[]>([])
  const [positionsLoading, setPositionsLoading] = useState(false)
  const [hasApiKeys, setHasApiKeys] = useState(false)
  const [selectedPosition, setSelectedPosition] = useState<CurrentPosition | null>(null)
  const [showMetricsModal, setShowMetricsModal] = useState(false)

  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null)

  useEffect(() => {
    supabaseRef.current = createClient()
    checkApiKeys()
    loadData()
    
    // Set up realtime subscriptions for trades
    let tradesChannel: any = null
    if (supabaseRef.current) {
      tradesChannel = supabaseRef.current
        .channel('live-trades')
        .on('postgres_changes', 
          { event: 'INSERT', schema: 'public', table: 'trades', filter: 'account_type=eq.live' },
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
    if (account) {
      loadPortfolioHistory()
    }
  }, [chartPeriod, account])

  const checkApiKeys = async () => {
    try {
      const sb = supabaseRef.current
      if (!sb) return
      const { data: { user } } = await sb.auth.getUser()
      if (user) {
        const { data: apiKeys, error } = await sb.rpc('get_user_api_keys', {
          user_uuid: user.id
        })

        if (!error && apiKeys?.[0]?.alpaca_live_key) {
          setHasApiKeys(true)
        } else {
          setMessage({ 
            type: 'warning', 
            text: 'Live trading API keys not configured. Please add your Alpaca live trading keys in settings.' 
          })
        }
      }
    } catch (error) {
      console.error('Error checking API keys:', error)
    }
  }

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
        // Filter for live positions only
        const livePositions = (data.data.currentTrades || []).filter((pos: CurrentPosition) => 
          pos.account_type === 'live'
        )
        setCurrentPositions(livePositions)
      }
    } catch (error) {
      console.error('Error loading current positions:', error)
    } finally {
      setPositionsLoading(false)
    }
  }

  const loadAccountData = async () => {
    try {
      const response = await authFetch('/api/account?account_type=live')
      const result = await response.json()
      
      console.log('Live Account API response:', result)
      
      if (result.success && result.data) {
        console.log('Live Account data:', result.data)
        setAccount(result.data)
        // Clear any previous error messages if we got data (even if zeros)
        if (message?.type === 'error') {
          setMessage(null)
        }
      } else {
        console.error('Failed to load live account data:', result.error)
        // Set account to zeros if API returns error for authenticated user
        setAccount({
          id: 'N/A',
          account_number: 'N/A',
          status: 'INACTIVE',
          currency: 'USD',
          buying_power: '0.00',
          cash: '0.00',
          portfolio_value: '0.00',
          equity: '0.00',
          last_equity: '0.00',
          long_market_value: '0.00',
          short_market_value: '0.00',
          initial_margin: '0.00',
          maintenance_margin: '0.00',
          daytrade_count: 0,
          daytrading_buying_power: '0.00',
          pattern_day_trader: false
        })
        // Only show error if it's not about missing keys (which is expected)
        if (result.error && !result.error.includes('API keys not configured')) {
          setMessage({ type: 'error', text: `Account error: ${result.error}` })
        }
      }
    } catch (error) {
      console.error('Error loading live account data:', error)
      // Set account to zeros on error
      setAccount({
        id: 'N/A',
        account_number: 'N/A',
        status: 'INACTIVE',
        currency: 'USD',
        buying_power: '0.00',
        cash: '0.00',
        portfolio_value: '0.00',
        equity: '0.00',
        last_equity: '0.00',
        long_market_value: '0.00',
        short_market_value: '0.00',
        initial_margin: '0.00',
        maintenance_margin: '0.00',
        daytrade_count: 0,
        daytrading_buying_power: '0.00',
        pattern_day_trader: false
      })
    }
  }

  const loadTradesData = async () => {
    try {
      const sb = supabaseRef.current
      if (!sb) return

      const { data: tradesData, error: tradesError } = await sb
        .from('trades')
        .select('*')
        .eq('account_type', 'live')
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
      
      const response = await authFetch(`/api/account/history?period=${chartPeriod}&timeframe=${timeframeMap[chartPeriod]}&account_type=live`)
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

  // Helper function to calculate dynamic Y-axis domain with 5% padding
  const calculateYAxisDomain = (data: any[], dataKeys: string[]): [number, number] => {
    if (!data || data.length === 0) return [0, 100]
    
    let min = Infinity
    let max = -Infinity
    
    data.forEach((item) => {
      dataKeys.forEach((key) => {
        const value = item[key]
        if (typeof value === 'number' && !isNaN(value)) {
          min = Math.min(min, value)
          max = Math.max(max, value)
        }
      })
    })
    
    if (min === Infinity || max === -Infinity) return [0, 100]
    
    const range = max - min
    const padding = range * 0.05 // 5% padding
    
    return [min - padding, max + padding]
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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString()
  }

  const calculateProfitLoss = () => {
    if (!account || !portfolioHistory) {
      // Fallback to today's change if no history
      if (!account) return { amount: 0, percentage: 0 }
      const equity = parseFloat(account.equity || '0')
      const lastEquity = parseFloat(account.last_equity || account.equity || '0')
      const amount = equity - lastEquity
      const percentage = lastEquity > 0 ? (amount / lastEquity) * 100 : 0
      return { amount, percentage }
    }
    
    const currentValue = parseFloat(account.equity || '0')
    const baseValue = portfolioHistory.base_value || currentValue
    const amount = currentValue - baseValue
    const percentage = baseValue > 0 ? (amount / baseValue) * 100 : 0
    
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
          <span className="ml-2">Loading live trading data...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen text-white p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
            Live Trading Dashboard
            <Badge className="bg-green-600 hover:bg-green-700">
              <Shield className="h-3 w-3 mr-1" />
              LIVE
            </Badge>
          </h1>
          <div className="flex items-center gap-3">
            <p className="text-white/80">Real money trading - Connected to Alpaca Live Account</p>
            <span className="text-xs text-red-400 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              Trading involves risk of loss
            </span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right bg-black/30 backdrop-blur-sm px-4 py-2 rounded-lg border border-white/20">
            <p className="text-sm text-white/80 font-medium">Portfolio Value</p>
            <p className="text-2xl font-bold text-white drop-shadow-lg">
              {account ? formatCurrency(account.equity) : '$0.00'}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex gap-2">
              <button
                onClick={() => setChartPeriod('1D')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  chartPeriod === '1D'
                    ? 'bg-green-400 text-white'
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
              >
                Today
              </button>
              <button
                onClick={() => setChartPeriod('1W')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  chartPeriod === '1W'
                    ? 'bg-green-400 text-white'
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
              >
                Week
              </button>
              <button
                onClick={() => setChartPeriod('1M')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  chartPeriod === '1M'
                    ? 'bg-green-400 text-white'
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
              >
                Month
              </button>
              <button
                onClick={() => setChartPeriod('1A')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  chartPeriod === '1A'
                    ? 'bg-green-400 text-white'
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
              >
                Year
              </button>
            </div>
            <Badge className={profitLoss.amount >= 0 ? "bg-green-400 hover:bg-green-500 text-white" : "bg-red-600 hover:bg-red-700 text-white"}>
              {profitLoss.amount >= 0 ? <ArrowUpRight className="h-3 w-3 mr-1 text-white" /> : <ArrowDownRight className="h-3 w-3 mr-1 text-white" />}
              <span className="mr-1 text-white">{formatCurrency(profitLoss.amount)}</span>
              <span className="text-white">({profitLoss.percentage >= 0 ? '+' : ''}{profitLoss.percentage.toFixed(2)}%)</span>
            </Badge>
          </div>
        </div>
      </div>

      {message && (
        <Alert className={`mb-6 ${
          message.type === 'error' ? 'border-red-500 bg-red-950' : 
          message.type === 'warning' ? 'border-yellow-500 bg-yellow-950' :
          'border-green-500 bg-green-950'
        }`}>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className={
            message.type === 'error' ? 'text-red-200' : 
            message.type === 'warning' ? 'text-yellow-200' :
            'text-green-200'
          }>
            {message.text}
          </AlertDescription>
        </Alert>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">Equity</CardTitle>
            <DollarSign className="h-5 w-5 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white">
              {account ? formatCurrency(account.equity) : '$0.00'}
            </div>
            <p className={`text-xs flex items-center gap-1 mt-1 ${profitLoss.amount >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {profitLoss.amount >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {formatCurrency(profitLoss.amount)} ({profitLoss.percentage >= 0 ? '+' : ''}{profitLoss.percentage.toFixed(2)}%)
            </p>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">Cash Balance</CardTitle>
            <Wallet className="h-5 w-5 text-green-500" />
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
            <TrendingUp className="h-5 w-5 text-green-500" />
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

      {/* Trading Bot & Portfolio Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Trading Bot */}
        <div className="lg:col-span-1 flex flex-col">
          {hasApiKeys ? (
            <TradingBot mode="live" />
          ) : (
            <Card className="glass-card opacity-50">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  Trading Bot
                  <Badge className="bg-gray-600">Disabled</Badge>
                </CardTitle>
                <CardDescription className="text-gray-400">
                  Configure your live trading API keys in Settings to enable the trading bot.
                </CardDescription>
              </CardHeader>
            </Card>
          )}
        </div>
        
        {/* Portfolio Chart */}
        <Card className="lg:col-span-2 glass-card">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-white text-xl">Portfolio Performance</CardTitle>
                <CardDescription className="text-gray-400">Track your live trading account value</CardDescription>
              </div>
              <div className="flex gap-2">
                <Button 
                  variant={chartPeriod === '1D' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setChartPeriod('1D')}
                  className={chartPeriod === '1D' ? 'bg-green-400' : 'border-gray-600 text-gray-400'}
                >
                  Today
                </Button>
                <Button 
                  variant={chartPeriod === '1W' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setChartPeriod('1W')}
                  className={chartPeriod === '1W' ? 'bg-green-400' : 'border-gray-600 text-gray-400'}
                >
                  Week
                </Button>
                <Button 
                  variant={chartPeriod === '1M' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setChartPeriod('1M')}
                  className={chartPeriod === '1M' ? 'bg-green-400' : 'border-gray-600 text-gray-400'}
                >
                  Month
                </Button>
                <Button 
                  variant={chartPeriod === '1A' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setChartPeriod('1A')}
                  className={chartPeriod === '1A' ? 'bg-green-400' : 'border-gray-600 text-gray-400'}
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
                      <linearGradient id="livePortfolioGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
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
                      domain={calculateYAxisDomain(chartData, ['value'])}
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#1a1d2e', border: '1px solid #374151', borderRadius: '8px' }}
                      labelStyle={{ color: '#fff' }}
                      formatter={(value: any) => [formatCurrency(value), 'Portfolio Value']}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="value" 
                      stroke="#22c55e" 
                      strokeWidth={3} 
                      fillOpacity={1} 
                      fill="url(#livePortfolioGradient)" 
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
      </div>

      {/* Current Positions */}
      <div className="mb-8">
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-white">Current Positions</CardTitle>
            <CardDescription className="text-gray-400">
              Active live trading positions with real-time P&L
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
                    className="p-4 bg-[#252838] rounded-lg border border-gray-700 hover:border-green-500 transition-all"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="text-2xl font-bold text-white">{position.symbol}</div>
                        <Badge className="bg-green-400">BUY</Badge>
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
                        <div className="font-semibold text-white">{formatDuration(position.holding_duration)}</div>
                      </div>
                    </div>

                    <div className="mt-3 pt-3 border-t border-gray-700">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4 text-xs text-gray-400">
                          <div>
                            Bought: {new Date(position.buy_timestamp).toLocaleString()}
                          </div>
                          <div className="text-green-400">
                            Strategy: {position.strategy}
                          </div>
                        </div>
                        {position.buy_decision_metrics && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedPosition(position)
                              setShowMetricsModal(true)
                            }}
                            className="border-green-500 text-green-400 hover:bg-green-500/10"
                          >
                            <Info className="h-4 w-4 mr-1" />
                            View Metrics
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Buy Decision Metrics Modal */}
      {showMetricsModal && selectedPosition && selectedPosition.buy_decision_metrics && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowMetricsModal(false)}>
          <div className="bg-[#1a1d2e] rounded-lg border border-gray-700 max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-white">Buy Decision Metrics: {selectedPosition.symbol}</h2>
                <button
                  onClick={() => setShowMetricsModal(false)}
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
                        {((selectedPosition.buy_decision_metrics?.confidence || 0) * 100).toFixed(1)}%
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-500 text-sm mb-1">Adjusted Confidence</div>
                      <div className="text-2xl font-bold text-purple-400">
                        {((selectedPosition.buy_decision_metrics?.adjusted_confidence || 0) * 100).toFixed(1)}%
                      </div>
                    </div>
                  </div>
                  
                  <div className="mb-4">
                    <div className="text-gray-500 text-sm mb-1">Reasoning</div>
                    <div className="text-white bg-[#1a1d2e] p-3 rounded border border-gray-700">
                      {selectedPosition.buy_decision_metrics?.reasoning || 'No reasoning provided'}
                    </div>
                  </div>

                  {/* Technical Indicators */}
                  {selectedPosition.buy_decision_metrics?.indicators && Object.keys(selectedPosition.buy_decision_metrics.indicators).length > 0 && (
                    <div className="mb-4">
                      <div className="text-gray-500 text-sm mb-2">Technical Indicators</div>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                        {selectedPosition.buy_decision_metrics.indicators.rsi !== undefined && (
                          <div className="bg-[#1a1d2e] p-2 rounded border border-gray-700">
                            <div className="text-gray-400 text-xs mb-1">RSI</div>
                            <div className={`font-bold ${
                              selectedPosition.buy_decision_metrics.indicators.rsi > 70 
                                ? 'text-red-400' 
                                : selectedPosition.buy_decision_metrics.indicators.rsi < 30 
                                  ? 'text-green-400' 
                                  : 'text-white'
                            }`}>
                              {selectedPosition.buy_decision_metrics.indicators.rsi.toFixed(2)}
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              {selectedPosition.buy_decision_metrics.indicators.rsi > 70 ? 'Overbought' : 
                               selectedPosition.buy_decision_metrics.indicators.rsi < 30 ? 'Oversold' : 'Neutral'}
                            </div>
                          </div>
                        )}
                        {selectedPosition.buy_decision_metrics.indicators.macd !== undefined && (
                          <div className="bg-[#1a1d2e] p-2 rounded border border-gray-700">
                            <div className="text-gray-400 text-xs mb-1">MACD</div>
                            <div className={`font-bold ${
                              selectedPosition.buy_decision_metrics.indicators.macd > 0 
                                ? 'text-green-400' 
                                : 'text-red-400'
                            }`}>
                              {selectedPosition.buy_decision_metrics.indicators.macd.toFixed(4)}
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              {selectedPosition.buy_decision_metrics.indicators.macd > 0 ? 'Bullish' : 'Bearish'}
                            </div>
                          </div>
                        )}
                        {selectedPosition.buy_decision_metrics.indicators.stochastic !== undefined && (
                          <div className="bg-[#1a1d2e] p-2 rounded border border-gray-700">
                            <div className="text-gray-400 text-xs mb-1">Stochastic</div>
                            <div className={`font-bold ${
                              selectedPosition.buy_decision_metrics.indicators.stochastic > 80 
                                ? 'text-red-400' 
                                : selectedPosition.buy_decision_metrics.indicators.stochastic < 20 
                                  ? 'text-green-400' 
                                  : 'text-white'
                            }`}>
                              {selectedPosition.buy_decision_metrics.indicators.stochastic.toFixed(2)}
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              {selectedPosition.buy_decision_metrics.indicators.stochastic > 80 ? 'Overbought' : 
                               selectedPosition.buy_decision_metrics.indicators.stochastic < 20 ? 'Oversold' : 'Neutral'}
                            </div>
                          </div>
                        )}
                        {selectedPosition.buy_decision_metrics.indicators.bb_position !== undefined && (
                          <div className="bg-[#1a1d2e] p-2 rounded border border-gray-700">
                            <div className="text-gray-400 text-xs mb-1">BB Position</div>
                            <div className={`font-bold ${
                              selectedPosition.buy_decision_metrics.indicators.bb_position > 0.9 
                                ? 'text-red-400' 
                                : selectedPosition.buy_decision_metrics.indicators.bb_position < 0.1 
                                  ? 'text-green-400' 
                                  : 'text-white'
                            }`}>
                              {(selectedPosition.buy_decision_metrics.indicators.bb_position * 100).toFixed(1)}%
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              {selectedPosition.buy_decision_metrics.indicators.bb_position > 0.9 ? 'Upper Band' : 
                               selectedPosition.buy_decision_metrics.indicators.bb_position < 0.1 ? 'Lower Band' : 'Mid Range'}
                            </div>
                          </div>
                        )}
                        {selectedPosition.buy_decision_metrics.indicators.volume_ratio !== undefined && (
                          <div className="bg-[#1a1d2e] p-2 rounded border border-gray-700">
                            <div className="text-gray-400 text-xs mb-1">Volume Ratio</div>
                            <div className={`font-bold ${
                              selectedPosition.buy_decision_metrics.indicators.volume_ratio > 2 
                                ? 'text-green-400' 
                                : selectedPosition.buy_decision_metrics.indicators.volume_ratio < 0.5 
                                  ? 'text-yellow-400' 
                                  : 'text-white'
                            }`}>
                              {selectedPosition.buy_decision_metrics.indicators.volume_ratio.toFixed(2)}x
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              {selectedPosition.buy_decision_metrics.indicators.volume_ratio > 2 ? 'High Volume' : 
                               selectedPosition.buy_decision_metrics.indicators.volume_ratio < 0.5 ? 'Low Volume' : 'Normal'}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Model Probabilities */}
                  {selectedPosition.buy_decision_metrics?.probabilities && Object.keys(selectedPosition.buy_decision_metrics.probabilities).length > 0 && (
                    <div className="mb-4">
                      <div className="text-gray-500 text-sm mb-2">ML Model Probabilities</div>
                      <div className="grid grid-cols-3 gap-2 text-sm">
                        {Object.entries(selectedPosition.buy_decision_metrics.probabilities).map(([action, prob]: [string, any]) => (
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
                        (selectedPosition.buy_decision_metrics?.news_sentiment || 0) > 0 
                          ? 'text-green-400' 
                          : (selectedPosition.buy_decision_metrics?.news_sentiment || 0) < 0 
                            ? 'text-red-400' 
                            : 'text-gray-400'
                      }`}>
                        {((selectedPosition.buy_decision_metrics?.news_sentiment || 0) * 100).toFixed(1)}%
                      </div>
                      {selectedPosition.buy_decision_metrics?.sentiment_boost !== undefined && selectedPosition.buy_decision_metrics.sentiment_boost > 0 && (
                        <div className="text-xs text-purple-400 mt-1">
                          +{((selectedPosition.buy_decision_metrics.sentiment_boost) * 100).toFixed(1)}% boost
                        </div>
                      )}
                    </div>
                    <div className="text-center">
                      <div className="text-gray-500 mb-1">Market Risk</div>
                      <div className={`font-bold ${
                        (selectedPosition.buy_decision_metrics?.market_risk || 0) < 0.3 
                          ? 'text-green-400' 
                          : (selectedPosition.buy_decision_metrics?.market_risk || 0) < 0.6 
                            ? 'text-yellow-400' 
                            : 'text-red-400'
                      }`}>
                        {((selectedPosition.buy_decision_metrics?.market_risk || 0) * 100).toFixed(0)}%
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-gray-500 mb-1">Buy Price</div>
                      <div className="font-bold text-white">
                        {formatCurrency(selectedPosition.buy_price)}
                      </div>
                    </div>
                  </div>

                  {/* Buy Timestamp */}
                  {selectedPosition.buy_timestamp && (
                    <div className="mt-4 pt-4 border-t border-gray-700">
                      <div className="text-gray-500 text-sm mb-1">Buy Timestamp</div>
                      <div className="text-white text-sm">
                        {new Date(selectedPosition.buy_timestamp).toLocaleString('en-US', {
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

                  {selectedPosition.buy_decision_metrics?.news_headlines && selectedPosition.buy_decision_metrics.news_headlines.length > 0 && (
                    <div className="mt-4">
                      <div className="text-gray-500 text-sm mb-2">News Headlines</div>
                      <ul className="space-y-1 text-xs text-gray-400">
                        {selectedPosition.buy_decision_metrics.news_headlines.map((headline: string, idx: number) => (
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
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
