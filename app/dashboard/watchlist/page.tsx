'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Search, Plus, Trash2, TrendingUp, TrendingDown, Loader2, AlertCircle } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface StockQuote {
  symbol: string
  price: number
  open: number
  high: number
  low: number
  volume: number
  change: number
  changePercent: number
  timestamp: string
}

interface WatchlistSymbol {
  id: string
  symbol: string
  notes?: string
  sortOrder: number
  addedAt: string
}

interface Watchlist {
  id: string
  name: string
  description?: string
  isDefault: boolean
  symbols: WatchlistSymbol[]
  createdAt: string
  updatedAt: string
}

interface SearchResult {
  symbol: string
  name: string
  exchange: string
}

export default function WatchlistPage() {
  const [watchlists, setWatchlists] = useState<Watchlist[]>([])
  const [selectedWatchlist, setSelectedWatchlist] = useState<Watchlist | null>(null)
  const [quotes, setQuotes] = useState<Record<string, StockQuote>>({})
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [isMarketOpen, setIsMarketOpen] = useState<boolean | null>(null)

  // Load watchlists on mount
  useEffect(() => {
    loadWatchlists()
    
    // Auto-refresh quotes every 30 seconds when market is open
    const refreshInterval = setInterval(() => {
      if (selectedWatchlist && selectedWatchlist.symbols.length > 0) {
        const symbols = selectedWatchlist.symbols.map(s => s.symbol)
        loadQuotes(symbols)
      }
    }, 30000) // 30 seconds
    
    return () => clearInterval(refreshInterval)
  }, [selectedWatchlist])

  // Load quotes when watchlist changes
  useEffect(() => {
    if (selectedWatchlist && selectedWatchlist.symbols.length > 0) {
      loadQuotes(selectedWatchlist.symbols.map(s => s.symbol))
    }
  }, [selectedWatchlist])

  // Search for stocks when query changes
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery.trim().length >= 2) {
        searchStocks(searchQuery)
      } else {
        setSearchResults([])
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [searchQuery])

  const loadWatchlists = async () => {
    try {
      setIsLoading(true)
      setError(null)

      // Use no-database API
      const response = await fetch('/api/no-db-watchlist')
      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error || 'Failed to load watchlists')
      }

      setWatchlists(data.watchlists || [])
      
      // Select default watchlist
      if (data.watchlists.length > 0) {
        const defaultWatchlist = data.watchlists.find((w: Watchlist) => w.isDefault) || data.watchlists[0]
        setSelectedWatchlist(defaultWatchlist)
      }
    } catch (err: any) {
      console.error('Error loading watchlists:', err)
      setError(err.message || 'Failed to load watchlists')
    } finally {
      setIsLoading(false)
    }
  }

  // This function is no longer needed since simple API handles creation
  const createDefaultWatchlist = async () => {
    // Simple API now handles this automatically
    await loadWatchlists()
  }

  const loadQuotes = async (symbols: string[]) => {
    try {
      if (symbols.length === 0) return

      const response = await fetch(`/api/stocks/quotes?symbols=${symbols.join(',')}`)
      const data = await response.json()

      if (data.success && data.quotes && Array.isArray(data.quotes)) {
        const quotesMap: Record<string, StockQuote> = {}
        data.quotes.forEach((quote: StockQuote) => {
          if (quote && quote.symbol) {
            quotesMap[quote.symbol] = {
              symbol: quote.symbol,
              price: quote.price || 0,
              open: quote.open || 0,
              high: quote.high || 0,
              low: quote.low || 0,
              volume: quote.volume || 0,
              change: quote.change || 0,
              changePercent: quote.changePercent || 0,
              timestamp: quote.timestamp || new Date().toISOString()
            }
            
            // Set market status from first quote
            if (isMarketOpen === null && quote.isMarketOpen !== undefined) {
              setIsMarketOpen(quote.isMarketOpen)
            }
          }
        })
        setQuotes(quotesMap)
      } else {
        console.log('No quotes data received:', data)
        // Set empty quotes map to prevent errors
        setQuotes({})
      }
    } catch (err) {
      console.error('Error loading quotes:', err)
      // Set empty quotes map to prevent errors
      setQuotes({})
    }
  }

  const searchStocks = async (query: string) => {
    try {
      setIsSearching(true)
      const response = await fetch(`/api/stocks/search?q=${encodeURIComponent(query)}&limit=10`)
      const data = await response.json()

      if (data.success) {
        setSearchResults(data.results || [])
      } else {
        setSearchResults([])
      }
    } catch (err) {
      console.error('Error searching stocks:', err)
      setSearchResults([])
    } finally {
      setIsSearching(false)
    }
  }

  const addToWatchlist = async (symbol: string) => {
    // If no watchlist selected, try to reload watchlists first
    if (!selectedWatchlist) {
      console.log('No watchlist selected, attempting to reload...')
      await loadWatchlists()
      
      // Check again after reload
      if (!selectedWatchlist) {
        setError('Unable to create or load watchlist. Please refresh the page.')
        return
      }
    }

    try {
      setError(null)
      setSuccessMessage(null)

      const response = await fetch('/api/no-db-watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: symbol.toUpperCase()
        })
      })

      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error || 'Failed to add symbol')
      }

      setSuccessMessage(`${symbol} added to watchlist`)
      setSearchQuery('')
      setSearchResults([])
      await loadWatchlists()
    } catch (err: any) {
      console.error('Error adding to watchlist:', err)
      setError(err.message || 'Failed to add symbol to watchlist')
    }
  }

  const removeFromWatchlist = async (symbolId: string) => {
    try {
      setError(null)
      setSuccessMessage(null)

      const response = await fetch(`/api/watchlists/symbols?id=${symbolId}`, {
        method: 'DELETE'
      })

      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error || 'Failed to remove symbol')
      }

      setSuccessMessage('Symbol removed from watchlist')
      await loadWatchlists()
    } catch (err: any) {
      console.error('Error removing from watchlist:', err)
      setError(err.message || 'Failed to remove symbol from watchlist')
    }
  }

  const formatPrice = (price: number | undefined | null) => {
    if (price === undefined || price === null || isNaN(price)) {
      return '0.00'
    }
    return price.toFixed(2)
  }

  const formatPercent = (percent: number | undefined | null) => {
    if (percent === undefined || percent === null || isNaN(percent)) {
      return '+0.00%'
    }
    return `${percent >= 0 ? '+' : ''}${percent.toFixed(2)}%`
  }

  const formatVolume = (volume: number | undefined | null) => {
    if (volume === undefined || volume === null || isNaN(volume)) {
      return '0'
    }
    if (volume >= 1000000) {
      return `${(volume / 1000000).toFixed(2)}M`
    } else if (volume >= 1000) {
      return `${(volume / 1000).toFixed(2)}K`
    }
    return volume.toString()
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0f1117] text-white flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-purple-500 mx-auto mb-4" />
          <p className="text-gray-400">Loading watchlist...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0f1117] text-white p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">Watchlist</h1>
          <p className="text-gray-400">Track your favorite stocks and monitor their performance</p>
        </div>
      </div>

      {/* Error/Success Messages */}
      {error && (
        <Alert className="mb-6 bg-red-900/20 border-red-900 text-red-400">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {successMessage && (
        <Alert className="mb-6 bg-green-900/20 border-green-900 text-green-400">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{successMessage}</AlertDescription>
        </Alert>
      )}

      {/* Search Bar */}
      <Card className="mb-6 bg-[#1a1d2e] border-gray-800">
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <Input
              type="text"
              placeholder="Search stocks by ticker or company name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-[#252838] border-gray-700 text-white placeholder:text-gray-500 focus:border-purple-500"
            />
            {isSearching && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 animate-spin text-purple-500" />
            )}
          </div>

          {/* Search Results */}
          {searchResults.length > 0 && (
            <div className="mt-4 space-y-2 max-h-64 overflow-y-auto">
              {searchResults.map((result) => (
                <div
                  key={result.symbol}
                  className="flex items-center justify-between p-3 bg-[#252838] rounded-lg hover:bg-[#2d3148] transition-colors"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white">{result.symbol}</span>
                      <Badge variant="outline" className="text-xs border-gray-600 text-gray-400">
                        {result.exchange}
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-400 mt-1">{result.name}</p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => addToWatchlist(result.symbol)}
                    disabled={selectedWatchlist?.symbols.some(s => s.symbol === result.symbol)}
                    className="bg-purple-600 hover:bg-purple-700"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add
                  </Button>
                </div>
              ))}
            </div>
          )}

          {searchQuery.trim().length >= 2 && searchResults.length === 0 && !isSearching && (
            <div className="mt-4 text-center py-8 text-gray-500">
              <p>No stocks found matching "{searchQuery}"</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Watchlist Table */}
      <Card className="bg-[#1a1d2e] border-gray-800">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-white">
                {selectedWatchlist?.name || 'Watchlist'}
              </CardTitle>
              <CardDescription className="text-gray-400">
                {selectedWatchlist?.symbols.length || 0} stocks in your watchlist
              </CardDescription>
            </div>
            {isMarketOpen !== null && (
              <div className={`px-3 py-1 rounded-full text-sm font-medium ${
                isMarketOpen 
                  ? 'bg-green-500/20 text-green-400 border border-green-500/30' 
                  : 'bg-red-500/20 text-red-400 border border-red-500/30'
              }`}>
                {isMarketOpen ? 'Market Open' : 'Market Closed'}
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {selectedWatchlist && selectedWatchlist.symbols.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="text-left py-3 px-4 text-gray-400 font-medium">Symbol</th>
                    <th className="text-right py-3 px-4 text-gray-400 font-medium">Price</th>
                    <th className="text-right py-3 px-4 text-gray-400 font-medium">Change</th>
                    <th className="text-right py-3 px-4 text-gray-400 font-medium">Change %</th>
                    <th className="text-right py-3 px-4 text-gray-400 font-medium">Volume</th>
                    <th className="text-right py-3 px-4 text-gray-400 font-medium">High</th>
                    <th className="text-right py-3 px-4 text-gray-400 font-medium">Low</th>
                    <th className="text-right py-3 px-4 text-gray-400 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedWatchlist.symbols.map((symbol) => {
                    const quote = quotes[symbol.symbol]
                    return (
                      <tr
                        key={symbol.id}
                        className="border-b border-gray-800 hover:bg-[#252838] transition-colors"
                      >
                        <td className="py-4 px-4">
                          <span className="font-bold text-white">{symbol.symbol}</span>
                        </td>
                        <td className="py-4 px-4 text-right text-white">
                          {quote ? `$${formatPrice(quote.price)}` : (
                            <Loader2 className="h-4 w-4 animate-spin text-gray-400 ml-auto" />
                          )}
                        </td>
                        <td className="py-4 px-4 text-right">
                          {quote ? (
                            <span className={quote.change >= 0 ? 'text-green-500' : 'text-red-500'}>
                              ${formatPrice(Math.abs(quote.change))}
                            </span>
                          ) : (
                            <span className="text-gray-600">-</span>
                          )}
                        </td>
                        <td className="py-4 px-4 text-right">
                          {quote ? (
                            <div className="flex items-center justify-end gap-1">
                              {quote.changePercent >= 0 ? (
                                <TrendingUp className="h-4 w-4 text-green-500" />
                              ) : (
                                <TrendingDown className="h-4 w-4 text-red-500" />
                              )}
                              <span className={quote.changePercent >= 0 ? 'text-green-500' : 'text-red-500'}>
                                {formatPercent(quote.changePercent)}
                              </span>
                            </div>
                          ) : (
                            <span className="text-gray-600">-</span>
                          )}
                        </td>
                        <td className="py-4 px-4 text-right text-gray-400">
                          {quote ? formatVolume(quote.volume) : '-'}
                        </td>
                        <td className="py-4 px-4 text-right text-gray-400">
                          {quote ? `$${formatPrice(quote.high)}` : '-'}
                        </td>
                        <td className="py-4 px-4 text-right text-gray-400">
                          {quote ? `$${formatPrice(quote.low)}` : '-'}
                        </td>
                        <td className="py-4 px-4 text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => removeFromWatchlist(symbol.id)}
                            className="text-red-400 hover:text-red-300 hover:bg-red-900/20"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="mx-auto w-16 h-16 bg-[#252838] rounded-full flex items-center justify-center mb-4">
                <Search className="h-8 w-8 text-gray-600" />
              </div>
              <h3 className="text-lg font-medium text-white mb-2">No stocks in watchlist</h3>
              <p className="text-gray-400 mb-4">
                Search for stocks above and add them to your watchlist
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

