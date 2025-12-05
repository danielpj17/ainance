'use client'

import { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { createClient } from '@/utils/supabase/client'
import { CurrentTrade, CompletedTrade, TradeStatistics } from './types'
import TradeStatisticsCards from './components/TradeStatisticsCards'
import CurrentTradesList from './components/CurrentTradesList'
import CompletedTradesList from './components/CompletedTradesList'
import TradeDetailsModal from './components/TradeDetailsModal'
import TransactionsModal from './components/TransactionsModal'

export default function TradeLogsPage() {
  const [currentTrades, setCurrentTrades] = useState<CurrentTrade[]>([])
  const [completedTrades, setCompletedTrades] = useState<CompletedTrade[]>([])
  const [statistics, setStatistics] = useState<TradeStatistics | null>(null)
  const [selectedTrade, setSelectedTrade] = useState<CurrentTrade | CompletedTrade | null>(null)
  const [showDetails, setShowDetails] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null)
  const [showTransactions, setShowTransactions] = useState(false)
  const [transactions, setTransactions] = useState<any[]>([])
  const [loadingTransactions, setLoadingTransactions] = useState(false)
  const [showAllCurrent, setShowAllCurrent] = useState(false)
  const [showAllCompleted, setShowAllCompleted] = useState(false)
  
  // Debug: Log state changes
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('[TRADE-LOGS PAGE] State updated:', {
        currentTrades: currentTrades.length,
        completedTrades: completedTrades.length,
        isLoading
      })
    }
  }, [currentTrades, completedTrades, isLoading])

  const fetchTradeData = async () => {
    if (process.env.NODE_ENV === 'development') {
      console.log('[TRADE-LOGS PAGE] fetchTradeData called')
    }
    try {
      const supabase = createClient()
      let session = null
      try {
        const { data: { session: sessionData } } = await supabase.auth.getSession()
        session = sessionData
        if (process.env.NODE_ENV === 'development') {
          console.log('[TRADE-LOGS PAGE] Session:', session ? 'Found' : 'Not found (will use cookie auth)')
        }
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.error('[TRADE-LOGS PAGE] Error getting session:', error)
        }
      }

      const response = await fetch('/api/trade-logs', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()
      if (process.env.NODE_ENV === 'development') {
        console.log('[TRADE-LOGS PAGE] Fetched data:', {
          currentTrades: data.currentTrades?.length || 0,
          completedTrades: data.completedTrades?.length || 0,
          statistics: data.statistics ? 'Present' : 'Missing'
        })
      }

      if (data.currentTrades) {
        setCurrentTrades(data.currentTrades)
      }
      if (data.completedTrades) {
        setCompletedTrades(data.completedTrades)
      }
      if (data.statistics) {
        setStatistics(data.statistics)
      }
      setIsLoading(false)
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[TRADE-LOGS PAGE] Error fetching trade data:', error)
      }
      setIsLoading(false)
    }
  }

  // Polling interval ref
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const isVisibleRef = useRef(true)

  // Page Visibility API
  useEffect(() => {
    const handleVisibilityChange = () => {
      isVisibleRef.current = !document.hidden
      
      if (document.hidden) {
        // Pause polling when tab is hidden
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current)
          pollingIntervalRef.current = null
        }
      } else {
        // Resume polling and refresh data when tab becomes visible
        fetchTradeData()
        if (pollingIntervalRef.current === null) {
          pollingIntervalRef.current = setInterval(fetchTradeData, 60000) // 60 seconds
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  // Initial load and polling setup
  useEffect(() => {
    fetchTradeData()
    
    // Set up polling interval
    pollingIntervalRef.current = setInterval(fetchTradeData, 60000) // 60 seconds
    
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
      }
    }
  }, [])

  const formatCurrency = useCallback((value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value)
  }, [])

  const formatDuration = (duration: string) => {
    if (!duration) return 'N/A'
    try {
      // Parse ISO 8601 duration format (e.g., "P1DT2H3M4S")
      const match = duration.match(/P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?/)
      if (!match) return duration

      const days = parseInt(match[1] || '0', 10)
      const hours = parseInt(match[2] || '0', 10)
      const minutes = parseInt(match[3] || '0', 10)
      const seconds = parseInt(match[4] || '0', 10)

      const parts: string[] = []
      if (days > 0) parts.push(`${days}d`)
      if (hours > 0) parts.push(`${hours}h`)
      if (minutes > 0) parts.push(`${minutes}m`)
      if (seconds > 0 && days === 0 && hours === 0) parts.push(`${seconds}s`)

      return parts.length > 0 ? parts.join(' ') : '0s'
    } catch (error) {
      return duration
    }
  }

  const openTradeDetails = useCallback((trade: CurrentTrade | CompletedTrade) => {
    setSelectedTrade(trade)
    setShowDetails(true)
  }, [])

  const closeTradeDetails = useCallback(() => {
    setShowDetails(false)
    setSelectedTrade(null)
  }, [])

  const fetchTransactions = useCallback(async (symbol: string) => {
    setSelectedSymbol(symbol)
    setShowTransactions(true)
    setLoadingTransactions(true)
    
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        throw new Error('User not authenticated')
      }

      const { data, error } = await supabase
        .from('trade_logs')
        .select('*')
        .eq('user_id', user.id)
        .eq('symbol', symbol)
        .order('timestamp', { ascending: false })

      if (error) {
        throw error
      }

      setTransactions(data || [])
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[TRADE-LOGS PAGE] Error fetching transactions:', error)
      }
      setTransactions([])
    } finally {
      setLoadingTransactions(false)
    }
  }, [])

  const closeTransactions = useCallback(() => {
    setShowTransactions(false)
    setSelectedSymbol(null)
    setTransactions([])
  }, [])

  const displayedCurrentTrades = useMemo(() => {
    return showAllCurrent ? currentTrades : currentTrades.slice(0, 10)
  }, [currentTrades, showAllCurrent])

  const displayedCompletedTrades = useMemo(() => {
    return showAllCompleted ? completedTrades : completedTrades.slice(0, 10)
  }, [completedTrades, showAllCompleted])

  if (!statistics) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-12 text-gray-400">Loading trade logs...</div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold text-white mb-8">Trade Logs</h1>

      <TradeStatisticsCards statistics={statistics} formatCurrency={formatCurrency} />

      <Tabs defaultValue="current" className="space-y-6">
        <TabsList className="glass-card">
          <TabsTrigger value="current" className="text-white">Current Positions</TabsTrigger>
          <TabsTrigger value="completed" className="text-white">Completed Trades</TabsTrigger>
        </TabsList>

        <TabsContent value="current">
          <CurrentTradesList
            isLoading={isLoading}
            currentTrades={currentTrades}
            showAllCurrent={showAllCurrent}
            setShowAllCurrent={setShowAllCurrent}
            openTradeDetails={openTradeDetails}
            fetchTransactions={fetchTransactions}
            formatCurrency={formatCurrency}
            formatDuration={formatDuration}
          />
        </TabsContent>

        <TabsContent value="completed">
          <CompletedTradesList
            isLoading={isLoading}
            completedTrades={completedTrades}
            showAllCompleted={showAllCompleted}
            setShowAllCompleted={setShowAllCompleted}
            openTradeDetails={openTradeDetails}
            fetchTransactions={fetchTransactions}
            formatCurrency={formatCurrency}
            formatDuration={formatDuration}
          />
        </TabsContent>
      </Tabs>

      {/* Trade Details Modal */}
      {showDetails && selectedTrade && (
        <TradeDetailsModal
          trade={selectedTrade}
          onClose={closeTradeDetails}
          formatCurrency={formatCurrency}
        />
      )}

      {/* Transactions Modal */}
      {showTransactions && selectedSymbol && (
        <TransactionsModal
          symbol={selectedSymbol}
          transactions={transactions}
          loadingTransactions={loadingTransactions}
          onClose={closeTransactions}
          formatCurrency={formatCurrency}
        />
      )}
    </div>
  )
}
