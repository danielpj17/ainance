'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TrendingUp, TrendingDown, Activity, DollarSign, Target } from 'lucide-react'
import { TradeStatistics } from '../types'

interface TradeStatisticsCardsProps {
  statistics: TradeStatistics
  formatCurrency: (value: number) => string
}

export default function TradeStatisticsCards({ statistics, formatCurrency }: TradeStatisticsCardsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      <Card className="glass-card">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-gray-400">Win Rate</CardTitle>
          <Target className="h-5 w-5 text-blue-500" />
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold text-white">
            {statistics.win_rate.toFixed(1)}%
          </div>
          <p className="text-xs text-gray-400 mt-1">
            {statistics.winning_trades} wins / {statistics.losing_trades} losses
          </p>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-gray-400">Total P&L</CardTitle>
          {statistics.total_profit_loss >= 0 ? (
            <TrendingUp className="h-5 w-5 text-green-500" />
          ) : (
            <TrendingDown className="h-5 w-5 text-red-500" />
          )}
        </CardHeader>
        <CardContent>
          <div className={`text-3xl font-bold ${statistics.total_profit_loss >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            {formatCurrency(statistics.total_profit_loss)}
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Avg: {formatCurrency(statistics.avg_profit_loss)}
          </p>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-gray-400">Open Positions</CardTitle>
          <Activity className="h-5 w-5 text-blue-500" />
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold text-white">{statistics.open_trades}</div>
          <p className="text-xs text-gray-400 mt-1">
            {statistics.closed_trades} completed
          </p>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-gray-400">Best Trade</CardTitle>
          <DollarSign className="h-5 w-5 text-green-500" />
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold text-green-500">
            {formatCurrency(statistics.best_trade)}
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Worst: {formatCurrency(statistics.worst_trade)}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

