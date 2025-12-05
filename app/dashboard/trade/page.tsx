'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Loader2, TrendingUp, TrendingDown, DollarSign, Activity, Zap, AlertTriangle, RefreshCw } from 'lucide-react'

type Bar = { time: string, open: number, high: number, low: number, close: number, volume: number }

interface AccountData {
  buying_power: string
  cash: string
  portfolio_value: string
  equity: string
}

interface Signal {
  symbol: string
  action: 'buy' | 'sell' | 'hold'
  confidence: number
  reasoning: string
}

export default function TradeTerminalPage() {
  const [symbol, setSymbol] = useState('AAPL')
  const [timeframe, setTimeframe] = useState<'1Min'|'5Min'|'15Min'|'1Hour'|'1Day'>('5Min')
  const [bars, setBars] = useState<Bar[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [qty, setQty] = useState(1)
  const [side, setSide] = useState<'buy'|'sell'>('buy')
  const [orderType, setOrderType] = useState<'market'|'limit'>('market')
  const [limitPrice, setLimitPrice] = useState('')
  const [account, setAccount] = useState<AccountData | null>(null)
  const [signals, setSignals] = useState<Signal[]>([])
  const latestPrice = useMemo(() => bars.length ? bars[bars.length-1].close : 0, [bars])
  const priceChange = useMemo(() => {
    if (bars.length < 2) return 0
    const first = bars[0].close
    const last = bars[bars.length-1].close
    return ((last - first) / first) * 100
  }, [bars])

  const fetchAccount = async () => {
    try {
      const res = await fetch('/api/account')
      const data = await res.json()
      if (data.success) {
        setAccount(data.data)
      } else {
        // Set account to zeros if API returns error for authenticated user
        setAccount({
          portfolio_value: '0.00',
          cash: '0.00',
          buying_power: '0.00',
          equity: '0.00'
        })
      }
    } catch (e) {
      console.error('Failed to fetch account', e)
      // Set account to zeros on error
      setAccount({
        portfolio_value: '0.00',
        cash: '0.00',
        buying_power: '0.00',
        equity: '0.00'
      })
    }
  }

  const fetchBars = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/market?symbol=${encodeURIComponent(symbol)}&timeframe=${timeframe}&limit=300`)
      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'Failed to fetch market data')
      setBars(data.data)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const fetchSignals = async () => {
    try {
      const res = await fetch('/api/trading')
      const data = await res.json()
      if (data.success && data.status?.currentSignals) {
        setSignals(data.status.currentSignals.slice(0, 3))
      }
    } catch (e) {
      console.error('Failed to fetch signals', e)
    }
  }

  const placeOrder = async () => {
    setError(null)
    try {
      const res = await fetch('/api/trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol,
          side,
          qty,
          type: orderType,
          time_in_force: 'day',
          limit_price: orderType === 'limit' ? parseFloat(limitPrice) : undefined,
          strategy: 'cash',
          account_type: 'paper'
        })
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'Order failed')
      setLimitPrice('')
      await Promise.all([fetchBars(), fetchAccount()])
    } catch (e: any) {
      setError(e.message)
    }
  }

  const executeAISignal = async (signal: Signal) => {
    if (signal.action === 'hold') return
    setSymbol(signal.symbol)
    setSide(signal.action)
    setOrderType('market')
    setTimeout(async () => {
      try {
        const res = await fetch('/api/trade', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            symbol: signal.symbol,
            side: signal.action,
            qty: 1,
            type: 'market',
            time_in_force: 'day',
            strategy: 'cash',
            account_type: 'paper'
          })
        })
        const data = await res.json()
        if (!data.success) throw new Error(data.error || 'Order failed')
        await Promise.all([fetchBars(), fetchAccount(), fetchSignals()])
      } catch (e: any) {
        setError(e.message)
      }
    }, 300)
  }

  useEffect(() => {
    fetchBars()
    fetchAccount()
    fetchSignals()
    const interval = setInterval(() => {
      fetchAccount()
      fetchSignals()
    }, 10000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => { fetchBars() }, [symbol, timeframe])

  return (
    <div className="min-h-screen text-white p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">Trade Terminal</h1>
          <p className="text-white/80">AI-powered trading with live market data</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge className="bg-blue-400 text-white px-4 py-2">Paper Trading</Badge>
          <Button variant="outline" size="icon" onClick={fetchBars} className="border-gray-700 hover:bg-blue-500/10 backdrop-blur-sm">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {error && (
        <Alert className="mb-6 bg-red-900/20 border-red-800">
          <AlertTriangle className="h-4 w-4 text-red-500" />
          <AlertDescription className="text-red-400">{error}</AlertDescription>
        </Alert>
      )}

      {/* Account Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <Card className="glass-card hover:border-blue-500 transition-colors">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">Portfolio</CardTitle>
            <DollarSign className="h-5 w-5 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">
              ${account ? parseFloat(account.portfolio_value || account.equity || '0').toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
            </div>
            <p className="text-xs text-gray-500 mt-1">Total equity</p>
          </CardContent>
        </Card>

        <Card className="glass-card hover:border-blue-500 transition-colors">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">Cash</CardTitle>
            <DollarSign className="h-5 w-5 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">
              ${account ? parseFloat(account.cash || '0').toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
            </div>
            <p className="text-xs text-gray-500 mt-1">Available</p>
          </CardContent>
        </Card>

        <Card className="glass-card hover:border-blue-500 transition-colors">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">Buying Power</CardTitle>
            <Activity className="h-5 w-5 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">
              ${account ? parseFloat(account.buying_power || '0').toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
            </div>
            <p className="text-xs text-gray-500 mt-1">Max capacity</p>
          </CardContent>
        </Card>

        <Card className="glass-card hover:border-yellow-500 transition-colors">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">{symbol}</CardTitle>
            {priceChange >= 0 ? <TrendingUp className="h-5 w-5 text-blue-500" /> : <TrendingDown className="h-5 w-5 text-red-500" />}
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">${latestPrice.toFixed(2)}</div>
            <p className={`text-xs font-medium mt-1 ${priceChange >= 0 ? 'text-blue-500' : 'text-red-500'}`}>
              {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}%
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart */}
        <Card className="lg:col-span-2 glass-card">
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-white">
              <span>Market Chart</span>
              {loading && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
            </CardTitle>
            <CardDescription className="text-gray-400">Real-time price data</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="md:col-span-2">
                <Input 
                  value={symbol} 
                  onChange={(e) => setSymbol(e.target.value.toUpperCase())} 
                  placeholder="Symbol" 
                  className="bg-blue-500/10 backdrop-blur-sm border-gray-700 text-white font-mono focus:border-blue-500"
                />
              </div>
              <Select value={timeframe} onValueChange={(v:any) => setTimeframe(v)}>
                <SelectTrigger className="bg-blue-500/10 backdrop-blur-sm border-gray-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-blue-500/10 backdrop-blur-sm border-gray-700">
                  <SelectItem value="1Min">1m</SelectItem>
                  <SelectItem value="5Min">5m</SelectItem>
                  <SelectItem value="15Min">15m</SelectItem>
                  <SelectItem value="1Hour">1h</SelectItem>
                  <SelectItem value="1Day">1d</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={fetchBars} disabled={loading} className="bg-blue-400 hover:bg-blue-500">
                {loading ? (<><Loader2 className="h-4 w-4 animate-spin mr-2"/>Load</>) : 'Refresh'}
              </Button>
            </div>

            <div className="h-80 w-full bg-gradient-to-b from-[#252838] to-[#1a1d2e] rounded-xl p-4 border border-gray-800">
              {bars.length > 0 ? (
                <>
                  <svg viewBox="0 0 600 280" className="w-full h-full">
                    <defs>
                      <linearGradient id="priceGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor={priceChange >= 0 ? "#3b82f6" : "#ef4444"} stopOpacity="0.4" />
                        <stop offset="100%" stopColor={priceChange >= 0 ? "#3b82f6" : "#ef4444"} stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <polygon
                      fill="url(#priceGradient)"
                      points={(() => {
                        if (!bars.length) return ''
                        const dataMax = Math.max(...bars.map(b => b.high))
                        const dataMin = Math.min(...bars.map(b => b.low))
                        const range = Math.max(1, dataMax - dataMin)
                        const padding = range * 0.05 // 5% padding
                        const max = dataMax + padding
                        const min = dataMin - padding
                        const paddedRange = max - min
                        const points = bars.map((b, i) => {
                          const x = (i/(bars.length-1)) * 600
                          const y = 280 - ((b.close - min)/paddedRange) * 260
                          return `${x},${y}`
                        }).join(' ')
                        return points + ` 600,280 0,280`
                      })()}
                    />
                    <polyline
                      fill="none"
                      stroke={priceChange >= 0 ? "#3b82f6" : "#ef4444"}
                      strokeWidth="3"
                      points={(() => {
                        if (!bars.length) return ''
                        const dataMax = Math.max(...bars.map(b => b.high))
                        const dataMin = Math.min(...bars.map(b => b.low))
                        const range = Math.max(1, dataMax - dataMin)
                        const padding = range * 0.05 // 5% padding
                        const max = dataMax + padding
                        const min = dataMin - padding
                        const paddedRange = max - min
                        return bars.map((b, i) => {
                          const x = (i/(bars.length-1)) * 600
                          const y = 280 - ((b.close - min)/paddedRange) * 260
                          return `${x},${y}`
                        }).join(' ')
                      })()}
                    />
                  </svg>
                  <div className="absolute bottom-4 left-4 text-white text-xs bg-[#1a1d2e]/80 p-3 rounded-lg backdrop-blur">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                      <div>Open: <span className="font-mono">${bars[0].open.toFixed(2)}</span></div>
                      <div>High: <span className="font-mono text-blue-500">${Math.max(...bars.map(b => b.high)).toFixed(2)}</span></div>
                      <div>Low: <span className="font-mono text-red-500">${Math.min(...bars.map(b => b.low)).toFixed(2)}</span></div>
                      <div>Close: <span className="font-mono">${bars[bars.length-1].close.toFixed(2)}</span></div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-center h-full text-gray-500">
                  <div className="text-center">
                    <Activity className="h-12 w-12 mx-auto mb-2 opacity-30" />
                    <p>Select a symbol to view chart</p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Order Panel + AI */}
        <div className="space-y-6">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-white">Place Order</CardTitle>
              <CardDescription className="text-gray-400">Execute trades</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Button 
                  onClick={() => setSide('buy')} 
                  variant={side === 'buy' ? 'default' : 'outline'}
                  className={side === 'buy' ? 'bg-blue-400 hover:bg-blue-500' : 'border-gray-700 hover:bg-blue-500/10 backdrop-blur-sm'}
                >
                  Buy
                </Button>
                <Button 
                  onClick={() => setSide('sell')} 
                  variant={side === 'sell' ? 'default' : 'outline'}
                  className={side === 'sell' ? 'bg-red-600 hover:bg-red-700' : 'border-gray-700 hover:bg-blue-500/10 backdrop-blur-sm'}
                >
                  Sell
                </Button>
              </div>
              
              <div>
                <label className="text-sm font-medium text-gray-400 mb-2 block">Quantity</label>
                <Input 
                  type="number" 
                  min={1} 
                  value={qty} 
                  onChange={(e)=>setQty(parseInt(e.target.value)||1)} 
                  className="bg-blue-500/10 backdrop-blur-sm border-gray-700 text-white"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-400 mb-2 block">Order Type</label>
                <Select value={orderType} onValueChange={(v:any)=>setOrderType(v)}>
                  <SelectTrigger className="bg-blue-500/10 backdrop-blur-sm border-gray-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-blue-500/10 backdrop-blur-sm border-gray-700">
                    <SelectItem value="market">Market</SelectItem>
                    <SelectItem value="limit">Limit</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {orderType === 'limit' && (
                <div>
                  <label className="text-sm font-medium text-gray-400 mb-2 block">Limit Price</label>
                  <Input 
                    type="number" 
                    step="0.01" 
                    value={limitPrice} 
                    onChange={(e)=>setLimitPrice(e.target.value)} 
                    placeholder="0.00" 
                    className="bg-blue-500/10 backdrop-blur-sm border-gray-700 text-white"
                  />
                </div>
              )}

              <Button 
                onClick={placeOrder} 
                className={`w-full ${side === 'buy' ? 'bg-blue-400 hover:bg-blue-500' : 'bg-red-600 hover:bg-red-700'}`}
              >
                {side === 'buy' ? 'Buy' : 'Sell'} {qty} {symbol}
              </Button>

              <p className="text-xs text-gray-500 text-center font-mono">
                Est. ${(latestPrice * qty).toFixed(2)}
              </p>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <Zap className="h-5 w-5 text-yellow-500" />
                AI Signals
              </CardTitle>
              <CardDescription className="text-gray-400">Live recommendations</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {signals.length > 0 ? signals.map((signal, idx) => (
                  <div key={idx} className="p-3 bg-blue-500/10 backdrop-blur-sm rounded-lg border border-gray-700 hover:border-blue-500 transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Badge variant={signal.action === 'buy' ? 'default' : 'destructive'} className={`${signal.action === 'buy' ? 'bg-blue-400' : 'bg-red-600'} font-mono text-xs`}>
                          {signal.action.toUpperCase()}
                        </Badge>
                        <span className="font-bold text-white">{signal.symbol}</span>
                      </div>
                      <span className="text-sm text-gray-400 font-mono">
                        {(signal.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mb-3">{signal.reasoning}</p>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="w-full border-gray-700 hover:bg-blue-400 hover:border-blue-400" 
                      onClick={() => executeAISignal(signal)}
                    >
                      Execute
                    </Button>
                  </div>
                )) : (
                  <div className="text-center py-8 text-gray-500">
                    <Zap className="h-8 w-8 mx-auto mb-2 opacity-20" />
                    <p className="text-sm">No signals</p>
                    <p className="text-xs">Start bot to generate</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
