'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DollarSign, TrendingUp, TrendingDown, Activity, RefreshCw, Loader2 } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'

export const dynamic = 'force-dynamic'

interface TradeMetrics {
  total_spent: number
  total_received: number
  realized_pl: number
  unrealized_pl: number
  open_positions: number
  closed_positions: number
}

interface OpenPosition {
  symbol: string
  total_qty: number
  avg_cost: number
  total_cost: number
  first_trade_date: string
  trade_count: number
  current_price?: number
  current_value?: number
  unrealized_pl?: number
  pl_percent?: number
}

interface ClosedPosition {
  id: bigint
  symbol: string
  entry_date: string
  exit_date: string
  qty: number
  entry_price: number
  exit_price: number
  cost: number
  proceeds: number
  realized_pl: number
  pl_percent: number
}

interface TradeLog {
  id: bigint
  symbol: string
  action: string
  qty: number
  price: number
  total_value: number
  trade_timestamp: string
  strategy: string
  account_type: string
  realized_pl: number
  unrealized_pl: number
  is_closed: boolean
  position_size: number
  cost_basis: number
  created_at: string
}

export default function TradeLogsPage() {
  const [metrics, setMetrics] = useState<TradeMetrics>({
    total_spent: 0,
    total_received: 0,
    realized_pl: 0,
    unrealized_pl: 0,
    open_positions: 0,
    closed_positions: 0
  })
  const [openPositions, setOpenPositions] = useState<OpenPosition[]>([])
  const [closedPositions, setClosedPositions] = useState<ClosedPosition[]>([])
  const [allTrades, setAllTrades] = useState<TradeLog[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchLogs = async () => {
    setLoading(true)
    setError(null)
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      
      const response = await fetch('/api/logs', {
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
      })
      
      const data = await response.json()
      
      if (data.success) {
        setMetrics(data.data.metrics)
        setOpenPositions(data.data.openPositions || [])
        setClosedPositions(data.data.closedPositions || [])
        setAllTrades(data.data.trades || [])
      } else {
        setError(data.error || 'Failed to fetch trade logs')
      }
    } catch (error) {
      console.error('Error fetching logs:', error)
      setError('Failed to fetch trade logs')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchLogs()
    
    // Refresh every 30 seconds
    const interval = setInterval(fetchLogs, 30000)
    return () => clearInterval(interval)
  }, [])

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value)
  }

  const formatPercent = (value: number) => {
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <div className="min-h-screen text-white p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">Trade Logs</h1>
          <p className="text-gray-400">Track your trading activity and profit/loss</p>
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={fetchLogs}
          disabled={loading}
          className="border-gray-700 hover:bg-[#252838]"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">Total Spent</CardTitle>
            <DollarSign className="h-5 w-5 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">
              {formatCurrency(metrics.total_spent)}
            </div>
            <p className="text-xs text-gray-500 mt-1">All buy orders</p>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">Total Received</CardTitle>
            <DollarSign className="h-5 w-5 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">
              {formatCurrency(metrics.total_received)}
            </div>
            <p className="text-xs text-gray-500 mt-1">All sell orders</p>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">Realized P&L</CardTitle>
            {metrics.realized_pl >= 0 ? (
              <TrendingUp className="h-5 w-5 text-green-500" />
            ) : (
              <TrendingDown className="h-5 w-5 text-red-500" />
            )}
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${metrics.realized_pl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {formatCurrency(metrics.realized_pl)}
            </div>
            <p className="text-xs text-gray-500 mt-1">{metrics.closed_positions} closed positions</p>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">Unrealized P&L</CardTitle>
            {metrics.unrealized_pl >= 0 ? (
              <TrendingUp className="h-5 w-5 text-blue-500" />
            ) : (
              <TrendingDown className="h-5 w-5 text-orange-500" />
            )}
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${metrics.unrealized_pl >= 0 ? 'text-blue-500' : 'text-orange-500'}`}>
              {formatCurrency(metrics.unrealized_pl)}
            </div>
            <p className="text-xs text-gray-500 mt-1">{metrics.open_positions} open positions</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs for different views */}
      <Tabs defaultValue="realized" className="space-y-6">
        <TabsList className="bg-[#1a1d2e] border border-gray-800">
          <TabsTrigger value="realized" className="data-[state=active]:bg-blue-400">
            Realized P&L
          </TabsTrigger>
          <TabsTrigger value="unrealized" className="data-[state=active]:bg-blue-400">
            Open Positions
          </TabsTrigger>
          <TabsTrigger value="all" className="data-[state=active]:bg-blue-400">
            All Trades
          </TabsTrigger>
        </TabsList>

        {/* Realized P&L Tab */}
        <TabsContent value="realized">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-white">Realized P&L - Closed Positions</CardTitle>
              <CardDescription className="text-gray-400">
                Completed trades with calculated profit/loss
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                </div>
              ) : closedPositions.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-gray-800 hover:bg-[#252838]">
                        <TableHead className="text-gray-400">Symbol</TableHead>
                        <TableHead className="text-gray-400">Entry Date</TableHead>
                        <TableHead className="text-gray-400">Exit Date</TableHead>
                        <TableHead className="text-gray-400">Qty</TableHead>
                        <TableHead className="text-gray-400">Entry Price</TableHead>
                        <TableHead className="text-gray-400">Exit Price</TableHead>
                        <TableHead className="text-gray-400">Cost</TableHead>
                        <TableHead className="text-gray-400">Proceeds</TableHead>
                        <TableHead className="text-gray-400">P&L</TableHead>
                        <TableHead className="text-gray-400">P&L %</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {closedPositions.map((position) => (
                        <TableRow key={position.id.toString()} className="border-gray-800 hover:bg-[#252838]">
                          <TableCell className="font-medium text-white">{position.symbol}</TableCell>
                          <TableCell className="text-gray-400">{formatDate(position.entry_date)}</TableCell>
                          <TableCell className="text-gray-400">{formatDate(position.exit_date)}</TableCell>
                          <TableCell className="text-white">{position.qty}</TableCell>
                          <TableCell className="text-gray-400">{formatCurrency(position.entry_price)}</TableCell>
                          <TableCell className="text-gray-400">{formatCurrency(position.exit_price)}</TableCell>
                          <TableCell className="text-gray-400">{formatCurrency(position.cost)}</TableCell>
                          <TableCell className="text-gray-400">{formatCurrency(position.proceeds)}</TableCell>
                          <TableCell className={position.realized_pl >= 0 ? 'text-green-500 font-semibold' : 'text-red-500 font-semibold'}>
                            {formatCurrency(position.realized_pl)}
                          </TableCell>
                          <TableCell className={position.pl_percent >= 0 ? 'text-green-500 font-semibold' : 'text-red-500 font-semibold'}>
                            {formatPercent(position.pl_percent)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center py-12 text-gray-500">
                  <Activity className="h-12 w-12 mx-auto mb-4 opacity-20" />
                  <p>No closed positions yet</p>
                  <p className="text-sm mt-2">Completed trades will appear here</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Open Positions Tab */}
        <TabsContent value="unrealized">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-white">Open Positions - Unrealized P&L</CardTitle>
              <CardDescription className="text-gray-400">
                Current open positions with live market prices
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                </div>
              ) : openPositions.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-gray-800 hover:bg-[#252838]">
                        <TableHead className="text-gray-400">Symbol</TableHead>
                        <TableHead className="text-gray-400">Date Opened</TableHead>
                        <TableHead className="text-gray-400">Qty</TableHead>
                        <TableHead className="text-gray-400">Avg Cost</TableHead>
                        <TableHead className="text-gray-400">Current Price</TableHead>
                        <TableHead className="text-gray-400">Total Cost</TableHead>
                        <TableHead className="text-gray-400">Current Value</TableHead>
                        <TableHead className="text-gray-400">Unrealized P&L</TableHead>
                        <TableHead className="text-gray-400">P&L %</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {openPositions.map((position) => (
                        <TableRow key={position.symbol} className="border-gray-800 hover:bg-[#252838]">
                          <TableCell className="font-medium text-white">{position.symbol}</TableCell>
                          <TableCell className="text-gray-400">{formatDate(position.first_trade_date)}</TableCell>
                          <TableCell className="text-white">{position.total_qty}</TableCell>
                          <TableCell className="text-gray-400">{formatCurrency(position.avg_cost)}</TableCell>
                          <TableCell className="text-white">
                            {position.current_price ? formatCurrency(position.current_price) : '-'}
                          </TableCell>
                          <TableCell className="text-gray-400">{formatCurrency(position.total_cost)}</TableCell>
                          <TableCell className="text-white">
                            {position.current_value ? formatCurrency(position.current_value) : '-'}
                          </TableCell>
                          <TableCell className={
                            position.unrealized_pl 
                              ? (position.unrealized_pl >= 0 ? 'text-blue-500 font-semibold' : 'text-orange-500 font-semibold')
                              : 'text-gray-400'
                          }>
                            {position.unrealized_pl !== undefined ? formatCurrency(position.unrealized_pl) : '-'}
                          </TableCell>
                          <TableCell className={
                            position.pl_percent 
                              ? (position.pl_percent >= 0 ? 'text-blue-500 font-semibold' : 'text-orange-500 font-semibold')
                              : 'text-gray-400'
                          }>
                            {position.pl_percent !== undefined ? formatPercent(position.pl_percent) : '-'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center py-12 text-gray-500">
                  <Activity className="h-12 w-12 mx-auto mb-4 opacity-20" />
                  <p>No open positions</p>
                  <p className="text-sm mt-2">Open positions will appear here</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* All Trades Tab */}
        <TabsContent value="all">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-white">All Trades History</CardTitle>
              <CardDescription className="text-gray-400">
                Complete chronological list of all trading activity
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                </div>
              ) : allTrades.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-gray-800 hover:bg-[#252838]">
                        <TableHead className="text-gray-400">Timestamp</TableHead>
                        <TableHead className="text-gray-400">Symbol</TableHead>
                        <TableHead className="text-gray-400">Action</TableHead>
                        <TableHead className="text-gray-400">Qty</TableHead>
                        <TableHead className="text-gray-400">Price</TableHead>
                        <TableHead className="text-gray-400">Total Value</TableHead>
                        <TableHead className="text-gray-400">Strategy</TableHead>
                        <TableHead className="text-gray-400">Account Type</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {allTrades.map((trade) => (
                        <TableRow key={trade.id.toString()} className="border-gray-800 hover:bg-[#252838]">
                          <TableCell className="text-gray-400">{formatDate(trade.trade_timestamp)}</TableCell>
                          <TableCell className="font-medium text-white">{trade.symbol}</TableCell>
                          <TableCell>
                            <Badge 
                              variant={trade.action === 'buy' ? 'default' : 'destructive'}
                              className={trade.action === 'buy' ? 'bg-green-600' : 'bg-red-600'}
                            >
                              {trade.action.toUpperCase()}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-white">{trade.qty}</TableCell>
                          <TableCell className="text-gray-400">{formatCurrency(trade.price)}</TableCell>
                          <TableCell className="text-white font-medium">{formatCurrency(trade.total_value)}</TableCell>
                          <TableCell className="text-gray-400 capitalize">{trade.strategy}</TableCell>
                          <TableCell className="text-gray-400 capitalize">{trade.account_type}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center py-12 text-gray-500">
                  <Activity className="h-12 w-12 mx-auto mb-4 opacity-20" />
                  <p>No trades yet</p>
                  <p className="text-sm mt-2">Your trading activity will appear here</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

