'use client'

import { TrendingUp, TrendingDown } from 'lucide-react'
import { CurrentTrade, CompletedTrade } from '../types'

interface TradeDetailsModalProps {
  trade: CurrentTrade | CompletedTrade
  onClose: () => void
  formatCurrency: (value: number) => string
}

export default function TradeDetailsModal({ trade, onClose, formatCurrency }: TradeDetailsModalProps) {
  const isCompleted = 'sell_price' in trade && trade.sell_price

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-[#1a1d2e] rounded-lg border border-gray-700 max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-white">Trade Details: {trade.symbol}</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Buy Decision Metrics */}
          <div className="mb-6">
            <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-blue-500" />
              Buy Decision Metrics
            </h3>
            <div className="bg-[#252838] p-4 rounded-lg border border-gray-700">
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <div className="text-gray-500 text-sm mb-1">Confidence</div>
                  <div className="text-2xl font-bold text-white">
                    {((trade.buy_decision_metrics?.confidence || 0) * 100).toFixed(1)}%
                  </div>
                </div>
                <div>
                  <div className="text-gray-500 text-sm mb-1">Adjusted Confidence</div>
                  <div className="text-2xl font-bold text-purple-400">
                    {((trade.buy_decision_metrics?.adjusted_confidence || 0) * 100).toFixed(1)}%
                  </div>
                </div>
              </div>
              
              <div className="mb-4">
                <div className="text-gray-500 text-sm mb-1">Reasoning</div>
                <div className="text-white bg-[#1a1d2e] p-3 rounded border border-gray-700">
                  {trade.buy_decision_metrics?.reasoning || 'No reasoning provided'}
                </div>
              </div>

              {/* Technical Indicators */}
              {trade.buy_decision_metrics?.indicators && Object.keys(trade.buy_decision_metrics.indicators).length > 0 && (
                <div className="mb-4">
                  <div className="text-gray-500 text-sm mb-2">Technical Indicators</div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                    {trade.buy_decision_metrics.indicators.rsi !== undefined && (
                      <div className="bg-[#1a1d2e] p-2 rounded border border-gray-700">
                        <div className="text-gray-400 text-xs mb-1">RSI</div>
                        <div className={`font-bold ${
                          trade.buy_decision_metrics.indicators.rsi > 70 
                            ? 'text-red-400' 
                            : trade.buy_decision_metrics.indicators.rsi < 30 
                              ? 'text-green-400' 
                              : 'text-white'
                        }`}>
                          {trade.buy_decision_metrics.indicators.rsi.toFixed(2)}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {trade.buy_decision_metrics.indicators.rsi > 70 ? 'Overbought' : 
                           trade.buy_decision_metrics.indicators.rsi < 30 ? 'Oversold' : 'Neutral'}
                        </div>
                      </div>
                    )}
                    {trade.buy_decision_metrics.indicators.macd !== undefined && (
                      <div className="bg-[#1a1d2e] p-2 rounded border border-gray-700">
                        <div className="text-gray-400 text-xs mb-1">MACD</div>
                        <div className={`font-bold ${
                          trade.buy_decision_metrics.indicators.macd > 0 
                            ? 'text-green-400' 
                            : 'text-red-400'
                        }`}>
                          {trade.buy_decision_metrics.indicators.macd.toFixed(4)}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {trade.buy_decision_metrics.indicators.macd > 0 ? 'Bullish' : 'Bearish'}
                        </div>
                      </div>
                    )}
                    {trade.buy_decision_metrics.indicators.stochastic !== undefined && (
                      <div className="bg-[#1a1d2e] p-2 rounded border border-gray-700">
                        <div className="text-gray-400 text-xs mb-1">Stochastic</div>
                        <div className={`font-bold ${
                          trade.buy_decision_metrics.indicators.stochastic > 80 
                            ? 'text-red-400' 
                            : trade.buy_decision_metrics.indicators.stochastic < 20 
                              ? 'text-green-400' 
                              : 'text-white'
                        }`}>
                          {trade.buy_decision_metrics.indicators.stochastic.toFixed(2)}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {trade.buy_decision_metrics.indicators.stochastic > 80 ? 'Overbought' : 
                           trade.buy_decision_metrics.indicators.stochastic < 20 ? 'Oversold' : 'Neutral'}
                        </div>
                      </div>
                    )}
                    {trade.buy_decision_metrics.indicators.bb_position !== undefined && (
                      <div className="bg-[#1a1d2e] p-2 rounded border border-gray-700">
                        <div className="text-gray-400 text-xs mb-1">BB Position</div>
                        <div className={`font-bold ${
                          trade.buy_decision_metrics.indicators.bb_position > 0.9 
                            ? 'text-red-400' 
                            : trade.buy_decision_metrics.indicators.bb_position < 0.1 
                              ? 'text-green-400' 
                              : 'text-white'
                        }`}>
                          {(trade.buy_decision_metrics.indicators.bb_position * 100).toFixed(1)}%
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {trade.buy_decision_metrics.indicators.bb_position > 0.9 ? 'Upper Band' : 
                           trade.buy_decision_metrics.indicators.bb_position < 0.1 ? 'Lower Band' : 'Mid Range'}
                        </div>
                      </div>
                    )}
                    {trade.buy_decision_metrics.indicators.volume_ratio !== undefined && (
                      <div className="bg-[#1a1d2e] p-2 rounded border border-gray-700">
                        <div className="text-gray-400 text-xs mb-1">Volume Ratio</div>
                        <div className={`font-bold ${
                          trade.buy_decision_metrics.indicators.volume_ratio > 2 
                            ? 'text-green-400' 
                            : trade.buy_decision_metrics.indicators.volume_ratio < 0.5 
                              ? 'text-yellow-400' 
                              : 'text-white'
                        }`}>
                          {trade.buy_decision_metrics.indicators.volume_ratio.toFixed(2)}x
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {trade.buy_decision_metrics.indicators.volume_ratio > 2 ? 'High Volume' : 
                           trade.buy_decision_metrics.indicators.volume_ratio < 0.5 ? 'Low Volume' : 'Normal'}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Model Probabilities */}
              {trade.buy_decision_metrics?.probabilities && Object.keys(trade.buy_decision_metrics.probabilities).length > 0 && (
                <div className="mb-4">
                  <div className="text-gray-500 text-sm mb-2">ML Model Probabilities</div>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    {Object.entries(trade.buy_decision_metrics.probabilities).map(([action, prob]: [string, any]) => (
                      <div key={action} className="bg-[#1a1d2e] p-2 rounded border border-gray-700 text-center">
                        <div className="text-gray-400 text-xs mb-1 capitalize">{action}</div>
                        <div className={`font-bold ${
                          action === 'buy' ? 'text-green-400' : 
                          action === 'sell' ? 'text-red-400' : 
                          'text-gray-400'
                        }`}>
                          {(prob * 100).toFixed(1)}%
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-3 gap-4 text-sm">
                <div className="text-center">
                  <div className="text-gray-500 mb-1">News Sentiment</div>
                  <div className={`font-bold ${
                    (trade.buy_decision_metrics?.news_sentiment || 0) > 0 
                      ? 'text-green-400' 
                      : (trade.buy_decision_metrics?.news_sentiment || 0) < 0 
                        ? 'text-red-400' 
                        : 'text-gray-400'
                  }`}>
                    {((trade.buy_decision_metrics?.news_sentiment || 0) * 100).toFixed(1)}%
                  </div>
                  {trade.buy_decision_metrics?.sentiment_boost !== undefined && trade.buy_decision_metrics.sentiment_boost > 0 && (
                    <div className="text-xs text-purple-400 mt-1">
                      +{((trade.buy_decision_metrics.sentiment_boost) * 100).toFixed(1)}% boost
                    </div>
                  )}
                </div>
                <div className="text-center">
                  <div className="text-gray-500 mb-1">Market Risk</div>
                  <div className={`font-bold ${
                    (trade.buy_decision_metrics?.market_risk || 0) < 0.3 
                      ? 'text-green-400' 
                      : (trade.buy_decision_metrics?.market_risk || 0) < 0.6 
                        ? 'text-yellow-400' 
                        : 'text-red-400'
                  }`}>
                    {((trade.buy_decision_metrics?.market_risk || 0) * 100).toFixed(0)}%
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-gray-500 mb-1">Buy Price</div>
                  <div className="font-bold text-white">
                    {formatCurrency(trade.buy_price)}
                  </div>
                </div>
              </div>

              {/* Buy Timestamp */}
              {trade.buy_timestamp && (
                <div className="mt-4 pt-4 border-t border-gray-700">
                  <div className="text-gray-500 text-sm mb-1">Buy Timestamp</div>
                  <div className="text-white text-sm">
                    {new Date(trade.buy_timestamp).toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                      hour12: true,
                      timeZoneName: 'short'
                    })}
                  </div>
                </div>
              )}

              {trade.buy_decision_metrics?.news_headlines && trade.buy_decision_metrics.news_headlines.length > 0 && (
                <div className="mt-4">
                  <div className="text-gray-500 text-sm mb-2">News Headlines</div>
                  <ul className="space-y-1 text-xs text-gray-400">
                    {trade.buy_decision_metrics.news_headlines.map((headline: string, idx: number) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="text-purple-500 mt-1">•</span>
                        <span>{headline}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {/* Buy vs Sell Confidence Comparison (for completed trades) */}
          {isCompleted && 'sell_decision_metrics' in trade && trade.sell_decision_metrics && (
            <div className="mb-6 p-4 bg-gradient-to-r from-green-500/10 to-red-500/10 rounded-lg border border-gray-700">
              <h3 className="text-lg font-semibold text-white mb-3">Confidence Comparison</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-[#1a1d2e] p-3 rounded border border-blue-500/30">
                  <div className="text-gray-400 text-xs mb-1">Buy Confidence</div>
                  <div className="text-2xl font-bold text-blue-400">
                    {((trade.buy_decision_metrics?.confidence || 0) * 100).toFixed(1)}%
                  </div>
                  <div className="text-xs text-gray-500 mt-1">When position was opened</div>
                </div>
                <div className="bg-[#1a1d2e] p-3 rounded border border-purple-500/30">
                  <div className="text-gray-400 text-xs mb-1">Sell Confidence</div>
                  <div className="text-2xl font-bold text-purple-400">
                    {((trade.sell_decision_metrics.confidence || 0) * 100).toFixed(1)}%
                  </div>
                  <div className="text-xs text-gray-500 mt-1">When position was closed</div>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-gray-700">
                <div className="text-xs text-gray-400">
                  <strong className="text-white">Note:</strong> Buy and sell confidences are independent evaluations. 
                  A higher sell confidence means the ML model detected favorable conditions to exit at that moment, 
                  not that the original buy was better. The model evaluates current market conditions (technical indicators, 
                  momentum, volume) to determine the best time to sell, regardless of the original buy confidence.
                </div>
              </div>
            </div>
          )}

          {/* Sell Decision Metrics (only for completed trades) */}
          {isCompleted && 'sell_decision_metrics' in trade && trade.sell_decision_metrics && (
            <div>
              <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                <TrendingDown className="h-5 w-5 text-red-500" />
                Sell Decision Metrics
              </h3>
              <div className="bg-[#252838] p-4 rounded-lg border border-gray-700">
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <div className="text-gray-500 text-sm mb-1">Confidence</div>
                    <div className="text-2xl font-bold text-white">
                      {((trade.sell_decision_metrics.confidence || 0) * 100).toFixed(1)}%
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-500 text-sm mb-1">Adjusted Confidence</div>
                    <div className="text-2xl font-bold text-purple-400">
                      {((trade.sell_decision_metrics.adjusted_confidence || 0) * 100).toFixed(1)}%
                    </div>
                  </div>
                </div>
                
                <div className="mb-4">
                  <div className="text-gray-500 text-sm mb-1">Reasoning</div>
                  <div className="text-white bg-[#1a1d2e] p-3 rounded border border-gray-700">
                    {trade.sell_decision_metrics.reasoning || 'No reasoning provided'}
                  </div>
                </div>

                {/* Technical Indicators */}
                {trade.sell_decision_metrics.indicators && Object.keys(trade.sell_decision_metrics.indicators).length > 0 && (
                  <div className="mb-4">
                    <div className="text-gray-500 text-sm mb-2">Technical Indicators</div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                      {trade.sell_decision_metrics.indicators.rsi !== undefined && (
                        <div className="bg-[#1a1d2e] p-2 rounded border border-gray-700">
                          <div className="text-gray-400 text-xs mb-1">RSI</div>
                          <div className={`font-bold ${
                            trade.sell_decision_metrics.indicators.rsi > 70 
                              ? 'text-red-400' 
                              : trade.sell_decision_metrics.indicators.rsi < 30 
                                ? 'text-green-400' 
                                : 'text-white'
                          }`}>
                            {trade.sell_decision_metrics.indicators.rsi.toFixed(2)}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            {trade.sell_decision_metrics.indicators.rsi > 70 ? 'Overbought' : 
                             trade.sell_decision_metrics.indicators.rsi < 30 ? 'Oversold' : 'Neutral'}
                          </div>
                        </div>
                      )}
                      {trade.sell_decision_metrics.indicators.macd !== undefined && (
                        <div className="bg-[#1a1d2e] p-2 rounded border border-gray-700">
                          <div className="text-gray-400 text-xs mb-1">MACD</div>
                          <div className={`font-bold ${
                            trade.sell_decision_metrics.indicators.macd > 0 
                              ? 'text-green-400' 
                              : 'text-red-400'
                          }`}>
                            {trade.sell_decision_metrics.indicators.macd.toFixed(4)}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            {trade.sell_decision_metrics.indicators.macd > 0 ? 'Bullish' : 'Bearish'}
                          </div>
                        </div>
                      )}
                      {trade.sell_decision_metrics.indicators.stochastic !== undefined && (
                        <div className="bg-[#1a1d2e] p-2 rounded border border-gray-700">
                          <div className="text-gray-400 text-xs mb-1">Stochastic</div>
                          <div className={`font-bold ${
                            trade.sell_decision_metrics.indicators.stochastic > 80 
                              ? 'text-red-400' 
                              : trade.sell_decision_metrics.indicators.stochastic < 20 
                                ? 'text-green-400' 
                                : 'text-white'
                          }`}>
                            {trade.sell_decision_metrics.indicators.stochastic.toFixed(2)}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            {trade.sell_decision_metrics.indicators.stochastic > 80 ? 'Overbought' : 
                             trade.sell_decision_metrics.indicators.stochastic < 20 ? 'Oversold' : 'Neutral'}
                          </div>
                        </div>
                      )}
                      {trade.sell_decision_metrics.indicators.bb_position !== undefined && (
                        <div className="bg-[#1a1d2e] p-2 rounded border border-gray-700">
                          <div className="text-gray-400 text-xs mb-1">BB Position</div>
                          <div className={`font-bold ${
                            trade.sell_decision_metrics.indicators.bb_position > 0.9 
                              ? 'text-red-400' 
                              : trade.sell_decision_metrics.indicators.bb_position < 0.1 
                                ? 'text-green-400' 
                                : 'text-white'
                          }`}>
                            {(trade.sell_decision_metrics.indicators.bb_position * 100).toFixed(1)}%
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            {trade.sell_decision_metrics.indicators.bb_position > 0.9 ? 'Upper Band' : 
                             trade.sell_decision_metrics.indicators.bb_position < 0.1 ? 'Lower Band' : 'Mid Range'}
                          </div>
                        </div>
                      )}
                      {trade.sell_decision_metrics.indicators.volume_ratio !== undefined && (
                        <div className="bg-[#1a1d2e] p-2 rounded border border-gray-700">
                          <div className="text-gray-400 text-xs mb-1">Volume Ratio</div>
                          <div className={`font-bold ${
                            trade.sell_decision_metrics.indicators.volume_ratio > 2 
                              ? 'text-green-400' 
                              : trade.sell_decision_metrics.indicators.volume_ratio < 0.5 
                                ? 'text-yellow-400' 
                                : 'text-white'
                          }`}>
                            {trade.sell_decision_metrics.indicators.volume_ratio.toFixed(2)}x
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            {trade.sell_decision_metrics.indicators.volume_ratio > 2 ? 'High Volume' : 
                             trade.sell_decision_metrics.indicators.volume_ratio < 0.5 ? 'Low Volume' : 'Normal'}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Model Probabilities */}
                {trade.sell_decision_metrics.probabilities && Object.keys(trade.sell_decision_metrics.probabilities).length > 0 && (
                  <div className="mb-4">
                    <div className="text-gray-500 text-sm mb-2">ML Model Probabilities</div>
                    <div className="grid grid-cols-3 gap-2 text-sm">
                      {Object.entries(trade.sell_decision_metrics.probabilities).map(([action, prob]: [string, any]) => (
                        <div key={action} className="bg-[#1a1d2e] p-2 rounded border border-gray-700 text-center">
                          <div className="text-gray-400 text-xs mb-1 capitalize">{action}</div>
                          <div className={`font-bold ${
                            action === 'buy' ? 'text-green-400' : 
                            action === 'sell' ? 'text-red-400' : 
                            'text-gray-400'
                          }`}>
                            {(prob * 100).toFixed(1)}%
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div className="text-center">
                    <div className="text-gray-500 mb-1">News Sentiment</div>
                    <div className={`font-bold ${
                      (trade.sell_decision_metrics.news_sentiment || 0) > 0 
                        ? 'text-green-400' 
                        : (trade.sell_decision_metrics.news_sentiment || 0) < 0 
                          ? 'text-red-400' 
                          : 'text-gray-400'
                    }`}>
                      {((trade.sell_decision_metrics.news_sentiment || 0) * 100).toFixed(1)}%
                    </div>
                    {trade.sell_decision_metrics.sentiment_boost !== undefined && trade.sell_decision_metrics.sentiment_boost > 0 && (
                      <div className="text-xs text-purple-400 mt-1">
                        +{((trade.sell_decision_metrics.sentiment_boost) * 100).toFixed(1)}% boost
                      </div>
                    )}
                  </div>
                  <div className="text-center">
                    <div className="text-gray-500 mb-1">Market Risk</div>
                    <div className={`font-bold ${
                      (trade.sell_decision_metrics.market_risk || 0) < 0.3 
                        ? 'text-green-400' 
                        : (trade.sell_decision_metrics.market_risk || 0) < 0.6 
                          ? 'text-yellow-400' 
                          : 'text-red-400'
                    }`}>
                      {((trade.sell_decision_metrics.market_risk || 0) * 100).toFixed(0)}%
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-gray-500 mb-1">Sell Price</div>
                    <div className="font-bold text-white">
                      {formatCurrency(isCompleted && 'sell_price' in trade ? trade.sell_price : 0)}
                    </div>
                  </div>
                </div>

                {/* Sell Timestamp */}
                {isCompleted && 'sell_timestamp' in trade && trade.sell_timestamp && (
                  <div className="mt-4 pt-4 border-t border-gray-700">
                    <div className="text-gray-500 text-sm mb-1">Sell Timestamp</div>
                    <div className="text-white text-sm">
                      {new Date(trade.sell_timestamp).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                        hour12: true,
                        timeZoneName: 'short'
                      })}
                    </div>
                  </div>
                )}

                {trade.sell_decision_metrics.news_headlines && trade.sell_decision_metrics.news_headlines.length > 0 && (
                  <div className="mt-4">
                    <div className="text-gray-500 text-sm mb-2">News Headlines</div>
                    <ul className="space-y-1 text-xs text-gray-400">
                      {trade.sell_decision_metrics.news_headlines.map((headline: string, idx: number) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="text-purple-500 mt-1">•</span>
                          <span>{headline}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Trade Outcome (for completed trades) */}
          {isCompleted && 'sell_price' in trade && trade.sell_price && (
            <div className="mt-6 p-4 bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-lg border border-blue-500/30">
              <h3 className="text-lg font-semibold text-white mb-3">Trade Outcome</h3>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <div className="text-gray-400 text-sm mb-1">Buy Price</div>
                  <div className="text-xl font-bold text-white">{formatCurrency(trade.buy_price)}</div>
                </div>
                <div>
                  <div className="text-gray-400 text-sm mb-1">Sell Price</div>
                  <div className="text-xl font-bold text-white">{formatCurrency(trade.sell_price)}</div>
                </div>
                <div>
                  <div className="text-gray-400 text-sm mb-1">Profit/Loss</div>
                  <div className={`text-2xl font-bold ${trade.profit_loss >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {formatCurrency(trade.profit_loss)}
                  </div>
                </div>
                <div>
                  <div className="text-gray-400 text-sm mb-1">Return %</div>
                  <div className={`text-2xl font-bold ${trade.profit_loss_percent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {trade.profit_loss_percent >= 0 ? '+' : ''}{trade.profit_loss_percent.toFixed(2)}%
                  </div>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-blue-500/30">
                <div className="text-xs text-gray-400">
                  <strong className="text-white">Why did it sell?</strong> The ML model evaluates current market conditions independently for buy and sell decisions. 
                  A sell confidence of {((trade.sell_decision_metrics?.confidence || 0) * 100).toFixed(1)}% means the model detected favorable conditions to exit the position at that moment, 
                  {trade.profit_loss >= 0 
                    ? ` resulting in a ${trade.profit_loss_percent.toFixed(2)}% gain.` 
                    : ` resulting in a ${Math.abs(trade.profit_loss_percent).toFixed(2)}% loss.`}
                  {' '}The sell decision is based on current technical indicators, not a comparison to the original buy confidence.
                </div>
              </div>
            </div>
          )}

          {/* Trade Summary */}
          <div className="mt-6 p-4 bg-blue-500/10 rounded-lg border border-blue-500/30">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-gray-400 mb-1">Trade ID</div>
                <div className="text-white font-mono">{trade.trade_pair_id.slice(0, 8)}...</div>
              </div>
              <div>
                <div className="text-gray-400 mb-1">Strategy</div>
                <div className="text-white">{trade.strategy}</div>
              </div>
              <div>
                <div className="text-gray-400 mb-1">Account Type</div>
                <div className="text-white capitalize">{trade.account_type}</div>
              </div>
              <div>
                <div className="text-gray-400 mb-1">Quantity</div>
                <div className="text-white">{trade.qty} shares</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

