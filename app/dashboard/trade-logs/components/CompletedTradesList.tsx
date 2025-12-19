'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Activity } from 'lucide-react'
import { CompletedTrade } from '../types'
import CompletedTradeItem from './CompletedTradeItem'

interface CompletedTradesListProps {
  completedTrades: CompletedTrade[]
  isLoading: boolean
  showAllCompleted: boolean
  setShowAllCompleted: (show: boolean) => void
  openTradeDetails: (trade: CompletedTrade) => void
  fetchTransactions: (symbol: string) => void
  formatCurrency: (value: number) => string
  formatDuration: (duration: string) => string
}

export default function CompletedTradesList({
  completedTrades,
  isLoading,
  showAllCompleted,
  setShowAllCompleted,
  openTradeDetails,
  fetchTransactions,
  formatCurrency,
  formatDuration
}: CompletedTradesListProps) {
  const displayedTrades = showAllCompleted ? completedTrades : completedTrades.slice(0, 10)

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="text-white">Completed Trades</CardTitle>
        <CardDescription className="text-gray-400">
          Trades that have been both bought and sold
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8 text-gray-400">Loading...</div>
        ) : completedTrades.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Activity className="h-12 w-12 mx-auto mb-2 opacity-20" />
            <p>No completed trades yet</p>
          </div>
        ) : (
          <div className="space-y-4">
              {displayedTrades.map((trade) => (
                <CompletedTradeItem
                  key={trade.id?.toString() || Math.random()}
                  trade={trade}
                  onOpenDetails={openTradeDetails}
                  onFetchTransactions={fetchTransactions}
                  formatCurrency={formatCurrency}
                  formatDuration={formatDuration}
                />
              ))}
            
            {completedTrades.length > 10 && (
              <div className="pt-4 border-t border-gray-700">
                <Button
                  variant="outline"
                  onClick={() => setShowAllCompleted(!showAllCompleted)}
                  className="w-full border-blue-500 text-blue-400 hover:bg-blue-500/10"
                >
                  {showAllCompleted ? 'Show Less' : `See More (${completedTrades.length - 10} more)`}
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

