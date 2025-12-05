'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Activity } from 'lucide-react'
import { CurrentTrade } from '../types'
import CurrentTradeItem from './CurrentTradeItem'

interface CurrentTradesListProps {
  currentTrades: CurrentTrade[]
  isLoading: boolean
  showAllCurrent: boolean
  setShowAllCurrent: (show: boolean) => void
  openTradeDetails: (trade: CurrentTrade) => void
  fetchTransactions: (symbol: string) => void
  formatCurrency: (value: number) => string
  formatDuration: (duration: string) => string
}

export default function CurrentTradesList({
  currentTrades,
  isLoading,
  showAllCurrent,
  setShowAllCurrent,
  openTradeDetails,
  fetchTransactions,
  formatCurrency,
  formatDuration
}: CurrentTradesListProps) {
  const displayedTrades = showAllCurrent ? currentTrades : currentTrades.slice(0, 10)

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="text-white">Current Positions</CardTitle>
        <CardDescription className="text-gray-400">
          Active trades that have been bought but not sold yet
        </CardDescription>
      </CardHeader>
      <CardContent>
        {process.env.NODE_ENV === 'development' && (
          <div className="mb-4 p-2 bg-gray-800 rounded text-xs text-gray-400">
            Debug: isLoading={isLoading.toString()}, currentTrades.length={currentTrades.length}
          </div>
        )}
        {isLoading ? (
          <div className="text-center py-8 text-gray-400">Loading...</div>
        ) : currentTrades.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Activity className="h-12 w-12 mx-auto mb-2 opacity-20" />
            <p>No current positions</p>
            <p className="text-xs text-gray-600 mt-2">Check console for debug info</p>
          </div>
        ) : (
          <div className="space-y-4">
              {displayedTrades.map((trade) => (
                <CurrentTradeItem
                  key={trade.id?.toString() || Math.random()}
                  trade={trade}
                  onOpenDetails={openTradeDetails}
                  onFetchTransactions={fetchTransactions}
                  formatCurrency={formatCurrency}
                  formatDuration={formatDuration}
                />
              ))}
            
            {currentTrades.length > 10 && (
              <div className="pt-4 border-t border-gray-700">
                <Button
                  variant="outline"
                  onClick={() => setShowAllCurrent(!showAllCurrent)}
                  className="w-full border-blue-500 text-blue-400 hover:bg-blue-500/10"
                >
                  {showAllCurrent ? 'Show Less' : `See More (${currentTrades.length - 10} more)`}
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

