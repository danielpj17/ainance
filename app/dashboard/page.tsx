'use client'

import { useEffect, useRef, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { TrendingUp, TrendingDown, Activity, DollarSign, AlertTriangle, CheckCircle } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts'

export const dynamic = 'force-dynamic'

export default function DashboardPage() {
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null)
  const [account, setAccount] = useState<any>(null)
  const [trades, setTrades] = useState<any[]>([])
  const [signals, setSignals] = useState<any[]>([])
  const [tradeMetrics, setTradeMetrics] = useState<any>(null)
  const [winRate, setWinRate] = useState<number>(0)
  
  // Mock trend data
  const trendData = [
    { date: '29 Oct', portfolio: 98000, benchmark: 97000 },
    { date: '30 Oct', portfolio: 99500, benchmark: 97500 },
    { date: '31 Oct', portfolio: 101200, benchmark: 98200 },
    { date: '1 Nov', portfolio: 100800, benchmark: 98800 },
    { date: '2 Nov', portfolio: 102500, benchmark: 99200 },
    { date: '3 Nov', portfolio: 103800, benchmark: 99800 },
    { date: '4 Nov', portfolio: 102200, benchmark: 100200 },
    { date: '5 Nov', portfolio: 104500, benchmark: 100800 },
    { date: '6 Nov', portfolio: 106200, benchmark: 101500 },
  ]

  const riskData = [
    { type: 'Git Exposure', count: 158, level: 'low' },
    { type: 'SSL Certificate', count: 214, level: 'high' },
    { type: 'API Keys', count: 87, level: 'medium' },
    { type: 'Database', count: 42, level: 'low' },
  ]

  const recentActivity = [
    { action: 'Buy AAPL', time: '2 min ago', status: 'completed' },
    { action: 'Sell TSLA', time: '15 min ago', status: 'completed' },
    { action: 'Buy MSFT', time: '1 hour ago', status: 'pending' },
  ]

  useEffect(() => {
    supabaseRef.current = createClient()
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      const accountRes = await fetch('/api/account')
      if (accountRes.ok) {
        const accountData = await accountRes.json()
        if (accountData.success) setAccount(accountData.data)
      }

      const tradesRes = await fetch('/api/trade?limit=10')
      if (tradesRes.ok) {
        const tradesData = await tradesRes.json()
        if (tradesData.success) setTrades(tradesData.data || [])
      }

      const signalsRes = await fetch('/api/trading')
      if (signalsRes.ok) {
        const signalsData = await signalsRes.json()
        if (signalsData.success && signalsData.status?.currentSignals) {
          setSignals(signalsData.status.currentSignals.slice(0, 5))
        }
      }

      // Fetch trade metrics for win rate calculation
      const logsRes = await fetch('/api/logs?view=closed')
      if (logsRes.ok) {
        const logsData = await logsRes.json()
        if (logsData.success) {
          setTradeMetrics(logsData.data.metrics)
          
          // Calculate win rate from closed positions
          const closedPositions = logsData.data.closedPositions || []
          if (closedPositions.length > 0) {
            const winningTrades = closedPositions.filter((pos: any) => pos.realized_pl > 0).length
            const calculatedWinRate = (winningTrades / closedPositions.length) * 100
            setWinRate(calculatedWinRate)
          } else {
            setWinRate(0)
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
          <h1 className="text-3xl font-bold mb-2">Trading Dashboard</h1>
          <p className="text-gray-400">Welcome back! Here's your portfolio overview</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-sm text-gray-400">Portfolio Value</p>
            <p className="text-2xl font-bold">${account ? parseFloat(account.portfolio_value).toLocaleString() : '100,000'}</p>
          </div>
          <div className="flex gap-2">
            <Badge className="bg-blue-600 hover:bg-blue-700">High</Badge>
            <Badge variant="outline" className="text-gray-400 border-gray-600">Medium</Badge>
            <Badge variant="outline" className="text-gray-400 border-gray-600">Low</Badge>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">Total Value</CardTitle>
            <DollarSign className="h-5 w-5 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white">
              ${account ? parseFloat(account.portfolio_value).toLocaleString() : '100,000'}
            </div>
            <p className="text-xs text-blue-500 flex items-center gap-1 mt-1">
              <TrendingUp className="h-3 w-3" />
              +2.5% from last week
            </p>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">Total Trades</CardTitle>
            <Activity className="h-5 w-5 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white">{trades.length}</div>
            <p className="text-xs text-gray-400 mt-1">Active positions</p>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">Win Rate</CardTitle>
            <TrendingUp className="h-5 w-5 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white">
              {winRate.toFixed(1)}%
            </div>
            <p className={`text-xs mt-1 ${winRate > 0 ? 'text-blue-500' : 'text-gray-400'}`}>
              {tradeMetrics ? `${tradeMetrics.closed_positions} closed trades` : 'No trades yet'}
            </p>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">AI Signals</CardTitle>
            <Activity className="h-5 w-5 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white">{signals.length}</div>
            <p className="text-xs text-gray-400 mt-1">Active recommendations</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Trend Chart */}
        <Card className="lg:col-span-2 glass-card">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-white text-xl">Portfolio Trend</CardTitle>
                <CardDescription className="text-gray-400">Performance over the last 2 weeks</CardDescription>
              </div>
              <div className="flex gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                  <span className="text-gray-400">Your Portfolio</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                  <span className="text-gray-400">Benchmark</span>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData}>
                  <defs>
                    <linearGradient id="portfolioGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#a855f7" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="benchmarkGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="date" stroke="#9ca3af" />
                  <YAxis stroke="#9ca3af" />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1a1d2e', border: '1px solid #374151', borderRadius: '8px' }}
                    labelStyle={{ color: '#fff' }}
                  />
                  <Area type="monotone" dataKey="portfolio" stroke="#a855f7" strokeWidth={3} fillOpacity={1} fill="url(#portfolioGradient)" />
                  <Area type="monotone" dataKey="benchmark" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#benchmarkGradient)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Activity Feed */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-white">Recent Activity</CardTitle>
            <CardDescription className="text-gray-400">Latest trading actions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentActivity.map((activity, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 bg-blue-500/10 backdrop-blur-sm rounded-lg">
                  <div className="flex items-center gap-3">
                    {activity.status === 'completed' ? (
                      <CheckCircle className="h-5 w-5 text-blue-500" />
                    ) : (
                      <Activity className="h-5 w-5 text-yellow-500 animate-pulse" />
                    )}
                    <div>
                      <p className="text-white font-medium">{activity.action}</p>
                      <p className="text-xs text-gray-400">{activity.time}</p>
                    </div>
                  </div>
                  <Badge variant={activity.status === 'completed' ? 'default' : 'outline'} className={activity.status === 'completed' ? 'bg-blue-600' : 'border-yellow-600 text-yellow-600'}>
                    {activity.status}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Risk Analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-white">Risk Analysis</CardTitle>
            <CardDescription className="text-gray-400">Portfolio risk distribution</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={riskData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="type" stroke="#9ca3af" />
                  <YAxis stroke="#9ca3af" />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1a1d2e', border: '1px solid #374151', borderRadius: '8px' }}
                    labelStyle={{ color: '#fff' }}
                  />
                  <Bar dataKey="count" fill="#a855f7" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-white">AI Trading Signals</CardTitle>
            <CardDescription className="text-gray-400">Latest recommendations from AI</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {signals.length > 0 ? signals.map((signal, idx) => (
                <div key={idx} className="p-4 bg-blue-500/10 backdrop-blur-sm rounded-lg border border-gray-700 hover:border-blue-500 transition-colors">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Badge variant={signal.action === 'buy' ? 'default' : 'destructive'} className={signal.action === 'buy' ? 'bg-blue-600' : 'bg-red-600'}>
                        {signal.action.toUpperCase()}
                      </Badge>
                      <span className="font-bold text-white">{signal.symbol}</span>
                    </div>
                    <span className="text-sm text-gray-400">{(signal.confidence * 100).toFixed(0)}%</span>
                  </div>
                  <p className="text-xs text-gray-400">{signal.reasoning}</p>
                </div>
              )) : (
                <div className="text-center py-8 text-gray-500">
                  <Activity className="h-12 w-12 mx-auto mb-2 opacity-20" />
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
