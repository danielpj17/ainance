'use client'

import { Badge } from '@/components/ui/badge'
import { Activity } from 'lucide-react'

interface Transaction {
  id?: string
  action?: string
  qty: number
  price: number
  total_value: number
  timestamp: string
  status?: string
  trade_pair_id?: string
  alpaca_order_id?: string
  order_status?: string
  profit_loss?: number | null
  buy_decision_metrics?: any
  sell_decision_metrics?: any
}

interface TransactionsModalProps {
  symbol: string
  transactions: Transaction[]
  loadingTransactions: boolean
  onClose: () => void
  formatCurrency: (value: number) => string
}

export default function TransactionsModal({ symbol, transactions, loadingTransactions, onClose, formatCurrency }: TransactionsModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-[#1a1d2e] rounded-lg border border-gray-700 max-w-4xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-white">All Transactions: {symbol}</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {loadingTransactions ? (
            <div className="text-center py-8 text-gray-400">Loading transactions...</div>
          ) : transactions.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Activity className="h-12 w-12 mx-auto mb-2 opacity-20" />
              <p>No transactions found for {symbol}</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="mb-4 p-3 bg-[#252838] rounded-lg border border-gray-700">
                <div className="text-sm text-gray-400">Total Transactions: <span className="text-white font-bold">{transactions.length}</span></div>
                <div className="text-sm text-gray-400 mt-1">
                  Buy: <span className="text-green-400">{transactions.filter(t => t.action === 'buy').length}</span> | 
                  Sell: <span className="text-red-400">{transactions.filter(t => t.action === 'sell').length}</span>
                </div>
              </div>

              {transactions.map((transaction, idx) => (
                <div
                  key={transaction.id || idx}
                  className={`p-4 rounded-lg border ${
                    transaction.action === 'buy' 
                      ? 'bg-blue-500/10 border-blue-500/30' 
                      : 'bg-red-500/10 border-red-500/30'
                  }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <Badge className={transaction.action === 'buy' ? 'bg-blue-400' : 'bg-red-400'}>
                        {transaction.action?.toUpperCase() || 'N/A'}
                      </Badge>
                      <div className="text-lg font-bold text-white">
                        {transaction.qty} shares @ {formatCurrency(transaction.price)}
                      </div>
                      {transaction.trade_pair_id && (
                        <Badge variant="outline" className="border-gray-600 text-gray-400 text-xs">
                          Pair: {transaction.trade_pair_id.substring(0, 8)}...
                        </Badge>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-gray-400">
                        {new Date(transaction.timestamp).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true
                        })}
                      </div>
                      {transaction.status && (
                        <Badge variant="outline" className={`mt-1 ${
                          transaction.status === 'open' ? 'border-blue-500 text-blue-400' : 'border-gray-500 text-gray-400'
                        }`}>
                          {transaction.status}
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <div className="text-gray-500 mb-1">Total Value</div>
                      <div className="font-semibold text-white">{formatCurrency(transaction.total_value)}</div>
                    </div>
                    {transaction.alpaca_order_id && (
                      <div>
                        <div className="text-gray-500 mb-1">Order ID</div>
                        <div className="font-semibold text-white text-xs">{transaction.alpaca_order_id.substring(0, 20)}...</div>
                      </div>
                    )}
                    {transaction.order_status && (
                      <div>
                        <div className="text-gray-500 mb-1">Order Status</div>
                        <div className="font-semibold text-white">{transaction.order_status}</div>
                      </div>
                    )}
                    {transaction.profit_loss !== null && transaction.profit_loss !== undefined && (
                      <div>
                        <div className="text-gray-500 mb-1">P&L</div>
                        <div className={`font-semibold ${transaction.profit_loss >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {formatCurrency(transaction.profit_loss)}
                        </div>
                      </div>
                    )}
                  </div>

                  {(transaction.buy_decision_metrics || transaction.sell_decision_metrics) && (
                    <div className="mt-3 pt-3 border-t border-gray-700">
                      <div className="text-xs text-gray-400">
                        {transaction.action === 'buy' && transaction.buy_decision_metrics && (
                          <div>
                            <strong className="text-white">Buy Confidence:</strong> {((transaction.buy_decision_metrics.confidence || 0) * 100).toFixed(1)}%
                            {transaction.buy_decision_metrics.reasoning && (
                              <div className="mt-1 text-gray-500">{transaction.buy_decision_metrics.reasoning}</div>
                            )}
                          </div>
                        )}
                        {transaction.action === 'sell' && transaction.sell_decision_metrics && (
                          <div>
                            <strong className="text-white">Sell Confidence:</strong> {((transaction.sell_decision_metrics.confidence || 0) * 100).toFixed(1)}%
                            {transaction.sell_decision_metrics.reasoning && (
                              <div className="mt-1 text-gray-500">{transaction.sell_decision_metrics.reasoning}</div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

