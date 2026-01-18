'use client'

import { useState, useEffect } from 'react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'

export default function PortfolioChart({ accountId }: { accountId: string | null }) {
  const [period, setPeriod] = useState('1D')
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (accountId) fetchHistory()
  }, [accountId, period])

  const fetchHistory = async () => {
    setLoading(true)
    try {
      const tfMap: Record<string, string> = { '1D': '5Min', '1W': '1H', '1M': '1D', '1A': '1W' }
      const timeframe = tfMap[period] || '1D'
      const res = await fetch(`/api/account/history?account_id=${accountId}&period=${period}&timeframe=${timeframe}`)
      const json = await res.json()

      if (json.success && json.data?.timestamp) {
        const chartData = json.data.timestamp.map((ts: number, i: number) => ({
          time: ts,
          value: json.data.equity[i]
        }))
        setData(chartData)
      }
    } catch (e) {
      console.error('Chart Load Error', e)
    } finally {
      setLoading(false)
    }
  }

  const formatMoney = (val: number) => {
    if (val >= 1000000) return `$${(val / 1000000).toFixed(2)}M`
    if (val >= 1000) return `$${(val / 1000).toFixed(0)}k`
    return `$${val.toFixed(0)}`
  }

  const minValue = data.length ? Math.min(...data.map(d => d.value)) * 0.998 : 0
  const maxValue = data.length ? Math.max(...data.map(d => d.value)) * 1.002 : 0

  const buildTicks = (timestamps: number[]) => {
    if (timestamps.length === 0) return []
    const start = timestamps[0]
    const end = timestamps[timestamps.length - 1]
    if (period === '1M') {
      const tickCount = 15
      const span = end - start
      const step = span > 0 ? span / (tickCount - 1) : 0
      return Array.from({ length: tickCount }, (_, i) => Math.round(start + step * i))
    }

    const stepSecondsMap: Record<string, number> = {
      '1D': 60 * 60,
      '1W': 24 * 60 * 60,
      '1A': 7 * 24 * 60 * 60
    }
    const step = stepSecondsMap[period] || 24 * 60 * 60
    const firstTick = Math.ceil(start / step) * step
    const ticks: number[] = []
    for (let t = firstTick; t <= end; t += step) {
      ticks.push(t)
    }
    return ticks.length ? ticks : [start, end]
  }

  const formatTimestamp = (ts: number) => {
    const date = new Date(ts * 1000)
    if (period === '1D') {
      return date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit'
      })
    }
    if (period === '1W') {
      return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric'
      })
    }
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    })
  }

  const ticks = buildTicks(data.map((d) => d.time))

  return (
    <Card className="glass-card h-full">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-lg font-medium text-white">Portfolio Value</CardTitle>
        <div className="flex gap-1">
          {['1D', '1W', '1M', '1A'].map((p) => (
            <Button
              key={p}
              variant={period === p ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setPeriod(p)}
              className="h-7 text-xs"
            >
              {p}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[300px] w-full">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
            </div>
          ) : data.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data}>
                <defs>
                  <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                <XAxis
                  dataKey="time"
                  type="number"
                  scale="time"
                  domain={['dataMin', 'dataMax']}
                  ticks={ticks}
                  interval={0}
                  minTickGap={0}
                  tickFormatter={formatTimestamp}
                  stroke="#9ca3af"
                  tick={{ fontSize: 11 }}
                />
                <YAxis domain={[minValue, maxValue]} tickFormatter={formatMoney} stroke="#9ca3af" width={60} tick={{fontSize: 12}} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }}
                  itemStyle={{ color: '#fff' }}
                  formatter={(val: number) => [`$${val.toFixed(2)}`, 'Value']}
                  labelFormatter={(label: number) => formatTimestamp(label)}
                  labelStyle={{ color: '#9ca3af', marginBottom: '4px' }}
                />
                <Area type="monotone" dataKey="value" stroke="#3b82f6" fill="url(#chartGradient)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-gray-500">
              No data available
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
