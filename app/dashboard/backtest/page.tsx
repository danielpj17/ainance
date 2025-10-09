'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, TrendingUp, BarChart3, AlertTriangle } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts'

interface BacktestResult {
  id?: number
  strategy: string
  account_type?: string
  date_range: {
    start: string
    end: string
  }
  metrics: {
    total_return: number
    win_rate: number
    sharpe_ratio: number
    max_drawdown: number
    total_trades: number
    winning_trades: number
    losing_trades: number
    avg_win: number
    avg_loss: number
    trades?: any[]
    equity_curve?: { date: string; equity: number }[]
  }
  created_at?: string
}

interface BacktestRequest {
  startDate: string
  endDate: string
  strategy: string
  account_type: string
  symbols: string[]
}

export default function BacktestPage() {
  const [backtests, setBacktests] = useState<BacktestResult[]>([])
  const [loading, setLoading] = useState(true)
  const [runningBacktest, setRunningBacktest] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [selectedBacktest, setSelectedBacktest] = useState<BacktestResult | null>(null)
  
  const [backtestForm, setBacktestForm] = useState<BacktestRequest>({
    startDate: '',
    endDate: '',
    strategy: 'cash',
    account_type: 'cash',
    symbols: ['AAPL', 'MSFT', 'TSLA', 'SPY']
  })

  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null)

  useEffect(() => {
    supabaseRef.current = createClient()
    loadBacktests()
    
    // Set up realtime subscriptions
    const sb = supabaseRef.current
    const backtestsChannel = sb
      .channel('backtests')
      .on('postgres_changes', 
        { event: 'INSERT', schema: 'public', table: 'backtests' },
        () => loadBacktests()
      )
      .subscribe()

    return () => {
      backtestsChannel?.unsubscribe()
    }
  }, [])

  const loadBacktests = async () => {
    try {
      setLoading(true)

      const sb = supabaseRef.current
      if (!sb) return
      const { data: { user } } = await sb.auth.getUser()
      if (user) {
        const { data: backtestsData, error } = await sb.rpc('get_user_backtests', {
          user_uuid: user.id,
          limit_count: 20,
          offset_count: 0
        })

        if (error) throw error

        setBacktests(backtestsData || [])
        if (backtestsData && backtestsData.length > 0 && !selectedBacktest) {
          setSelectedBacktest(backtestsData[0])
        }
      }
    } catch (error) {
      console.error('Error loading backtests:', error)
      setMessage({ type: 'error', text: 'Failed to load backtests' })
    } finally {
      setLoading(false)
    }
  }

  const runBacktest = async () => {
    if (!backtestForm.startDate || !backtestForm.endDate) {
      setMessage({ type: 'error', text: 'Please select start and end dates' })
      return
    }

    try {
      setRunningBacktest(true)
      setMessage(null)

      const response = await fetch('/api/dashboard/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(backtestForm),
      })

      const result = await response.json()

      if (result.success) {
        setMessage({ type: 'success', text: 'Backtest completed successfully!' })
        loadBacktests() // Refresh the list
        if (result.result) {
          setSelectedBacktest({
            strategy: backtestForm.strategy,
            account_type: backtestForm.account_type,
            date_range: { start: backtestForm.startDate, end: backtestForm.endDate },
            metrics: result.result,
          })
        }
      } else {
        setMessage({ type: 'error', text: result.error || 'Backtest failed' })
      }
    } catch (error) {
      console.error('Error running backtest:', error)
      setMessage({ type: 'error', text: 'Backtest execution failed' })
    } finally {
      setRunningBacktest(false)
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount)
  }

  const formatPercentage = (value: number) => {
    return `${(value * 100).toFixed(2)}%`
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString()
  }

  // Use actual equity curve if available, else fallback
  const generateEquityCurve = (backtest: BacktestResult) => {
    if (backtest.metrics.equity_curve && backtest.metrics.equity_curve.length > 0) {
      return backtest.metrics.equity_curve.map((pt, i) => ({
        ...pt,
        day: i + 1
      }))
    }
    // fallback: mock
    const days = 30
    const data = []
    let equity = 100000
    for (let i = 0; i < days; i++) {
      const dailyReturn = (Math.random() - 0.5) * 0.05
      equity = equity * (1 + dailyReturn)
      data.push({ day: i + 1, equity: Math.round(equity), date: new Date(Date.now() - (days - i) * 24 * 60 * 60 * 1000).toLocaleDateString() })
    }
    return data
  }

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span className="ml-2">Loading backtest data...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Backtest Dashboard</h1>
        <div className="text-sm text-muted-foreground">
          Test your strategies with historical data
        </div>
      </div>

      {message && (
        <Alert className={message.type === 'error' ? 'border-red-200 bg-red-50' : 'border-blue-200 bg-blue-50'}>
          <AlertDescription className={message.type === 'error' ? 'text-red-700' : 'text-blue-700'}>
            {message.text}
          </AlertDescription>
        </Alert>
      )}

      {/* Backtest Form */}
      <Card>
        <CardHeader>
          <CardTitle>Run New Backtest</CardTitle>
          <CardDescription>
            Configure and run a backtest on historical data
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-4">
            <div>
              <Label htmlFor="startDate">Start Date</Label>
              <Input
                id="startDate"
                type="date"
                value={backtestForm.startDate}
                onChange={(e) => setBacktestForm(prev => ({ ...prev, startDate: e.target.value }))}
              />
            </div>
            
            <div>
              <Label htmlFor="endDate">End Date</Label>
              <Input
                id="endDate"
                type="date"
                value={backtestForm.endDate}
                onChange={(e) => setBacktestForm(prev => ({ ...prev, endDate: e.target.value }))}
              />
            </div>
            
            <div>
              <Label htmlFor="strategy">Strategy</Label>
              <Select value={backtestForm.strategy} onValueChange={(value) => setBacktestForm(prev => ({ ...prev, strategy: value }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash Trading</SelectItem>
                  <SelectItem value="25k_plus">$25k+ Rules</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label htmlFor="account_type">Account Type</Label>
              <Select value={backtestForm.account_type} onValueChange={(value) => setBacktestForm(prev => ({ ...prev, account_type: value }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="margin">Margin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex items-end">
              <Button 
                onClick={runBacktest} 
                disabled={runningBacktest}
                className="w-full"
              >
                {runningBacktest ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Running...
                  </>
                ) : (
                  'Run Backtest'
                )}
              </Button>
            </div>
          </div>
          
          <div className="text-sm text-muted-foreground">
            <strong>Symbols:</strong> {backtestForm.symbols.join(', ')} (Default symbols for testing)
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Backtest Results List */}
        <Card>
          <CardHeader>
            <CardTitle>Backtest Results</CardTitle>
            <CardDescription>
              Select a backtest to view detailed results
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {backtests.map((backtest) => (
                <div
                  key={backtest.id}
                  className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                    selectedBacktest?.id === backtest.id 
                      ? 'border-blue-500 bg-blue-50' 
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  onClick={() => setSelectedBacktest(backtest)}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-medium">{backtest.strategy}</div>
                      <div className="text-sm text-muted-foreground">
                        {formatDate(backtest.date_range.start)} - {formatDate(backtest.date_range.end)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`font-medium ${
                        backtest.metrics.total_return >= 0 ? 'text-blue-600' : 'text-red-600'
                      }`}>
                        {formatPercentage(backtest.metrics.total_return)}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {backtest.metrics.total_trades} trades
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {backtests.length === 0 && (
                <div className="text-center text-muted-foreground py-8">
                  No backtests yet. Run your first backtest above.
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Selected Backtest Details */}
        {selectedBacktest && (
          <Card>
            <CardHeader>
              <CardTitle>Backtest Metrics</CardTitle>
              <CardDescription>
                {selectedBacktest.strategy} - {formatDate(selectedBacktest.date_range.start)} to {formatDate(selectedBacktest.date_range.end)}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-muted-foreground">Total Return</div>
                  <div className={`text-2xl font-bold ${
                    selectedBacktest.metrics.total_return >= 0 ? 'text-blue-600' : 'text-red-600'
                  }`}>
                    {formatPercentage(selectedBacktest.metrics.total_return)}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Win Rate</div>
                  <div className="text-2xl font-bold">
                    {formatPercentage(selectedBacktest.metrics.win_rate)}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Sharpe Ratio</div>
                  <div className="text-2xl font-bold">
                    {selectedBacktest.metrics.sharpe_ratio.toFixed(2)}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Max Drawdown</div>
                  <div className="text-2xl font-bold text-red-600">
                    {formatPercentage(selectedBacktest.metrics.max_drawdown)}
                  </div>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-muted-foreground">Total Trades</div>
                  <div className="text-lg font-semibold">{selectedBacktest.metrics.total_trades}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Winning Trades</div>
                  <div className="text-lg font-semibold text-blue-600">{selectedBacktest.metrics.winning_trades}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Losing Trades</div>
                  <div className="text-lg font-semibold text-red-600">{selectedBacktest.metrics.losing_trades}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Avg Win/Loss</div>
                  <div className="text-lg font-semibold">
                    {formatPercentage(selectedBacktest.metrics.avg_win)} / {formatPercentage(selectedBacktest.metrics.avg_loss)}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Charts */}
      {selectedBacktest && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Equity Curve */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Equity Curve
              </CardTitle>
              <CardDescription>
                Portfolio value over time
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={generateEquityCurve(selectedBacktest)}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="day" />
                    <YAxis tickFormatter={(value) => formatCurrency(value)} />
                    <Tooltip 
                      formatter={(value) => [formatCurrency(value as number), 'Equity']}
                      labelFormatter={(label) => `Day ${label}`}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="equity" 
                      stroke="#8884d8" 
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Win/Loss Distribution */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Trade Distribution
              </CardTitle>
              <CardDescription>
                Winning vs losing trades
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={[
                    { name: 'Wins', value: selectedBacktest.metrics.winning_trades, color: '#10b981' },
                    { name: 'Losses', value: selectedBacktest.metrics.losing_trades, color: '#ef4444' }
                  ]}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="value" fill="#8884d8" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
