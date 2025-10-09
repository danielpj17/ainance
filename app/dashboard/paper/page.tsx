'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, TrendingUp, TrendingDown, DollarSign, Activity } from 'lucide-react'
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

interface Prediction {
  id: number
  symbol: string
  signal: string
  confidence: number
  timestamp: string
  signal_count: number
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

export default function PaperTradingPage() {
  const [trades, setTrades] = useState<Trade[]>([])
  const [predictions, setPredictions] = useState<Prediction[]>([])
  const [portfolioSummary, setPortfolioSummary] = useState<PortfolioSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [newTrade, setNewTrade] = useState({
    symbol: '',
    side: 'buy' as 'buy' | 'sell',
    qty: 1,
    type: 'market' as 'market' | 'limit',
    limit_price: ''
  })

  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null)

  useEffect(() => {
    supabaseRef.current = createClient()
    loadData()
    
    // Set up realtime subscriptions
    let tradesChannel: any = null
    let predictionsChannel: any = null
    if (supabaseRef.current) {
      tradesChannel = supabaseRef.current
        .channel('trades')
        .on('postgres_changes', 
          { event: 'INSERT', schema: 'public', table: 'trades' },
          () => loadData()
        )
        .subscribe()

      predictionsChannel = supabaseRef.current
        .channel('predictions')
        .on('postgres_changes', 
          { event: 'INSERT', schema: 'public', table: 'predictions' },
          () => loadData()
        )
        .subscribe()
    }

    return () => {
      tradesChannel?.unsubscribe()
      predictionsChannel?.unsubscribe()
    }
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)

      // Load trades
      const sb = supabaseRef.current
      if (!sb) return

      const { data: tradesData, error: tradesError } = await sb
        .from('trades')
        .select('*')
        .eq('account_type', 'paper')
        .order('created_at', { ascending: false })
        .limit(50)

      if (tradesError) throw tradesError

      // Load predictions
      const { data: predictionsData, error: predictionsError } = await sb
        .from('predictions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20)

      if (predictionsError) throw predictionsError

      // Load portfolio summary
      const { data: { user } } = await sb.auth.getUser()
      if (user) {
        const { data: summaryData, error: summaryError } = await sb
          .rpc('get_portfolio_summary', { user_uuid: user.id })

        if (summaryError) throw summaryError

        setTrades(tradesData || [])
        setPredictions(predictionsData || [])
        setPortfolioSummary(summaryData?.[0] || null)
      }
    } catch (error) {
      console.error('Error loading data:', error)
      setMessage({ type: 'error', text: 'Failed to load data' })
    } finally {
      setLoading(false)
    }
  }

  const executeTrade = async () => {
    if (!newTrade.symbol || !newTrade.qty) {
      setMessage({ type: 'error', text: 'Please fill in symbol and quantity' })
      return
    }

    try {
      const response = await fetch('/api/trade', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...newTrade,
          limit_price: newTrade.type === 'limit' ? parseFloat(newTrade.limit_price) : undefined,
          strategy: 'cash',
          account_type: 'paper'
        }),
      })

      const result = await response.json()

      if (result.success) {
        setMessage({ type: 'success', text: `Trade executed: ${newTrade.side} ${newTrade.qty} ${newTrade.symbol}` })
        setNewTrade({ symbol: '', side: 'buy', qty: 1, type: 'market', limit_price: '' })
        loadData() // Refresh data
      } else {
        setMessage({ type: 'error', text: result.error || 'Trade execution failed' })
      }
    } catch (error) {
      console.error('Error executing trade:', error)
      setMessage({ type: 'error', text: 'Trade execution failed' })
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
          <span className="ml-2">Loading paper trading data...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Paper Trading Dashboard</h1>
        <div className="text-sm text-muted-foreground">
          Practice trading with virtual money
        </div>
      </div>

      {message && (
        <Alert className={message.type === 'error' ? 'border-red-200 bg-red-50' : 'border-blue-200 bg-blue-50'}>
          <AlertDescription className={message.type === 'error' ? 'text-red-700' : 'text-blue-700'}>
            {message.text}
          </AlertDescription>
        </Alert>
      )}

      {/* Trading Bot */}
      <TradingBot mode="paper" />

      {/* Portfolio Summary */}
      {portfolioSummary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Trades</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{portfolioSummary.total_trades}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total P&L</CardTitle>
              {portfolioSummary.total_pnl >= 0 ? 
                <TrendingUp className="h-4 w-4 text-blue-600" /> : 
                <TrendingDown className="h-4 w-4 text-red-600" />
              }
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${portfolioSummary.total_pnl >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
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

      {/* Manual Trade Execution */}
      <Card>
        <CardHeader>
          <CardTitle>Execute Manual Trade</CardTitle>
          <CardDescription>
            Place a manual trade order (for testing purposes)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div>
              <Label htmlFor="symbol">Symbol</Label>
              <Input
                id="symbol"
                placeholder="AAPL"
                value={newTrade.symbol}
                onChange={(e) => setNewTrade(prev => ({ ...prev, symbol: e.target.value.toUpperCase() }))}
              />
            </div>
            
            <div>
              <Label htmlFor="side">Side</Label>
              <select
                id="side"
                className="w-full p-2 border rounded-md"
                value={newTrade.side}
                onChange={(e) => setNewTrade(prev => ({ ...prev, side: e.target.value as 'buy' | 'sell' }))}
              >
                <option value="buy">Buy</option>
                <option value="sell">Sell</option>
              </select>
            </div>
            
            <div>
              <Label htmlFor="qty">Quantity</Label>
              <Input
                id="qty"
                type="number"
                min="1"
                value={newTrade.qty}
                onChange={(e) => setNewTrade(prev => ({ ...prev, qty: parseInt(e.target.value) || 1 }))}
              />
            </div>
            
            <div>
              <Label htmlFor="type">Type</Label>
              <select
                id="type"
                className="w-full p-2 border rounded-md"
                value={newTrade.type}
                onChange={(e) => setNewTrade(prev => ({ ...prev, type: e.target.value as 'market' | 'limit' }))}
              >
                <option value="market">Market</option>
                <option value="limit">Limit</option>
              </select>
            </div>
            
            <div className="flex items-end">
              <Button onClick={executeTrade} className="w-full">
                Execute Trade
              </Button>
            </div>
          </div>
          
          {newTrade.type === 'limit' && (
            <div className="mt-4">
              <Label htmlFor="limit_price">Limit Price</Label>
              <Input
                id="limit_price"
                type="number"
                step="0.01"
                placeholder="150.00"
                value={newTrade.limit_price}
                onChange={(e) => setNewTrade(prev => ({ ...prev, limit_price: e.target.value }))}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Trades */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Trades</CardTitle>
          <CardDescription>
            Your latest paper trading activity
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
                <TableHead>Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {trades.map((trade) => (
                <TableRow key={trade.id}>
                  <TableCell className="font-medium">{trade.symbol}</TableCell>
                  <TableCell>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      trade.action === 'buy' ? 'bg-blue-100 text-blue-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {trade.action.toUpperCase()}
                    </span>
                  </TableCell>
                  <TableCell>{trade.qty}</TableCell>
                  <TableCell>{formatCurrency(trade.price)}</TableCell>
                  <TableCell>{formatCurrency(trade.qty * trade.price)}</TableCell>
                  <TableCell>{formatDate(trade.created_at)}</TableCell>
                </TableRow>
              ))}
              {trades.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    No trades yet. Start by executing a trade above.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Recent Predictions */}
      <Card>
        <CardHeader>
          <CardTitle>AI Predictions</CardTitle>
          <CardDescription>
            Latest AI trading signals and predictions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Symbol</TableHead>
                <TableHead>Signal</TableHead>
                <TableHead>Confidence</TableHead>
                <TableHead>Strategy</TableHead>
                <TableHead>Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {predictions.map((prediction) => (
                <TableRow key={prediction.id}>
                  <TableCell className="font-medium">{prediction.symbol}</TableCell>
                  <TableCell>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      prediction.signal === 'buy' ? 'bg-blue-100 text-blue-800' : 
                      prediction.signal === 'sell' ? 'bg-red-100 text-red-800' : 
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {prediction.signal.toUpperCase()}
                    </span>
                  </TableCell>
                  <TableCell>{(prediction.confidence * 100).toFixed(1)}%</TableCell>
                  <TableCell>{prediction.strategy}</TableCell>
                  <TableCell>{formatDate(prediction.created_at)}</TableCell>
                </TableRow>
              ))}
              {predictions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No predictions yet. Generate some trading signals to see them here.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
