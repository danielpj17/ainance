'use client'

import { memo } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Clock } from 'lucide-react'
import { CurrentTrade } from '../types'

interface CurrentTradeItemProps {
  trade: CurrentTrade
  onOpenDetails: (trade: CurrentTrade) => void
  onFetchTransactions: (symbol: string) => void
  formatCurrency: (value: number) => string
  formatDuration: (duration: string) => string
}

const CurrentTradeItem = memo(({ trade, onOpenDetails, onFetchTransactions, formatCurrency, formatDuration }: CurrentTradeItemProps) => {
  if (!trade || !trade.symbol) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[TRADE-LOGS PAGE] Invalid trade object:', trade)
    }
    return null
  }

  return (
    <div
      onClick={() => onOpenDetails(trade)}
      className="p-4 bg-[#252838] rounded-lg border border-gray-700 hover:border-blue-500 transition-all cursor-pointer"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="text-2xl font-bold text-white">{trade.symbol || 'N/A'}</div>
          <Badge className="bg-blue-400">BUY</Badge>
          <Badge variant="outline" className="border-gray-600 text-gray-400">
            {trade.qty} shares
          </Badge>
          {trade.transaction_count && trade.transaction_count > 1 && (
            <Badge variant="outline" className="border-blue-500/50 text-blue-400 text-xs">
              {trade.transaction_count} transactions
            </Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation()
              onFetchTransactions(trade.symbol)
            }}
            className="border-blue-500/50 text-blue-400 hover:bg-blue-500/10 text-xs"
          >
            View Transactions
          </Button>
        </div>
        <div className="text-right">
          <div className={`text-xl font-bold ${trade.unrealized_pl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            {formatCurrency(trade.unrealized_pl)}
          </div>
          <div className={`text-sm ${trade.unrealized_pl_percent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {trade.unrealized_pl_percent >= 0 ? '+' : ''}{trade.unrealized_pl_percent.toFixed(2)}%
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div>
          <div className="text-gray-500 mb-1">Buy Price</div>
          <div className="font-semibold text-white">{formatCurrency(trade.buy_price)}</div>
        </div>
        <div>
          <div className="text-gray-500 mb-1">Current Price</div>
          <div className="font-semibold text-white">{formatCurrency(trade.current_price)}</div>
        </div>
        <div>
          <div className="text-gray-500 mb-1">Position Value</div>
          <div className="font-semibold text-white">{formatCurrency(trade.current_value)}</div>
        </div>
        <div>
          <div className="text-gray-500 mb-1 flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Holding Time
          </div>
          <div className="font-semibold text-white">{formatDuration(trade.holding_duration)}</div>
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 text-xs text-gray-400">
            <div>
              Bought: {new Date(trade.buy_timestamp).toLocaleString()}
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
              className="border-blue-500 text-blue-400 hover:bg-blue-500/10"
            >
              View Transactions
            </Button>
            <div className="text-blue-400 hover:text-blue-300 text-xs">
              Click card for metrics →
            </div>
          </div>
        </div>
      </div>
    </div>
  )
})

CurrentTradeItem.displayName = 'CurrentTradeItem'

export default CurrentTradeItem

