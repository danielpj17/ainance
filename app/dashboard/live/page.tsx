'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Loader2, TrendingUp, TrendingDown, DollarSign, Activity, AlertTriangle, Shield } from 'lucide-react'
import TradingBot from '@/components/TradingBot'

interface Trade {
  id: number
  symbol: string
  action: string
  qty: number
  price: number
  timestamp: string
  strategy: string
  account_type: string
  created_at: string
}

interface PortfolioSummary {
  total_trades: number
  total_pnl: number
  win_rate: number
  avg_trade_size: number
  last_trade_date: string
  active_strategy: string
}

export default function LiveTradingPage() {
  const [trades, setTrades] = useState<Trade[]>([])
  const [portfolioSummary, setPortfolioSummary] = useState<PortfolioSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null)
  const [hasApiKeys, setHasApiKeys] = useState(false)

  const supabase = createClient()

  useEffect(() => {
    checkApiKeys()
    loadData()
    
    // Set up realtime subscriptions
    const tradesChannel = supabase
      .channel('live-trades')
      .on('postgres_changes', 
        { event: 'INSERT', schema: 'public', table: 'trades' },
        (payload) => {
          if (payload.new.account_type === 'live') {
            loadData()
          }
        }
      )
      .subscribe()

    return () => {
      tradesChannel.unsubscribe()
    }
  }, [])

  const checkApiKeys = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: apiKeys, error } = await supabase.rpc('get_user_api_keys', {
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

      // Load live trades only
      const { data: tradesData, error: tradesError } = await supabase
        .from('trades')
        .select('*')
        .eq('account_type', 'live')
        .order('created_at', { ascending: false })
        .limit(50)

      if (tradesError) throw tradesError

      // Load portfolio summary for live trades
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: summaryData, error: summaryError } = await supabase
          .rpc('get_portfolio_summary', { user_uuid: user.id })

        if (summaryError) throw summaryError

        setTrades(tradesData || [])
        setPortfolioSummary(summaryData?.[0] || null)
      }
    } catch (error) {
      console.error('Error loading data:', error)
      setMessage({ type: 'error', text: 'Failed to load live trading data' })
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString()
  }

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span className="ml-2">Loading live trading data...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Live Trading Dashboard</h1>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Shield className="h-4 w-4" />
          <span>Real money trading</span>
        </div>
      </div>

      {message && (
        <Alert className={
          message.type === 'error' ? 'border-red-200 bg-red-50' : 
          message.type === 'warning' ? 'border-yellow-200 bg-yellow-50' : 
          'border-green-200 bg-green-50'
        }>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className={
            message.type === 'error' ? 'text-red-700' : 
            message.type === 'warning' ? 'text-yellow-700' : 
            'text-green-700'
          }>
            {message.text}
          </AlertDescription>
        </Alert>
      )}

      {!hasApiKeys && (
        <Alert className="border-yellow-200 bg-yellow-50">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-yellow-700">
            <strong>Live Trading Setup Required:</strong> You need to configure your Alpaca live trading API keys 
            to use this dashboard. Go to Settings to add your live trading credentials.
          </AlertDescription>
        </Alert>
      )}

      {/* Portfolio Summary */}
      {portfolioSummary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Live Trades</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{portfolioSummary.total_trades}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Real P&L</CardTitle>
              {portfolioSummary.total_pnl >= 0 ? 
                <TrendingUp className="h-4 w-4 text-green-600" /> : 
                <TrendingDown className="h-4 w-4 text-red-600" />
              }
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${portfolioSummary.total_pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(portfolioSummary.total_pnl)}
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Win Rate</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {(portfolioSummary.win_rate * 100).toFixed(1)}%
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Trade Size</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(portfolioSummary.avg_trade_size)}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Trading Bot */}
      {hasApiKeys && <TradingBot mode="live" />}

      {/* Risk Warning */}
      <Alert className="border-red-200 bg-red-50">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription className="text-red-700">
          <strong>Risk Warning:</strong> Live trading involves real money and significant risk of loss. 
          Past performance does not guarantee future results. Only trade with money you can afford to lose.
        </AlertDescription>
      </Alert>

      {/* Manual Trade Execution (Disabled for Live Trading) */}
      <Card className="opacity-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Manual Trade Execution
            <AlertTriangle className="h-4 w-4 text-yellow-600" />
          </CardTitle>
          <CardDescription>
            Manual trading is disabled for live accounts. Use the AI trading system for automated execution.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <Shield className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              For safety, manual trading is disabled on live accounts. 
              Configure your AI strategy settings to enable automated trading.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Recent Live Trades */}
      <Card>
        <CardHeader>
          <CardTitle>Live Trading History</CardTitle>
          <CardDescription>
            Your real money trading activity
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Symbol</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Quantity</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Strategy</TableHead>
                <TableHead>Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {trades.map((trade) => (
                <TableRow key={trade.id}>
                  <TableCell className="font-medium">{trade.symbol}</TableCell>
                  <TableCell>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      trade.action === 'buy' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {trade.action.toUpperCase()}
                    </span>
                  </TableCell>
                  <TableCell>{trade.qty}</TableCell>
                  <TableCell>{formatCurrency(trade.price)}</TableCell>
                  <TableCell>{formatCurrency(trade.qty * trade.price)}</TableCell>
                  <TableCell>{trade.strategy}</TableCell>
                  <TableCell>{formatDate(trade.created_at)}</TableCell>
                </TableRow>
              ))}
              {trades.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    No live trades yet. Configure your live trading API keys and AI strategy to start.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Trading Guidelines */}
      <Card>
        <CardHeader>
          <CardTitle>Live Trading Guidelines</CardTitle>
          <CardDescription>
            Important information for live trading
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h4 className="font-semibold mb-2">Before You Start:</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Configure your Alpaca live trading API keys</li>
                <li>• Set appropriate risk management parameters</li>
                <li>• Start with small position sizes</li>
                <li>• Test your strategy thoroughly with paper trading</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-2">Risk Management:</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Never risk more than you can afford to lose</li>
                <li>• Use stop-loss orders</li>
                <li>• Monitor your positions regularly</li>
                <li>• Keep detailed trading records</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
