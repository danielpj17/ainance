'use client'

import { memo } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Clock } from 'lucide-react'
import { CompletedTrade } from '../types'

interface CompletedTradeItemProps {
  trade: CompletedTrade
  onOpenDetails: (trade: CompletedTrade) => void
  onFetchTransactions: (symbol: string) => void
  formatCurrency: (value: number) => string
  formatDuration: (duration: string) => string
}

const CompletedTradeItem = memo(({ trade, onOpenDetails, onFetchTransactions, formatCurrency, formatDuration }: CompletedTradeItemProps) => {
  if (!trade || !trade.symbol) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[TRADE-LOGS PAGE] Invalid completed trade object:', trade)
    }
    return null
  }

  return (
    <div
      onClick={() => onOpenDetails(trade)}
      className="p-4 bg-[#252838] rounded-lg border border-gray-700 hover:border-purple-500 transition-all cursor-pointer"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="text-2xl font-bold text-white">{trade.symbol || 'N/A'}</div>
          <Badge variant="outline" className="border-gray-600 text-gray-400">
            {trade.qty} shares
          </Badge>
          {trade.transaction_count && trade.transaction_count > 1 && (
            <Badge variant="outline" className="border-purple-500/50 text-purple-400 text-xs">
              {trade.transaction_count} transactions
            </Badge>
          )}
          <Badge 
            className={trade.profit_loss >= 0 ? 'bg-green-600' : 'bg-red-600'}
          >
            {trade.profit_loss >= 0 ? 'WIN' : 'LOSS'}
          </Badge>
        </div>
        <div className="text-right">
          <div className={`text-xl font-bold ${trade.profit_loss >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            {formatCurrency(trade.profit_loss)}
          </div>
          <div className={`text-sm ${trade.profit_loss_percent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {trade.profit_loss_percent >= 0 ? '+' : ''}{trade.profit_loss_percent.toFixed(2)}%
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div>
          <div className="text-gray-500 mb-1">Buy Price</div>
          <div className="font-semibold text-white">{formatCurrency(trade.buy_price)}</div>
        </div>
        <div>
          <div className="text-gray-500 mb-1">Sell Price</div>
          <div className="font-semibold text-white">{formatCurrency(trade.sell_price)}</div>
        </div>
        <div>
          <div className="text-gray-500 mb-1">Return</div>
          <div className={`font-semibold ${trade.profit_loss >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {trade.profit_loss_percent >= 0 ? '+' : ''}{trade.profit_loss_percent.toFixed(2)}%
          </div>
        </div>
        <div>
          <div className="text-gray-500 mb-1 flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Duration
          </div>
          <div className="font-semibold text-white">{formatDuration(trade.holding_duration)}</div>
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 text-xs text-gray-400">
            <div>
              {new Date(trade.buy_timestamp).toLocaleDateString()} → {new Date(trade.sell_timestamp).toLocaleDateString()}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                onFetchTransactions(trade.symbol)
              }}
              className="border-purple-500 text-purple-400 hover:bg-purple-500/10"
            >
              View Transactions
            </Button>
            <div className="text-purple-400 hover:text-purple-300 text-xs">
              Click card for metrics →
            </div>
          </div>
        </div>
      </div>
    </div>
  )
})

CompletedTradeItem.displayName = 'CompletedTradeItem'

export default CompletedTradeItem

