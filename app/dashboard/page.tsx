'use client'

import { useEffect, useRef, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { TrendingUp, TrendingDown, Activity, DollarSign, AlertTriangle, CheckCircle } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { authFetch } from '@/lib/api-client'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts'

export const dynamic = 'force-dynamic'

export default function DashboardPage() {
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null)
  const [account, setAccount] = useState<any>(null)
  const [trades, setTrades] = useState<any[]>([])
  const [signals, setSignals] = useState<any[]>([])
  const [tradeMetrics, setTradeMetrics] = useState<any>(null)
  const [winRate, setWinRate] = useState<number>(0)
  const [trendData, setTrendData] = useState<any[]>([])
  const [chartPeriod, setChartPeriod] = useState<'1D' | '1W' | '1M' | '1A'>('1D')
  const [totalTrades, setTotalTrades] = useState<number>(0)
  const [recentActivity, setRecentActivity] = useState<any[]>([])
  const [portfolioChange, setPortfolioChange] = useState<number>(0)
  const [portfolioChangeAmount, setPortfolioChangeAmount] = useState<number>(0)
  const [portfolioHistory, setPortfolioHistory] = useState<any>(null)
  
  useEffect(() => {
    if (account) {
      loadPortfolioHistory()
    }
  }, [account, chartPeriod])

  const loadPortfolioHistory = async () => {
    try {
      const timeframeMap = {
        '1D': '5Min',
        '1W': '1H',
        '1M': '1D',
        '1A': '1W'
      }
      
      const response = await authFetch(`/api/account/history?period=${chartPeriod}&timeframe=${timeframeMap[chartPeriod]}`)
      const result = await response.json()
      
      if (result.success && result.data) {
        setPortfolioHistory(result.data)
        
        // Calculate profit/loss for the selected period
        const currentValue = account ? parseFloat(account.portfolio_value || account.equity || '0') : 0
        const baseValue = result.data.base_value || currentValue
        const amount = currentValue - baseValue
        const percentage = baseValue > 0 ? (amount / baseValue) * 100 : 0
        
        setPortfolioChange(percentage)
        setPortfolioChangeAmount(amount)
        
        // Transform data for chart
        const timestamps = result.data.timestamp || []
        const equity = result.data.equity || []
        
        const transformed = timestamps.map((ts: number, idx: number) => ({
          date: new Date(ts * 1000).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: chartPeriod === '1D' ? 'numeric' : undefined,
            minute: chartPeriod === '1D' ? '2-digit' : undefined
          }),
          portfolio: equity[idx] || 0,
          benchmark: baseValue * (1 + (equity[idx] - baseValue) / baseValue * 0.8) // Simulated benchmark
        }))
        
        setTrendData(transformed)
      }
    } catch (error) {
      console.error('Error loading portfolio history:', error)
    }
  }

  // This will be populated with real data if we have open positions
  const [riskData, setRiskData] = useState([
    { type: 'No positions', count: 0, level: 'low' },
  ])

  useEffect(() => {
    supabaseRef.current = createClient()
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      // Use authFetch to include Authorization header
      const accountRes = await authFetch('/api/account')
      if (accountRes.ok) {
        const accountData = await accountRes.json()
        if (accountData.success) {
          setAccount(accountData.data)
          
          // Portfolio change will be calculated from portfolio history
        }
      } else {
        // If account fetch fails, set account to null so UI shows zeros
        setAccount(null)
      }

      const tradesRes = await authFetch('/api/trade?limit=10')
      if (tradesRes.ok) {
        const tradesData = await tradesRes.json()
        if (tradesData.success) setTrades(tradesData.data || [])
      }

      const signalsRes = await authFetch('/api/trading')
      if (signalsRes.ok) {
        const signalsData = await signalsRes.json()
        if (signalsData.success && signalsData.status?.currentSignals) {
          // Filter out 'hold' signals and get the most recent ones
          const activeSignals = signalsData.status.currentSignals
            .filter((s: any) => s.action !== 'hold')
            .slice(0, 5)
          setSignals(activeSignals)
        } else {
          setSignals([])
        }
      } else {
        setSignals([])
      }

      // Fetch trade metrics for win rate calculation and total trades
      const logsRes = await authFetch('/api/logs?view=all')
      if (logsRes.ok) {
        const logsData = await logsRes.json()
        if (logsData.success) {
          setTradeMetrics(logsData.data.metrics)
          
          // Calculate total trades from metrics
          const metrics = logsData.data.metrics || {}
          const total = (metrics.open_positions || 0) + (metrics.closed_positions || 0)
          setTotalTrades(total)
          
          // Calculate win rate from closed positions
          const closedPositions = logsData.data.closedPositions || []
          if (closedPositions.length > 0) {
            const winningTrades = closedPositions.filter((pos: any) => pos.realized_pl > 0).length
            const calculatedWinRate = (winningTrades / closedPositions.length) * 100
            setWinRate(calculatedWinRate)
          } else {
            setWinRate(0)
          }
          
          // Get recent trades for activity feed
          const allTrades = logsData.data.trades || []
          const recentTrades = allTrades.slice(0, 5).map((trade: any) => {
            const tradeDate = new Date(trade.trade_timestamp || trade.created_at)
            const now = new Date()
            const diffMs = now.getTime() - tradeDate.getTime()
            const diffMins = Math.floor(diffMs / 60000)
            const diffHours = Math.floor(diffMs / 3600000)
            const diffDays = Math.floor(diffMs / 86400000)
            
            let timeAgo = ''
            if (diffMins < 1) {
              timeAgo = 'Just now'
            } else if (diffMins < 60) {
              timeAgo = `${diffMins} min ago`
            } else if (diffHours < 24) {
              timeAgo = `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`
            } else {
              timeAgo = `${diffDays} day${diffDays > 1 ? 's' : ''} ago`
            }
            
            return {
              action: `${trade.action === 'buy' ? 'Buy' : 'Sell'} ${trade.symbol}`,
              time: timeAgo,
              status: trade.order_status === 'filled' || trade.order_status === 'partially_filled' ? 'completed' : 'pending'
            }
          })
          setRecentActivity(recentTrades)
          
          // Update portfolio distribution data from open positions
          const openPositions = logsData.data.openPositions || []
          if (openPositions.length > 0) {
            const positionData = openPositions.slice(0, 4).map((pos: any) => ({
              type: pos.symbol,
              count: Math.abs(pos.total_qty || 0),
              level: (pos.unrealized_pl || 0) > 0 ? 'high' : (pos.unrealized_pl || 0) < 0 ? 'low' : 'medium'
            }))
            setRiskData(positionData.length > 0 ? positionData : [{ type: 'No positions', count: 0, level: 'low' }])
          } else {
            setRiskData([{ type: 'No positions', count: 0, level: 'low' }])
          }
        }
      }
    } catch (error) {
      console.error('Error fetching data:', error)
    }
  }

  return (
    <div className="min-h-screen text-white p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-2 text-white drop-shadow-lg">Trading Dashboard</h1>
          <p className="text-white/90 font-medium drop-shadow-md">Welcome back! Here's your portfolio overview</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right bg-black/30 backdrop-blur-sm px-4 py-2 rounded-lg border border-white/20">
            <p className="text-sm text-white/80 font-medium">Portfolio Value</p>
            <p className="text-2xl font-bold text-white drop-shadow-lg">${account ? parseFloat(account.portfolio_value || account.equity || '0').toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex gap-2">
              <button
                onClick={() => setChartPeriod('1D')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  chartPeriod === '1D'
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
              >
                Today
              </button>
              <button
                onClick={() => setChartPeriod('1W')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  chartPeriod === '1W'
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
              >
                Week
              </button>
              <button
                onClick={() => setChartPeriod('1M')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  chartPeriod === '1M'
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
              >
                Month
              </button>
              <button
                onClick={() => setChartPeriod('1A')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  chartPeriod === '1A'
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
              >
                Year
              </button>
            </div>
            <Badge className={portfolioChangeAmount >= 0 ? "bg-blue-400 hover:bg-blue-500" : "bg-red-600 hover:bg-red-700"}>
              {portfolioChangeAmount >= 0 ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
              <span className="mr-1">{portfolioChangeAmount >= 0 ? '+' : ''}${Math.abs(portfolioChangeAmount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              <span>({portfolioChange >= 0 ? '+' : ''}{portfolioChange.toFixed(2)}%)</span>
            </Badge>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-white/80">Total Value</CardTitle>
            <DollarSign className="h-5 w-5 text-blue-300" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white">
              ${account ? parseFloat(account.portfolio_value || account.equity || '0').toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
            </div>
            <p className={`text-xs flex items-center gap-1 mt-1 ${portfolioChange >= 0 ? 'text-blue-300' : 'text-red-400'}`}>
              {portfolioChange >= 0 ? (
                <TrendingUp className="h-3 w-3" />
              ) : (
                <TrendingDown className="h-3 w-3" />
              )}
              {portfolioChange !== 0 ? (
                <>
                  {portfolioChangeAmount >= 0 ? '+' : ''}${Math.abs(portfolioChangeAmount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({portfolioChange >= 0 ? '+' : ''}{portfolioChange.toFixed(2)}%)
                </>
              ) : (
                'No change'
              )}
            </p>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-white/80">Total Trades</CardTitle>
            <Activity className="h-5 w-5 text-blue-300" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white">{totalTrades}</div>
            <p className="text-xs text-white/70 mt-1">
              {tradeMetrics ? `${tradeMetrics.open_positions || 0} open, ${tradeMetrics.closed_positions || 0} closed` : 'No trades yet'}
            </p>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-white/80">Win Rate</CardTitle>
            <TrendingUp className="h-5 w-5 text-blue-300" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white">
              {winRate.toFixed(1)}%
            </div>
            <p className={`text-xs mt-1 ${winRate > 0 ? 'text-blue-300' : 'text-white/70'}`}>
              {tradeMetrics ? `${tradeMetrics.closed_positions} closed trades` : 'No trades yet'}
            </p>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-white/80">AI Signals</CardTitle>
            <Activity className="h-5 w-5 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white">{signals.length}</div>
            <p className="text-xs text-white/70 mt-1">Active recommendations</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Trend Chart */}
        <Card className="lg:col-span-2 glass-card">
          <CardHeader>
            <div className="flex items-center justify-between mb-4">
              <div>
                <CardTitle className="text-white text-xl">Portfolio Trend</CardTitle>
                <CardDescription className="text-white/70">
                  {chartPeriod === '1D' && 'Performance today'}
                  {chartPeriod === '1W' && 'Performance over the last 7 days'}
                  {chartPeriod === '1M' && 'Performance over the last 30 days'}
                  {chartPeriod === '1A' && 'Performance over the last year'}
                </CardDescription>
              </div>
              <div className="flex gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-blue-300"></div>
                  <span className="text-white/90">Your Portfolio</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-blue-400"></div>
                  <span className="text-white/90">Benchmark</span>
                </div>
              </div>
            </div>
            
            {/* Period Selector */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setChartPeriod('1D')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  chartPeriod === '1D'
                    ? 'bg-blue-400 text-white'
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
              >
                Today
              </button>
              <button
                onClick={() => setChartPeriod('1W')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  chartPeriod === '1W'
                    ? 'bg-blue-400 text-white'
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
              >
                Week
              </button>
              <button
                onClick={() => setChartPeriod('1M')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  chartPeriod === '1M'
                    ? 'bg-blue-400 text-white'
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
              >
                Month
              </button>
              <button
                onClick={() => setChartPeriod('1A')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  chartPeriod === '1A'
                    ? 'bg-blue-400 text-white'
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
              >
                Year
              </button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData}>
                  <defs>
                    <linearGradient id="portfolioGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#60a5fa" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="benchmarkGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#93c5fd" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#93c5fd" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="date" stroke="#9ca3af" />
                  <YAxis stroke="#9ca3af" />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1a1d2e', border: '1px solid #374151', borderRadius: '8px' }}
                    labelStyle={{ color: '#fff' }}
                  />
                  <Area type="monotone" dataKey="portfolio" stroke="#60a5fa" strokeWidth={3} fillOpacity={1} fill="url(#portfolioGradient)" />
                  <Area type="monotone" dataKey="benchmark" stroke="#93c5fd" strokeWidth={2} fillOpacity={1} fill="url(#benchmarkGradient)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Activity Feed */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-white">Recent Activity</CardTitle>
            <CardDescription className="text-white/70">Latest trading actions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentActivity.length > 0 ? recentActivity.map((activity, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 bg-blue-400/10 backdrop-blur-sm rounded-lg">
                  <div className="flex items-center gap-3">
                    {activity.status === 'completed' ? (
                      <CheckCircle className="h-5 w-5 text-blue-300" />
                    ) : (
                      <Activity className="h-5 w-5 text-yellow-400 animate-pulse" />
                    )}
                    <div>
                      <p className="text-white font-medium">{activity.action}</p>
                      <p className="text-xs text-white/70">{activity.time}</p>
                    </div>
                  </div>
                  <Badge variant={activity.status === 'completed' ? 'default' : 'outline'} className={activity.status === 'completed' ? 'bg-blue-400 text-white' : 'border-yellow-400 text-yellow-400'}>
                    {activity.status}
                  </Badge>
                </div>
              )) : (
                <div className="text-center py-8 text-white/50">
                  <Activity className="h-12 w-12 mx-auto mb-2 opacity-30" />
                  <p>No recent activity</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Risk Analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-white">Portfolio Distribution</CardTitle>
            <CardDescription className="text-white/70">Open positions by symbol</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              {tradeMetrics && tradeMetrics.open_positions > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={riskData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="type" stroke="#9ca3af" />
                    <YAxis stroke="#9ca3af" />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#1a1d2e', border: '1px solid #374151', borderRadius: '8px' }}
                      labelStyle={{ color: '#fff' }}
                    />
                    <Bar dataKey="count" fill="#60a5fa" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-white/50">
                  <div className="text-center">
                    <Activity className="h-12 w-12 mx-auto mb-2 opacity-30" />
                    <p>No open positions to display</p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-white">AI Trading Signals</CardTitle>
            <CardDescription className="text-white/70">Latest recommendations from AI</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {signals.length > 0 ? signals.map((signal, idx) => (
                <div key={idx} className="p-4 bg-blue-400/10 backdrop-blur-sm rounded-lg border border-gray-600 hover:border-blue-400 transition-colors">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Badge variant={signal.action === 'buy' ? 'default' : 'destructive'} className={signal.action === 'buy' ? 'bg-blue-400 text-white' : 'bg-red-500 text-white'}>
                        {signal.action.toUpperCase()}
                      </Badge>
                      <span className="font-bold text-white">{signal.symbol}</span>
                    </div>
                    <span className="text-sm text-white/80">{(signal.confidence * 100).toFixed(0)}%</span>
                  </div>
                  <p className="text-xs text-white/70">{signal.reasoning}</p>
                </div>
              )) : (
                <div className="text-center py-8 text-white/50">
                  <Activity className="h-12 w-12 mx-auto mb-2 opacity-30" />
                  <p>Start the trading bot to see AI signals</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
