'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useRef, useMemo } from 'react'
import { createClient } from '@/utils/supabase/client'
import { authFetch } from '@/lib/api-client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, TrendingUp, TrendingDown, DollarSign, Activity, Wallet, ArrowUpRight, ArrowDownRight, Info, X, ChevronDown, Settings, Check, Clock } from 'lucide-react'
import TradingBot from '@/components/TradingBot'
import AccountStrategyModal from '@/components/AccountStrategyModal'
import PortfolioChart from '@/components/PortfolioChart'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { getCompanyName } from '@/lib/stock-names'
import type { 
  Trade, 
  AlpacaAccount, 
  CurrentPosition, 
  CompletedTrade, 
  PaperAccount,
  DecisionMetrics 
} from '@/types/trading'

export default function PaperTradingPage() {
  const [trades, setTrades] = useState<Trade[]>([])
  const [account, setAccount] = useState<AlpacaAccount | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [currentPositions, setCurrentPositions] = useState<CurrentPosition[]>([])
  const [completedTrades, setCompletedTrades] = useState<CompletedTrade[]>([])
  const [showAllCompleted, setShowAllCompleted] = useState(false)
  const [positionsLoading, setPositionsLoading] = useState(false)
  const [completedTradesLoading, setCompletedTradesLoading] = useState(false)
  // Track last refresh time
  const [lastRefreshTime, setLastRefreshTime] = useState<Date | null>(null)
  const [selectedPosition, setSelectedPosition] = useState<CurrentPosition | null>(null)
  const [showMetricsModal, setShowMetricsModal] = useState(false)
  const [currentSellMetrics, setCurrentSellMetrics] = useState<any>(null)
  const [loadingCurrentMetrics, setLoadingCurrentMetrics] = useState(false)
  const [sellingPosition, setSellingPosition] = useState<string | null>(null)
  const [showSellConfirm, setShowSellConfirm] = useState(false)
  const [positionToSell, setPositionToSell] = useState<CurrentPosition | null>(null)
  const [selectedCompletedTrade, setSelectedCompletedTrade] = useState<CompletedTrade | null>(null)
  const [showCompletedTradeModal, setShowCompletedTradeModal] = useState(false)
  const [marketStatus, setMarketStatus] = useState<{ is_open: boolean; next_open: string | null } | null>(null)
  const [checkingMarketStatus, setCheckingMarketStatus] = useState(false)
  
  // Queued orders tracking
  interface QueuedOrder {
    orderId: string
    symbol: string
    side: 'buy' | 'sell'
    qty: number
    queuedAt: string
    nextMarketOpen: string | null
  }
  const [queuedOrders, setQueuedOrders] = useState<Map<string, QueuedOrder>>(new Map())
  const [showQueuedOrderModal, setShowQueuedOrderModal] = useState(false)
  const [selectedQueuedOrder, setSelectedQueuedOrder] = useState<QueuedOrder | null>(null)
  const [cancellingOrder, setCancellingOrder] = useState(false)
  
  // Paper account selection
  const [paperAccounts, setPaperAccounts] = useState<PaperAccount[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [accountsLoading, setAccountsLoading] = useState(true)
  const [accountDropdownOpen, setAccountDropdownOpen] = useState(false)
  const accountDropdownRef = useRef<HTMLDivElement | null>(null)
  
  // Strategy modal state
  const [showStrategyModal, setShowStrategyModal] = useState(false)
  const [strategyModalAccountId, setStrategyModalAccountId] = useState<string | null>(null)
  const [strategyModalAccountName, setStrategyModalAccountName] = useState<string>('')

  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null)

  // Load paper accounts on mount
  useEffect(() => {
    supabaseRef.current = createClient()
    loadPaperAccounts()
  }, [])

  // Load data when account is selected
  useEffect(() => {
    if (selectedAccountId) {
      // Clear old data when switching accounts
      setAccount(null)
      setCurrentPositions([])
      setCompletedTrades([])
      
      // Load new data
      loadData()
      
      // Set up realtime subscriptions for trades
      let tradesChannel: any = null
      if (supabaseRef.current) {
        tradesChannel = supabaseRef.current
          .channel(`paper-trades-${selectedAccountId}`)
          .on('postgres_changes', 
            { event: 'INSERT', schema: 'public', table: 'trades', filter: 'account_type=eq.paper' },
            () => loadData()
          )
          .subscribe()
      }

      // Refresh account data every 30 seconds
      const accountInterval = setInterval(() => {
        loadAccountData()
      }, 30000)

      // Refresh positions every 30 seconds
      const positionsInterval = setInterval(() => {
        loadCurrentPositions()
        loadCompletedTrades()
        loadOpenOrders()
      }, 30000)

      return () => {
        tradesChannel?.unsubscribe()
        clearInterval(accountInterval)
        clearInterval(positionsInterval)
      }
    }
  }, [selectedAccountId])

  useEffect(() => {
    if (!accountDropdownOpen) return
    
    const handleClickOutside = (event: MouseEvent) => {
      if (accountDropdownRef.current && !accountDropdownRef.current.contains(event.target as Node)) {
        setAccountDropdownOpen(false)
      }
    }
    
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setAccountDropdownOpen(false)
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [accountDropdownOpen])

  const loadPaperAccounts = async () => {
    try {
      setAccountsLoading(true)
      const response = await authFetch('/api/paper-accounts')
      const result = await response.json()
      
      if (result.success) {
        setPaperAccounts(result.data || [])
        
        // Auto-select first account if available
        if (result.data && result.data.length > 0) {
          setSelectedAccountId(result.data[0].id)
        } else {
          setMessage({ type: 'error', text: 'No paper trading accounts found. Please add one in Settings.' })
          setLoading(false) // Stop loading if no accounts
        }
      } else {
        setMessage({ type: 'error', text: 'Failed to load paper trading accounts' })
        setLoading(false) // Stop loading on error
      }
    } catch (error) {
      console.error('Error loading paper accounts:', error)
      setMessage({ type: 'error', text: 'Failed to load paper trading accounts' })
      setLoading(false) // Stop loading on error
    } finally {
      setAccountsLoading(false)
    }
  }

  const loadData = async () => {
    if (!selectedAccountId) return
    
    try {
      setLoading(true)
      await Promise.all([loadAccountData(), loadTradesData(), loadCurrentPositions(), loadCompletedTrades(), loadOpenOrders()])
    } catch (error) {
      console.error('Error loading data:', error)
      setMessage({ type: 'error', text: 'Failed to load data' })
    } finally {
      setLoading(false)
    }
  }

  const loadCurrentPositions = async () => {
    if (!selectedAccountId) return
    
    try {
      // Only show loading on initial load, not on refresh
      const isInitialLoad = currentPositions.length === 0
      if (isInitialLoad) {
        setPositionsLoading(true)
      }
      
      const sb = supabaseRef.current
      if (!sb) return
      
      console.log('[PAPER TRADING] Loading positions for account_id:', selectedAccountId)
      const { data: { session } } = await sb.auth.getSession()
      const response = await fetch(`/api/trade-logs?view=current&account_id=${selectedAccountId}&account_type=paper`, {
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
      })
      
      const data = await response.json()
      
      console.log('[PAPER TRADING] Positions API response:', {
        success: data.success,
        count: data.data?.currentTrades?.length || 0,
        accountId: selectedAccountId
      })
      
      if (data.success) {
        // Server now handles all timestamp management correctly
        // No need for client-side workarounds
        setCurrentPositions(data.data.currentTrades || [])
        setLastRefreshTime(new Date())
      }
    } catch (error) {
      console.error('Error loading current positions:', error)
    } finally {
      setPositionsLoading(false)
    }
  }

  const loadCompletedTrades = async () => {
    if (!selectedAccountId) return
    
    try {
      // Only show loading on initial load, not on refresh
      const isInitialLoad = completedTrades.length === 0
      if (isInitialLoad) {
        setCompletedTradesLoading(true)
      }
      
      const sb = supabaseRef.current
      if (!sb) return
      
      console.log('[PAPER TRADING] Loading completed trades for account_id:', selectedAccountId)
      const { data: { session } } = await sb.auth.getSession()
      const response = await fetch(`/api/trade-logs?view=completed&account_id=${selectedAccountId}&account_type=paper`, {
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
      })
      
      const data = await response.json()
      
      console.log('[PAPER TRADING] Completed trades response:', {
        success: data.success,
        count: data.data?.completedTrades?.length || 0,
        accountId: selectedAccountId
      })
      
      if (data.success) {
        // Server now handles all timestamp management correctly
        // No need for client-side workarounds
        setCompletedTrades(data.data.completedTrades || [])
        if (isInitialLoad) {
          setLastRefreshTime(new Date())
        }
      }
    } catch (error) {
      console.error('Error loading completed trades:', error)
    } finally {
      setCompletedTradesLoading(false)
    }
  }


  const loadAccountData = async () => {
    if (!selectedAccountId) return
    
    try {
      console.log('[PAPER TRADING] Loading account data for account_id:', selectedAccountId)
      const response = await authFetch(`/api/account?account_id=${selectedAccountId}`)
      const result = await response.json()
      
      console.log('[PAPER TRADING] Account API response:', result)
      
      if (result.success && result.data) {
        console.log('Account data:', result.data)
        setAccount(result.data)
        // Clear any previous error messages if we got data (even if zeros)
        setMessage(null)
      } else {
        console.error('Failed to load account data:', result.error)
        // Set account to zeros if API returns error for authenticated user
        setAccount({
          id: 'N/A',
          account_number: 'N/A',
          status: 'INACTIVE',
          currency: 'USD',
          buying_power: '0.00',
          cash: '0.00',
          portfolio_value: '0.00',
          equity: '0.00',
          last_equity: '0.00',
          long_market_value: '0.00',
          short_market_value: '0.00',
          initial_margin: '0.00',
          maintenance_margin: '0.00',
          daytrade_count: 0,
          daytrading_buying_power: '0.00',
          pattern_day_trader: false
        })
        // Only show error if it's not about missing keys (which is expected)
        if (result.error && !result.error.includes('API keys not configured')) {
          setMessage({ type: 'error', text: `Account error: ${result.error}` })
        }
      }
    } catch (error) {
      console.error('Error loading account data:', error)
      // Set account to zeros on error
      setAccount({
        id: 'N/A',
        account_number: 'N/A',
        status: 'INACTIVE',
        currency: 'USD',
        buying_power: '0.00',
        cash: '0.00',
        portfolio_value: '0.00',
        equity: '0.00',
        last_equity: '0.00',
        long_market_value: '0.00',
        short_market_value: '0.00',
        initial_margin: '0.00',
        maintenance_margin: '0.00',
        daytrade_count: 0,
        daytrading_buying_power: '0.00',
        pattern_day_trader: false
      })
    }
  }

  const loadTradesData = async () => {
    try {
      const sb = supabaseRef.current
      if (!sb) return

      const { data: tradesData, error: tradesError } = await sb
        .from('trades')
        .select('*')
        .eq('account_type', 'paper')
        .order('created_at', { ascending: false })
        .limit(20)

      if (tradesError) throw tradesError
      setTrades(tradesData || [])
    } catch (error) {
      console.error('Error loading trades data:', error)
    }
  }

  const formatCurrency = (amount: number | string) => {
    const value = typeof amount === 'string' ? parseFloat(amount) : amount
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value)
  }

  const parseAmount = (value: number | string | null | undefined) => {
    const parsed = typeof value === 'number' ? value : parseFloat(value || '0')
    return Number.isFinite(parsed) ? parsed : 0
  }

  const checkMarketStatus = async () => {
    setCheckingMarketStatus(true)
    try {
      const response = await fetch(`/api/market/status?account_id=${selectedAccountId}`)
      const data = await response.json()
      if (data.success) {
        setMarketStatus(data.data)
      }
    } catch (error) {
      console.error('Error checking market status:', error)
      setMarketStatus({ is_open: false, next_open: null })
    } finally {
      setCheckingMarketStatus(false)
    }
  }

  // Load open orders from Alpaca to restore queued state after refresh
  const loadOpenOrders = async () => {
    try {
      const response = await fetch(`/api/orders/open?account_type=paper&account_id=${selectedAccountId}`)
      const data = await response.json()
      
      if (data.success && data.orders.length > 0) {
        const newQueuedOrders = new Map<string, QueuedOrder>()
        
        for (const order of data.orders) {
          // Only track sell orders (closing positions)
          if (order.side === 'sell' || order.side === 'buy') {
            newQueuedOrders.set(order.symbol, {
              orderId: order.id,
              symbol: order.symbol,
              side: order.side,
              qty: order.qty,
              queuedAt: order.submitted_at || order.created_at,
              nextMarketOpen: order.next_market_open
            })
          }
        }
        
        if (newQueuedOrders.size > 0) {
          setQueuedOrders(newQueuedOrders)
        }
      }
    } catch (error) {
      console.error('Error loading open orders:', error)
    }
  }

  const handleCancelQueuedOrder = async (queuedOrder: QueuedOrder) => {
    setCancellingOrder(true)
    try {
      const sb = supabaseRef.current
      const session = sb ? (await sb.auth.getSession()).data.session : null
      
      const response = await fetch('/api/trade/cancel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {})
        },
        body: JSON.stringify({
          order_id: queuedOrder.orderId,
          account_type: 'paper',
          account_id: selectedAccountId
        })
      })
      
      const data = await response.json()
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to cancel order')
      }
      
      // Remove from queued orders
      setQueuedOrders(prev => {
        const newMap = new Map(prev)
        newMap.delete(queuedOrder.symbol)
        return newMap
      })
      
      setShowQueuedOrderModal(false)
      setSelectedQueuedOrder(null)
      setMessage({ type: 'success', text: `Cancelled queued ${queuedOrder.side === 'buy' ? 'buy back' : 'sell'} order for ${queuedOrder.symbol}` })
      
    } catch (error: any) {
      console.error('Error cancelling order:', error)
      setMessage({ type: 'error', text: error.message || 'Failed to cancel order' })
    } finally {
      setCancellingOrder(false)
    }
  }

  const formatNextMarketOpen = (nextOpen: string | null): string => {
    if (!nextOpen) return 'next market open'
    
    const date = new Date(nextOpen)
    const now = new Date()
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    const dayName = dayNames[date.getDay()]
    
    // Check if it's tomorrow
    const tomorrow = new Date(now)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const isTomorrow = date.toDateString() === tomorrow.toDateString()
    
    // Format time
    const timeStr = date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      timeZoneName: 'short'
    })
    
    if (isTomorrow) {
      return `tomorrow (${dayName}) at ${timeStr}`
    }
    
    return `${dayName} at ${timeStr}`
  }

  const fetchCurrentSellMetrics = async (symbol: string, currentPrice: number) => {
    setLoadingCurrentMetrics(true)
    setCurrentSellMetrics(null)
    try {
      // First get technical indicators
      const indicatorsResponse = await fetch('/api/stocks/indicators', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols: [symbol] })
      })
      
      if (!indicatorsResponse.ok) {
        throw new Error('Failed to fetch indicators')
      }
      
      const indicatorsData = await indicatorsResponse.json()
      if (!indicatorsData.success || !indicatorsData.indicators || indicatorsData.indicators.length === 0) {
        throw new Error('No indicators available')
      }
      
      const indicator = indicatorsData.indicators[0]
      
      // Prepare features for ML service
      const features = [{
        symbol: indicator.symbol,
        rsi: indicator.rsi,
        macd: indicator.macd,
        macd_histogram: indicator.macd_histogram,
        bb_width: indicator.bb_width,
        bb_position: indicator.bb_position,
        ema_trend: indicator.ema_trend,
        volume_ratio: indicator.volume_ratio,
        stochastic: indicator.stochastic,
        price_change_1d: indicator.price_change_1d,
        price_change_5d: indicator.price_change_5d,
        price_change_10d: indicator.price_change_10d,
        volatility_20: indicator.volatility_20,
        news_sentiment: indicator.news_sentiment || 0,
        price: currentPrice
      }]
      
      // Call ML service
      const mlResponse = await fetch('/api/ml/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          features,
          include_probabilities: true
        })
      })
      
      if (!mlResponse.ok) {
        throw new Error('Failed to get ML predictions')
      }
      
      const mlData = await mlResponse.json()
      if (!mlData.success || !mlData.signals || mlData.signals.length === 0) {
        throw new Error('No ML signals available')
      }
      
      // Find sell signal for this symbol
      const sellSignal = mlData.signals.find((s: any) => s.symbol === symbol && s.action === 'sell')
      
      if (sellSignal) {
        // Format as sell decision metrics
        setCurrentSellMetrics({
          confidence: sellSignal.confidence || 0,
          adjusted_confidence: sellSignal.adjusted_confidence || sellSignal.confidence || 0,
          reasoning: sellSignal.reasoning || 'No reasoning provided',
          indicators: indicator,
          probabilities: sellSignal.probabilities || {},
          news_sentiment: indicator.news_sentiment || 0,
          market_risk: indicator.market_risk || 0
        })
      } else {
        // If no sell signal, use the actual ML prediction (hold signal)
        // The ML service returns hold with real confidence, not a hardcoded default
        const holdSignal = mlData.signals[0]
        setCurrentSellMetrics({
          confidence: holdSignal.confidence,
          adjusted_confidence: holdSignal.confidence,
          reasoning: holdSignal.reasoning || 'Model suggests holding position',
          indicators: indicator,
          probabilities: {},
          news_sentiment: indicator.news_sentiment || 0,
          market_risk: indicator.market_risk || 0
        })
      }
    } catch (error) {
      console.error('Error fetching current sell metrics:', error)
      setCurrentSellMetrics(null)
    } finally {
      setLoadingCurrentMetrics(false)
    }
  }

  const handleSellPosition = async (position: CurrentPosition, forceQueue: boolean = false) => {
    setSellingPosition(position.symbol)
    try {
      // Determine if this is a short position (negative qty)
      const isShort = position.qty < 0
      const absQty = Math.abs(position.qty)
      
      const sb = supabaseRef.current
      const session = sb ? (await sb.auth.getSession()).data.session : null
      
      // Use unified trade execution endpoint - handles both Alpaca order and trade log atomically
      const requestBody = {
        action: 'close',
        symbol: position.symbol,
        qty: absQty,
        type: 'market',
        time_in_force: 'day',
        strategy: position.strategy,
        account_type: position.account_type,
        account_id: selectedAccountId,
        trade_pair_id: position.trade_pair_id,
        decision_metrics: currentSellMetrics || {},
        force_queue: forceQueue
      }
      
      const response = await fetch('/api/trade/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {})
        },
        body: JSON.stringify(requestBody)
      })
      
      const data = await response.json()
      
      if (!data.success) {
        // Check if it's a market closed error
        if (data.error === 'MARKET_CLOSED') {
          setMessage({ type: 'error', text: data.message || 'Market is closed. Choose "Queue Order" to execute when market opens.' })
          return
        }
        throw new Error(data.error || 'Failed to close position')
      }
      
      // Handle queued orders
      if (data.queued) {
        const queuedOrder: QueuedOrder = {
          orderId: data.trade.id,
          symbol: position.symbol,
          side: isShort ? 'buy' : 'sell',
          qty: absQty,
          queuedAt: new Date().toISOString(),
          nextMarketOpen: marketStatus?.next_open || null
        }
        setQueuedOrders(prev => new Map(prev).set(position.symbol, queuedOrder))
        const actionText = isShort ? 'buy back' : 'sell'
        setMessage({ type: 'success', text: `Order queued! Your ${actionText} order for ${absQty} shares of ${position.symbol} will execute when the market opens.` })
      } else {
        const actionText = isShort ? 'bought back' : 'sold'
        setMessage({ type: 'success', text: `Successfully ${actionText} ${absQty} shares of ${position.symbol}` })
      }
      
      setShowSellConfirm(false)
      setPositionToSell(null)
      setMarketStatus(null)
      
      // Refresh positions
      await loadCurrentPositions()
      await loadAccountData()
    } catch (error: any) {
      console.error('Error closing position:', error)
      setMessage({ type: 'error', text: error.message || 'Failed to close position' })
    } finally {
      setSellingPosition(null)
    }
  }

  const formatDuration = (duration: string) => {
    // Parse PostgreSQL interval format (can be HH:MM:SS or days HH:MM:SS format)
    // First try to match days if present (PostgreSQL interval format like "3 days 01:30:00")
    const daysMatch = duration.match(/(\d+)\s+days?/i)
    const days = daysMatch ? parseInt(daysMatch[1]) : 0
    
    // Then match the time portion (HH:MM:SS)
    const timeMatch = duration.match(/(\d+):(\d+):(\d+)/)
    if (!timeMatch) return duration
    
    const hours = parseInt(timeMatch[1])
    const minutes = parseInt(timeMatch[2])
    
    // Calculate total hours including days
    const totalHours = days * 24 + hours
    
    if (totalHours >= 24) {
      const totalDays = Math.floor(totalHours / 24)
      const remainingHours = totalHours % 24
      if (remainingHours > 0) {
        return `${totalDays}d ${remainingHours}h`
      } else {
        return `${totalDays}d`
      }
    } else if (totalHours > 0) {
      return `${totalHours}h ${minutes}m`
    } else {
      return `${minutes}m`
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString()
  }

  const calculateProfitLoss = () => {
    if (!account) return { amount: 0, percentage: 0 }
    
    const currentValue = parseFloat(account.equity || '0')

    // Use last_equity (previous day's close) as the baseline
    const lastEquity = parseFloat(account.last_equity || account.equity || '0')
    const amount = currentValue - lastEquity
    const percentage = lastEquity > 0 ? (amount / lastEquity) * 100 : 0
    
    return { amount, percentage }
  }

  const profitLoss = calculateProfitLoss()

  const getAccountValue = (field: keyof AlpacaAccount, defaultValue: string = '0') => {
    if (!account) return defaultValue
    return account[field] || defaultValue
  }

  const positionsMarketValue = currentPositions.reduce((sum, position) => {
    return sum + Math.abs(parseAmount(position.current_value))
  }, 0)

  const accountGrossMarketValue = account
    ? Math.abs(parseAmount(account.long_market_value)) + Math.abs(parseAmount(account.short_market_value))
    : 0

  const totalPositionValue = positionsMarketValue > 0 ? positionsMarketValue : accountGrossMarketValue

  const { winRate, closedTradesCount } = useMemo(() => {
    const closedTradesCount = completedTrades.length
    const winningTrades = completedTrades.filter((trade) => trade.profit_loss > 0).length
    const winRate = closedTradesCount > 0 ? (winningTrades / closedTradesCount) * 100 : 0

    return { winRate, closedTradesCount }
  }, [completedTrades])

  // Memoize sorted positions and completed trades to prevent unnecessary re-renders
  const sortedCurrentPositions = useMemo(() => {
    return [...currentPositions].sort((a, b) => {
      const timeDiff = new Date(b.buy_timestamp).getTime() - new Date(a.buy_timestamp).getTime()
      if (timeDiff !== 0) return timeDiff
      return Number(b.id) - Number(a.id)
    })
  }, [currentPositions])

  const sortedCompletedTrades = useMemo(() => {
    return [...completedTrades].sort((a, b) => {
      const timeDiff = new Date(b.sell_timestamp).getTime() - new Date(a.sell_timestamp).getTime()
      if (timeDiff !== 0) return timeDiff
      return Number(b.id) - Number(a.id)
    })
  }, [completedTrades])

  const selectedAccount = useMemo(() => {
    if (!selectedAccountId) return null
    return paperAccounts.find((acc) => acc.id === selectedAccountId) || null
  }, [paperAccounts, selectedAccountId])

  if (loading) {
    return (
      <div className="min-h-screen text-white p-8">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span className="ml-2">Loading paper trading data...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen text-white p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold mb-2">Paper Trading Dashboard</h1>
            <p className="text-white/80">Practice trading with virtual money</p>
          </div>
          
          {/* Account Selector */}
          {paperAccounts.length > 0 && (
            <div className="ml-4" ref={accountDropdownRef}>
              <div className="relative w-[280px]">
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 rounded-md border border-white/20 bg-black/30 px-3 py-2 text-sm text-white/90 shadow-sm transition hover:bg-black/40"
                  onClick={() => setAccountDropdownOpen((prev) => !prev)}
                  aria-haspopup="listbox"
                  aria-expanded={accountDropdownOpen}
                >
                  <span className="truncate">
                    {selectedAccount
                      ? `${selectedAccount.account_name}${selectedAccount.alpaca_account_number ? ` (${selectedAccount.alpaca_account_number})` : ''}`
                      : 'Select account'}
                  </span>
                  <ChevronDown className={`h-4 w-4 transition-transform ${accountDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
                
                {accountDropdownOpen && (
                  <div className="absolute left-0 right-0 z-50 mt-2 max-h-64 overflow-y-auto rounded-md border border-white/20 bg-black/80 text-white shadow-lg backdrop-blur-sm">
                    {paperAccounts.map((acc) => {
                      const isSelected = acc.id === selectedAccountId
                      return (
                        <button
                          type="button"
                          key={acc.id}
                          className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition ${
                            isSelected ? 'bg-blue-500/20 text-white' : 'text-white/80 hover:bg-white/10'
                          }`}
                          onClick={() => {
                            console.log('[PAPER TRADING] Switching account to:', acc.id)
                            setSelectedAccountId(acc.id)
                            setAccountDropdownOpen(false)
                          }}
                          role="option"
                          aria-selected={isSelected}
                        >
                          <span className="truncate">
                            {acc.account_name} {acc.alpaca_account_number && `(${acc.alpaca_account_number})`}
                          </span>
                          {isSelected && <Check className="h-4 w-4 text-blue-300" />}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
              {loading && (
                <div className="text-xs text-blue-400 mt-1 flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Loading account data...
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right bg-black/30 backdrop-blur-sm px-4 py-2 rounded-lg border border-white/20">
            <p className="text-sm text-white/80 font-medium">Portfolio Value</p>
            <p className="text-2xl font-bold text-white drop-shadow-lg">
              {account ? formatCurrency(account.equity) : '$0.00'}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Badge className={profitLoss.amount >= 0 ? "bg-green-600 hover:bg-green-700 text-white" : "bg-red-600 hover:bg-red-700 text-white"}>
              {profitLoss.amount >= 0 ? <ArrowUpRight className="h-3 w-3 mr-1 text-white" /> : <ArrowDownRight className="h-3 w-3 mr-1 text-white" />}
              <span className="mr-1 text-white font-semibold">{formatCurrency(profitLoss.amount)}</span>
              <span className="text-white font-semibold">({profitLoss.percentage >= 0 ? '+' : ''}{profitLoss.percentage.toFixed(2)}%)</span>
            </Badge>
          </div>
        </div>
      </div>

      {/* No Accounts Warning */}
      {!selectedAccountId && paperAccounts.length === 0 && !accountsLoading && (
        <Alert className="mb-6 border-yellow-500 bg-yellow-950">
          <AlertDescription className="text-yellow-200">
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4" />
              <div>
                <strong>No Paper Trading Accounts Found</strong>
                <p className="mt-1">Please add a paper trading account in Settings to start trading.</p>
                <Button 
                  onClick={() => window.location.href = '/settings'} 
                  className="mt-2 bg-yellow-600 hover:bg-yellow-700"
                  size="sm"
                >
                  Go to Settings
                </Button>
              </div>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {message && (
        <Alert className={`mb-6 ${message.type === 'error' ? 'border-red-500 bg-red-950' : 'border-blue-500 bg-blue-950'}`}>
          <AlertDescription className={message.type === 'error' ? 'text-red-200' : 'text-blue-200'}>
            {message.text}
          </AlertDescription>
        </Alert>
      )}

      {!account && !loading && (
        <Alert className="mb-6 border-yellow-500 bg-yellow-950">
          <AlertDescription className="text-yellow-200">
            <strong>Note:</strong> Unable to load account data. Please ensure your Alpaca API keys are configured in Settings.
          </AlertDescription>
        </Alert>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">
        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">Equity</CardTitle>
            <DollarSign className="h-5 w-5 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white">
              {account ? formatCurrency(account.equity) : '$0.00'}
            </div>
            <p className={`text-xs flex items-center gap-1 mt-1 font-semibold ${profitLoss.amount >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {profitLoss.amount >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {formatCurrency(profitLoss.amount)} ({profitLoss.percentage >= 0 ? '+' : ''}{profitLoss.percentage.toFixed(2)}%)
            </p>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">Cash Balance</CardTitle>
            <Wallet className="h-5 w-5 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white">
              {account ? formatCurrency(account.cash) : '$0.00'}
            </div>
            <p className="text-xs text-gray-400 mt-1">Available cash</p>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">Buying Power</CardTitle>
            <TrendingUp className="h-5 w-5 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white">
              {account ? formatCurrency(account.buying_power) : '$0.00'}
            </div>
            <p className="text-xs text-gray-400 mt-1">Day trades: {account?.daytrade_count || 0}</p>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">Position Value</CardTitle>
            <Activity className="h-5 w-5 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white">
              {formatCurrency(totalPositionValue)}
            </div>
            <p className="text-xs text-gray-400 mt-1">Long + short positions</p>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">Win Rate</CardTitle>
            <TrendingUp className="h-5 w-5 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white">
              {winRate.toFixed(1)}%
            </div>
            <p className="text-xs text-gray-400 mt-1">
              {closedTradesCount > 0 ? `${closedTradesCount} closed trades` : 'No trades yet'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Trading Bot & Portfolio Chart */}
      {selectedAccountId && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Trading Bot */}
          <div className="lg:col-span-1 flex flex-col">
            <TradingBot 
              mode="paper" 
              accountId={selectedAccountId}
              accountName={paperAccounts.find(a => a.id === selectedAccountId)?.account_name || 'Paper Account'}
              onConfigureStrategy={() => {
                setStrategyModalAccountId(selectedAccountId)
                setStrategyModalAccountName(
                  paperAccounts.find(a => a.id === selectedAccountId)?.account_name || 'Account'
                )
                setShowStrategyModal(true)
              }}
            />
          </div>
          
        {/* Portfolio Chart */}
        <div className="lg:col-span-2">
          <PortfolioChart accountId={selectedAccountId} />
        </div>
        </div>
      )}

      {/* Current Positions & Completed Trades Tabs */}
      <div className="mb-8">
        <Card className="glass-card">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-white">Trading Activity</CardTitle>
                <CardDescription className="text-gray-400">
                  View current positions and completed trades for this account
                </CardDescription>
              </div>
              {lastRefreshTime && (
                <div className="text-right">
                  <div className="text-xs text-gray-500">Last refreshed</div>
                  <div className="text-xs text-gray-400 font-mono">
                    {lastRefreshTime.toLocaleTimeString('en-US', {
                      hour: 'numeric',
                      minute: '2-digit',
                      second: '2-digit',
                      hour12: true
                    })}
                  </div>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="current" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="current">Current Positions</TabsTrigger>
                <TabsTrigger value="completed">Completed Trades</TabsTrigger>
              </TabsList>
              
              {/* Current Positions Tab */}
              <TabsContent value="current">
                {positionsLoading && currentPositions.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                    Loading positions...
                  </div>
                ) : currentPositions.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <Activity className="h-12 w-12 mx-auto mb-2 opacity-20" />
                    <p>No current positions</p>
                    <p className="text-sm mt-1">Start the trading bot to see positions here</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {sortedCurrentPositions.map((position) => (
                      <div
                        key={`position-${position.id}-${position.trade_pair_id || position.symbol}`}
                        className="p-4 bg-[#252838] rounded-lg border border-gray-700 hover:border-blue-500 transition-all"
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div>
                              <div className="text-2xl font-bold text-white">{position.symbol}</div>
                              {getCompanyName(position.symbol) && (
                                <div className="text-sm text-gray-400">{getCompanyName(position.symbol)}</div>
                              )}
                            </div>
                            <Badge className={position.qty < 0 ? "bg-red-500" : "bg-blue-400"}>
                              {position.qty < 0 ? "SHORT" : "LONG"}
                            </Badge>
                            <Badge variant="outline" className="border-gray-600 text-gray-400">
                              {Math.abs(position.qty)} shares
                            </Badge>
                            {queuedOrders.has(position.symbol) && (
                              <Badge 
                                className="bg-yellow-600 text-white animate-pulse cursor-pointer hover:bg-yellow-500"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  const order = queuedOrders.get(position.symbol)
                                  if (order) {
                                    setSelectedQueuedOrder(order)
                                    setShowQueuedOrderModal(true)
                                  }
                                }}
                              >
                                {position.qty < 0 ? "QUEUED BUY BACK" : "QUEUED SELL"} ⓘ
                              </Badge>
                            )}
                          </div>
                          <div className="text-right">
                            <div className={`text-xl font-bold ${position.unrealized_pl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                              {formatCurrency(position.unrealized_pl)}
                            </div>
                            <div className={`text-sm ${position.unrealized_pl_percent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {position.unrealized_pl_percent >= 0 ? '+' : ''}{position.unrealized_pl_percent.toFixed(2)}%
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div>
                            <div className="text-gray-500 mb-1">Entry Price</div>
                            <div className="font-semibold text-white">{formatCurrency(position.buy_price)}</div>
                          </div>
                          <div>
                            <div className="text-gray-500 mb-1">Current Price</div>
                            <div className="font-semibold text-white">{formatCurrency(position.current_price)}</div>
                          </div>
                          <div>
                            <div className="text-gray-500 mb-1">Position Value</div>
                            <div className="font-semibold text-white">
                              {formatCurrency(position.current_value)}
                            </div>
                          </div>
                          <div>
                            <div className="text-gray-500 mb-1 flex items-center gap-1">
                              <Activity className="h-3 w-3" />
                              Holding Time
                            </div>
                            <div className="font-semibold text-white">{formatDuration(position.holding_duration)}</div>
                          </div>
                        </div>

                        <div className="mt-3 pt-3 border-t border-gray-700">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4 text-xs text-gray-400">
                              <div>
                                {position.qty < 0 ? "Short sold" : "Bought"}: {new Date(position.buy_timestamp).toLocaleString()}
                              </div>
                              <div className="text-blue-400">
                                Strategy: {position.strategy}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {position.buy_decision_metrics && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedPosition(position)
                                    setShowMetricsModal(true)
                                    fetchCurrentSellMetrics(position.symbol, position.current_price)
                                  }}
                                  className="border-blue-500 text-blue-400 hover:bg-blue-500/10"
                                >
                                  <Info className="h-4 w-4 mr-1" />
                                  View Metrics
                                </Button>
                              )}
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setPositionToSell(position)
                                  setShowSellConfirm(true)
                                  checkMarketStatus()
                                }}
                                disabled={sellingPosition === position.symbol}
                                className="border-red-500 text-red-400 hover:bg-red-500/10"
                              >
                                {sellingPosition === position.symbol ? (
                                  <>
                                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                    {position.qty < 0 ? 'Buying back...' : 'Selling...'}
                                  </>
                                ) : (
                                  <>
                                    <TrendingDown className="h-4 w-4 mr-1" />
                                    {position.qty < 0 ? 'Buy Back' : 'Sell'}
                                  </>
                                )}
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
              
              {/* Completed Trades Tab */}
              <TabsContent value="completed">
                {completedTradesLoading && completedTrades.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                    Loading completed trades...
                  </div>
                ) : completedTrades.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <Activity className="h-12 w-12 mx-auto mb-2 opacity-20" />
                    <p>No completed trades yet</p>
                    <p className="text-sm mt-1">Completed trades will appear here after closing positions</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {(showAllCompleted ? sortedCompletedTrades : sortedCompletedTrades.slice(0, 10)).map((trade) => (
                      <div
                        key={`trade-${trade.id}-${trade.trade_pair_id || trade.symbol}`}
                        onClick={() => {
                          setSelectedCompletedTrade(trade)
                          setShowCompletedTradeModal(true)
                        }}
                        className="p-4 bg-[#252838] rounded-lg border border-gray-700 hover:border-blue-400 transition-all cursor-pointer"
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div>
                              <div className="text-2xl font-bold text-white">{trade.symbol}</div>
                              {getCompanyName(trade.symbol) && (
                                <div className="text-sm text-gray-400">{getCompanyName(trade.symbol)}</div>
                              )}
                            </div>
                            <Badge variant="outline" className="border-gray-600 text-gray-400">
                              {trade.qty} shares
                            </Badge>
                            <Badge className={trade.profit_loss >= 0 ? 'bg-green-600' : 'bg-red-600'}>
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
                            <div className="font-semibold text-white">
                              {trade.sell_price && trade.sell_price > 0 
                                ? formatCurrency(trade.sell_price) 
                                : <span className="text-yellow-500">Pending</span>
                              }
                            </div>
                          </div>
                          <div>
                            <div className="text-gray-500 mb-1">Return</div>
                            <div className={`font-semibold ${trade.profit_loss >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {trade.profit_loss_percent >= 0 ? '+' : ''}{trade.profit_loss_percent.toFixed(2)}%
                            </div>
                          </div>
                          <div>
                            <div className="text-gray-500 mb-1 flex items-center gap-1">
                              <Activity className="h-3 w-3" />
                              Duration
                            </div>
                            <div className="font-semibold text-white">{formatDuration(trade.holding_duration)}</div>
                          </div>
                        </div>

                        <div className="mt-3 pt-3 border-t border-gray-700">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4 text-xs text-gray-400">
                              <div>
                                {new Date(trade.buy_timestamp).toLocaleDateString()} → {
                                  trade.sell_timestamp && new Date(trade.sell_timestamp).getTime() > new Date('1971-01-01').getTime()
                                    ? new Date(trade.sell_timestamp).toLocaleDateString()
                                    : <span className="text-yellow-500">Pending</span>
                                }
                              </div>
                            </div>
                            <div className="text-blue-400 hover:text-blue-300 text-xs">
                              Click for metrics →
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}

                    {/* See More Button */}
                    {sortedCompletedTrades.length > 10 && (
                      <div className="pt-4 border-t border-gray-700">
                        <Button
                          variant="outline"
                          onClick={() => setShowAllCompleted(!showAllCompleted)}
                          className="w-full border-blue-500 text-blue-400 hover:bg-blue-500/10"
                        >
                          {showAllCompleted ? 'Show Less' : `See More (${sortedCompletedTrades.length - 10} more)`}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      {/* Buy Decision Metrics Modal */}
      {showMetricsModal && selectedPosition && selectedPosition.buy_decision_metrics && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowMetricsModal(false)}>
          <div className="bg-[#1a1d2e] rounded-lg border border-gray-700 max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-white">Position Metrics: {selectedPosition.symbol}</h2>
                  {getCompanyName(selectedPosition.symbol) && (
                    <div className="text-sm text-gray-400 mt-1">{getCompanyName(selectedPosition.symbol)}</div>
                  )}
                </div>
                <button
                  onClick={() => {
                    setShowMetricsModal(false)
                    setCurrentSellMetrics(null)
                  }}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <X className="w-6 h-6" />
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
                        {((selectedPosition.buy_decision_metrics?.confidence || 0) * 100).toFixed(1)}%
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-500 text-sm mb-1">Adjusted Confidence</div>
                      <div className="text-2xl font-bold text-purple-400">
                        {((selectedPosition.buy_decision_metrics?.adjusted_confidence || 0) * 100).toFixed(1)}%
                      </div>
                    </div>
                  </div>
                  
                  <div className="mb-4">
                    <div className="text-gray-500 text-sm mb-1">Reasoning</div>
                    <div className="text-white bg-[#1a1d2e] p-3 rounded border border-gray-700">
                      {selectedPosition.buy_decision_metrics?.reasoning || 'No reasoning provided'}
                    </div>
                  </div>

                  {/* Technical Indicators */}
                  {selectedPosition.buy_decision_metrics?.indicators && Object.keys(selectedPosition.buy_decision_metrics.indicators).length > 0 && (
                    <div className="mb-4">
                      <div className="text-gray-500 text-sm mb-2">Technical Indicators</div>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                        {selectedPosition.buy_decision_metrics.indicators.rsi !== undefined && (
                          <div className="bg-[#1a1d2e] p-2 rounded border border-gray-700">
                            <div className="text-gray-400 text-xs mb-1">RSI</div>
                            <div className={`font-bold ${
                              selectedPosition.buy_decision_metrics.indicators.rsi > 70 
                                ? 'text-red-400' 
                                : selectedPosition.buy_decision_metrics.indicators.rsi < 30 
                                  ? 'text-green-400' 
                                  : 'text-white'
                            }`}>
                              {selectedPosition.buy_decision_metrics.indicators.rsi.toFixed(2)}
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              {selectedPosition.buy_decision_metrics.indicators.rsi > 70 ? 'Overbought' : 
                               selectedPosition.buy_decision_metrics.indicators.rsi < 30 ? 'Oversold' : 'Neutral'}
                            </div>
                          </div>
                        )}
                        {selectedPosition.buy_decision_metrics.indicators.macd !== undefined && (
                          <div className="bg-[#1a1d2e] p-2 rounded border border-gray-700">
                            <div className="text-gray-400 text-xs mb-1">MACD</div>
                            <div className={`font-bold ${
                              selectedPosition.buy_decision_metrics.indicators.macd > 0 
                                ? 'text-green-400' 
                                : 'text-red-400'
                            }`}>
                              {selectedPosition.buy_decision_metrics.indicators.macd.toFixed(4)}
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              {selectedPosition.buy_decision_metrics.indicators.macd > 0 ? 'Bullish' : 'Bearish'}
                            </div>
                          </div>
                        )}
                        {selectedPosition.buy_decision_metrics.indicators.stochastic !== undefined && (
                          <div className="bg-[#1a1d2e] p-2 rounded border border-gray-700">
                            <div className="text-gray-400 text-xs mb-1">Stochastic</div>
                            <div className={`font-bold ${
                              selectedPosition.buy_decision_metrics.indicators.stochastic > 80 
                                ? 'text-red-400' 
                                : selectedPosition.buy_decision_metrics.indicators.stochastic < 20 
                                  ? 'text-green-400' 
                                  : 'text-white'
                            }`}>
                              {selectedPosition.buy_decision_metrics.indicators.stochastic.toFixed(2)}
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              {selectedPosition.buy_decision_metrics.indicators.stochastic > 80 ? 'Overbought' : 
                               selectedPosition.buy_decision_metrics.indicators.stochastic < 20 ? 'Oversold' : 'Neutral'}
                            </div>
                          </div>
                        )}
                        {selectedPosition.buy_decision_metrics.indicators.bb_position !== undefined && (
                          <div className="bg-[#1a1d2e] p-2 rounded border border-gray-700">
                            <div className="text-gray-400 text-xs mb-1">BB Position</div>
                            <div className={`font-bold ${
                              selectedPosition.buy_decision_metrics.indicators.bb_position > 0.9 
                                ? 'text-red-400' 
                                : selectedPosition.buy_decision_metrics.indicators.bb_position < 0.1 
                                  ? 'text-green-400' 
                                  : 'text-white'
                            }`}>
                              {(selectedPosition.buy_decision_metrics.indicators.bb_position * 100).toFixed(1)}%
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              {selectedPosition.buy_decision_metrics.indicators.bb_position > 0.9 ? 'Upper Band' : 
                               selectedPosition.buy_decision_metrics.indicators.bb_position < 0.1 ? 'Lower Band' : 'Mid Range'}
                            </div>
                          </div>
                        )}
                        {selectedPosition.buy_decision_metrics.indicators.volume_ratio !== undefined && (
                          <div className="bg-[#1a1d2e] p-2 rounded border border-gray-700">
                            <div className="text-gray-400 text-xs mb-1">Volume Ratio</div>
                            <div className={`font-bold ${
                              selectedPosition.buy_decision_metrics.indicators.volume_ratio > 2 
                                ? 'text-green-400' 
                                : selectedPosition.buy_decision_metrics.indicators.volume_ratio < 0.5 
                                  ? 'text-yellow-400' 
                                  : 'text-white'
                            }`}>
                              {selectedPosition.buy_decision_metrics.indicators.volume_ratio.toFixed(2)}x
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              {selectedPosition.buy_decision_metrics.indicators.volume_ratio > 2 ? 'High Volume' : 
                               selectedPosition.buy_decision_metrics.indicators.volume_ratio < 0.5 ? 'Low Volume' : 'Normal'}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Model Probabilities */}
                  {selectedPosition.buy_decision_metrics?.probabilities && Object.keys(selectedPosition.buy_decision_metrics.probabilities).length > 0 && (
                    <div className="mb-4">
                      <div className="text-gray-500 text-sm mb-2">ML Model Probabilities</div>
                      <div className="grid grid-cols-3 gap-2 text-sm">
                        {Object.entries(selectedPosition.buy_decision_metrics.probabilities).map(([action, prob]: [string, any]) => (
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
                        (selectedPosition.buy_decision_metrics?.news_sentiment || 0) > 0 
                          ? 'text-green-400' 
                          : (selectedPosition.buy_decision_metrics?.news_sentiment || 0) < 0 
                            ? 'text-red-400' 
                            : 'text-gray-400'
                      }`}>
                        {((selectedPosition.buy_decision_metrics?.news_sentiment || 0) * 100).toFixed(1)}%
                      </div>
                      {selectedPosition.buy_decision_metrics?.sentiment_boost !== undefined && selectedPosition.buy_decision_metrics.sentiment_boost > 0 && (
                        <div className="text-xs text-purple-400 mt-1">
                          +{((selectedPosition.buy_decision_metrics.sentiment_boost) * 100).toFixed(1)}% boost
                        </div>
                      )}
                    </div>
                    <div className="text-center">
                      <div className="text-gray-500 mb-1">Market Risk</div>
                      <div className={`font-bold ${
                        (selectedPosition.buy_decision_metrics?.market_risk || 0) < 0.3 
                          ? 'text-green-400' 
                          : (selectedPosition.buy_decision_metrics?.market_risk || 0) < 0.6 
                            ? 'text-yellow-400' 
                            : 'text-red-400'
                      }`}>
                        {((selectedPosition.buy_decision_metrics?.market_risk || 0) * 100).toFixed(0)}%
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-gray-500 mb-1">Buy Price</div>
                      <div className="font-bold text-white">
                        {formatCurrency(selectedPosition.buy_price)}
                      </div>
                    </div>
                  </div>

                  {/* Buy Timestamp */}
                  {selectedPosition.buy_timestamp && (
                    <div className="mt-4 pt-4 border-t border-gray-700">
                      <div className="text-gray-500 text-sm mb-1">Buy Timestamp</div>
                      <div className="text-white text-sm">
                        {new Date(selectedPosition.buy_timestamp).toLocaleString('en-US', {
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

                  {selectedPosition.buy_decision_metrics?.news_headlines && selectedPosition.buy_decision_metrics.news_headlines.length > 0 && (
                    <div className="mt-4">
                      <div className="text-gray-500 text-sm mb-2">News Headlines</div>
                      <ul className="space-y-1 text-xs text-gray-400">
                        {selectedPosition.buy_decision_metrics.news_headlines.map((headline: string, idx: number) => (
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

              {/* Current Sell Decision Metrics */}
              <div className="mb-6">
                <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                  <TrendingDown className="h-5 w-5 text-red-500" />
                  Current Sell Decision Metrics
                </h3>
                {loadingCurrentMetrics ? (
                  <div className="bg-[#252838] p-8 rounded-lg border border-gray-700 flex items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-blue-500 mr-2" />
                    <span className="text-gray-400">Fetching current metrics...</span>
                  </div>
                ) : currentSellMetrics ? (
                  <div className="bg-[#252838] p-4 rounded-lg border border-gray-700">
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <div className="text-gray-500 text-sm mb-1">Sell Confidence</div>
                        <div className="text-2xl font-bold text-white">
                          {((currentSellMetrics.confidence || 0) * 100).toFixed(1)}%
                        </div>
                      </div>
                      <div>
                        <div className="text-gray-500 text-sm mb-1">Adjusted Confidence</div>
                        <div className="text-2xl font-bold text-purple-400">
                          {((currentSellMetrics.adjusted_confidence || 0) * 100).toFixed(1)}%
                        </div>
                      </div>
                    </div>
                    
                    <div className="mb-4">
                      <div className="text-gray-500 text-sm mb-1">Reasoning</div>
                      <div className="text-white bg-[#1a1d2e] p-3 rounded border border-gray-700">
                        {currentSellMetrics.reasoning || 'No reasoning provided'}
                      </div>
                    </div>

                    {/* Current Technical Indicators */}
                    {currentSellMetrics.indicators && (
                      <div className="mb-4">
                        <div className="text-gray-500 text-sm mb-2">Current Technical Indicators</div>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                          {currentSellMetrics.indicators.rsi !== undefined && (
                            <div className="bg-[#1a1d2e] p-2 rounded border border-gray-700">
                              <div className="text-gray-400 text-xs mb-1">RSI</div>
                              <div className={`font-bold ${
                                currentSellMetrics.indicators.rsi > 70 
                                  ? 'text-red-400' 
                                  : currentSellMetrics.indicators.rsi < 30 
                                    ? 'text-green-400' 
                                    : 'text-white'
                              }`}>
                                {currentSellMetrics.indicators.rsi.toFixed(2)}
                              </div>
                              <div className="text-xs text-gray-500 mt-1">
                                {currentSellMetrics.indicators.rsi > 70 ? 'Overbought' : 
                                 currentSellMetrics.indicators.rsi < 30 ? 'Oversold' : 'Neutral'}
                              </div>
                            </div>
                          )}
                          {currentSellMetrics.indicators.macd !== undefined && (
                            <div className="bg-[#1a1d2e] p-2 rounded border border-gray-700">
                              <div className="text-gray-400 text-xs mb-1">MACD</div>
                              <div className={`font-bold ${
                                currentSellMetrics.indicators.macd > 0 
                                  ? 'text-green-400' 
                                  : 'text-red-400'
                              }`}>
                                {currentSellMetrics.indicators.macd.toFixed(4)}
                              </div>
                              <div className="text-xs text-gray-500 mt-1">
                                {currentSellMetrics.indicators.macd > 0 ? 'Bullish' : 'Bearish'}
                              </div>
                            </div>
                          )}
                          {currentSellMetrics.indicators.stochastic !== undefined && (
                            <div className="bg-[#1a1d2e] p-2 rounded border border-gray-700">
                              <div className="text-gray-400 text-xs mb-1">Stochastic</div>
                              <div className={`font-bold ${
                                currentSellMetrics.indicators.stochastic > 80 
                                  ? 'text-red-400' 
                                  : currentSellMetrics.indicators.stochastic < 20 
                                    ? 'text-green-400' 
                                    : 'text-white'
                              }`}>
                                {currentSellMetrics.indicators.stochastic.toFixed(2)}
                              </div>
                              <div className="text-xs text-gray-500 mt-1">
                                {currentSellMetrics.indicators.stochastic > 80 ? 'Overbought' : 
                                 currentSellMetrics.indicators.stochastic < 20 ? 'Oversold' : 'Neutral'}
                              </div>
                            </div>
                          )}
                          {currentSellMetrics.indicators.bb_position !== undefined && (
                            <div className="bg-[#1a1d2e] p-2 rounded border border-gray-700">
                              <div className="text-gray-400 text-xs mb-1">BB Position</div>
                              <div className={`font-bold ${
                                currentSellMetrics.indicators.bb_position > 0.9 
                                  ? 'text-red-400' 
                                  : currentSellMetrics.indicators.bb_position < 0.1 
                                    ? 'text-green-400' 
                                    : 'text-white'
                              }`}>
                                {(currentSellMetrics.indicators.bb_position * 100).toFixed(1)}%
                              </div>
                              <div className="text-xs text-gray-500 mt-1">
                                {currentSellMetrics.indicators.bb_position > 0.9 ? 'Upper Band' : 
                                 currentSellMetrics.indicators.bb_position < 0.1 ? 'Lower Band' : 'Mid Range'}
                              </div>
                            </div>
                          )}
                          {currentSellMetrics.indicators.volume_ratio !== undefined && (
                            <div className="bg-[#1a1d2e] p-2 rounded border border-gray-700">
                              <div className="text-gray-400 text-xs mb-1">Volume Ratio</div>
                              <div className={`font-bold ${
                                currentSellMetrics.indicators.volume_ratio > 2 
                                  ? 'text-green-400' 
                                  : currentSellMetrics.indicators.volume_ratio < 0.5 
                                    ? 'text-yellow-400' 
                                    : 'text-white'
                              }`}>
                                {currentSellMetrics.indicators.volume_ratio.toFixed(2)}x
                              </div>
                              <div className="text-xs text-gray-500 mt-1">
                                {currentSellMetrics.indicators.volume_ratio > 2 ? 'High Volume' : 
                                 currentSellMetrics.indicators.volume_ratio < 0.5 ? 'Low Volume' : 'Normal'}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Current Model Probabilities */}
                    {currentSellMetrics.probabilities && Object.keys(currentSellMetrics.probabilities).length > 0 && (
                      <div className="mb-4">
                        <div className="text-gray-500 text-sm mb-2">Current ML Model Probabilities</div>
                        <div className="grid grid-cols-3 gap-2 text-sm">
                          {Object.entries(currentSellMetrics.probabilities).map(([action, prob]: [string, any]) => (
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
                        <div className="text-gray-500 mb-1">Current News Sentiment</div>
                        <div className={`font-bold ${
                          (currentSellMetrics.news_sentiment || 0) > 0 
                            ? 'text-green-400' 
                            : (currentSellMetrics.news_sentiment || 0) < 0 
                              ? 'text-red-400' 
                              : 'text-gray-400'
                        }`}>
                          {((currentSellMetrics.news_sentiment || 0) * 100).toFixed(1)}%
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-gray-500 mb-1">Current Market Risk</div>
                        <div className={`font-bold ${
                          (currentSellMetrics.market_risk || 0) < 0.3 
                            ? 'text-green-400' 
                            : (currentSellMetrics.market_risk || 0) < 0.6 
                              ? 'text-yellow-400' 
                              : 'text-red-400'
                        }`}>
                          {((currentSellMetrics.market_risk || 0) * 100).toFixed(0)}%
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-gray-500 mb-1">Current Price</div>
                        <div className="font-bold text-white">
                          {formatCurrency(selectedPosition.current_price)}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-[#252838] p-4 rounded-lg border border-gray-700">
                    <p className="text-gray-400 text-sm">Unable to fetch current metrics. Please try again later.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sell Confirmation Modal */}
      {showSellConfirm && positionToSell && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => {
          setShowSellConfirm(false)
          setPositionToSell(null)
          setMarketStatus(null)
        }}>
          <div className="bg-[#1a1d2e] rounded-lg border border-gray-700 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <h2 className="text-xl font-bold text-white mb-4">
                {positionToSell.qty < 0 ? 'Confirm Buy Back (Close Short)' : 'Confirm Sell'}
              </h2>
              
              {/* Market Status Banner */}
              <div className={`mb-4 p-3 rounded-lg border ${
                checkingMarketStatus 
                  ? 'bg-gray-800/50 border-gray-600' 
                  : marketStatus?.is_open 
                    ? 'bg-green-900/30 border-green-600' 
                    : 'bg-yellow-900/30 border-yellow-600'
              }`}>
                {checkingMarketStatus ? (
                  <div className="flex items-center gap-2 text-gray-400">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Checking market status...
                  </div>
                ) : marketStatus?.is_open ? (
                  <div className="flex items-center gap-2 text-green-400">
                    <div className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
                    <span className="font-medium">Market is OPEN</span>
                    <span className="text-green-300 text-sm">- Order will execute immediately</span>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center gap-2 text-yellow-400 mb-1">
                      <div className="h-2 w-2 rounded-full bg-yellow-400" />
                      <span className="font-medium">Market is CLOSED</span>
                    </div>
                    <p className="text-yellow-300 text-sm">
                      Orders placed now will be queued and execute when the market opens 
                      {marketStatus?.next_open && (
                        <span className="block mt-1 text-yellow-200">
                          Next open: {new Date(marketStatus.next_open).toLocaleString()}
                        </span>
                      )}
                    </p>
                  </div>
                )}
              </div>
              
              <p className="text-gray-400 mb-6">
                Are you sure you want to {positionToSell.qty < 0 ? 'buy back' : 'sell'} <strong className="text-white">{Math.abs(positionToSell.qty)} shares</strong> of <strong className="text-white">{positionToSell.symbol}</strong>?
                {positionToSell.qty < 0 && (
                  <span className="block mt-2 text-sm text-yellow-400">This will close your short position by buying back the shares.</span>
                )}
              </p>
              <div className="bg-[#252838] p-4 rounded-lg mb-6">
                <div className="flex justify-between mb-2">
                  <span className="text-gray-400">Position Type:</span>
                  <span className={`font-semibold ${positionToSell.qty < 0 ? 'text-red-400' : 'text-blue-400'}`}>
                    {positionToSell.qty < 0 ? 'SHORT' : 'LONG'}
                  </span>
                </div>
                <div className="flex justify-between mb-2">
                  <span className="text-gray-400">Current Price:</span>
                  <span className="text-white font-semibold">{formatCurrency(positionToSell.current_price)}</span>
                </div>
                <div className="flex justify-between mb-2">
                  <span className="text-gray-400">Position Value:</span>
                  <span className="font-semibold text-white">
                    {formatCurrency(positionToSell.current_value)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Unrealized P&L:</span>
                  <span className={`font-semibold ${positionToSell.unrealized_pl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {formatCurrency(positionToSell.unrealized_pl)} ({positionToSell.unrealized_pl_percent >= 0 ? '+' : ''}{positionToSell.unrealized_pl_percent.toFixed(2)}%)
                  </span>
                </div>
              </div>
              
              {/* Buttons - different options based on market status */}
              <div className="flex flex-col gap-3">
                {!marketStatus?.is_open && !checkingMarketStatus && (
                  <Button
                    className="w-full bg-yellow-600 hover:bg-yellow-700 text-white"
                    onClick={() => {
                      handleSellPosition(positionToSell, true)
                    }}
                    disabled={sellingPosition === positionToSell.symbol}
                  >
                    {sellingPosition === positionToSell.symbol ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Queueing...
                      </>
                    ) : (
                      <>
                        Queue {positionToSell.qty < 0 ? 'Buy Back' : 'Sell'} Order
                        <span className="ml-2 text-xs opacity-75">(executes at market open)</span>
                      </>
                    )}
                  </Button>
                )}
                
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    className="flex-1 border-gray-600 text-gray-400 hover:bg-gray-700"
                    onClick={() => {
                      setShowSellConfirm(false)
                      setPositionToSell(null)
                      setMarketStatus(null)
                    }}
                  >
                    {!marketStatus?.is_open && !checkingMarketStatus ? 'Wait for Market Open' : 'Cancel'}
                  </Button>
                  
                  {(marketStatus?.is_open || checkingMarketStatus) && (
                    <Button
                      className={`flex-1 ${positionToSell.qty < 0 ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'} text-white`}
                      onClick={() => {
                        handleSellPosition(positionToSell, false)
                      }}
                      disabled={sellingPosition === positionToSell.symbol || checkingMarketStatus}
                    >
                      {sellingPosition === positionToSell.symbol ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          {positionToSell.qty < 0 ? 'Buying back...' : 'Selling...'}
                        </>
                      ) : (
                        positionToSell.qty < 0 ? 'Confirm Buy Back' : 'Confirm Sell'
                      )}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Queued Order Info Modal */}
      {showQueuedOrderModal && selectedQueuedOrder && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => {
          setShowQueuedOrderModal(false)
          setSelectedQueuedOrder(null)
        }}>
          <div className="bg-[#1a1d2e] rounded-lg border border-yellow-600 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-10 w-10 rounded-full bg-yellow-600/20 flex items-center justify-center">
                  <Clock className="h-5 w-5 text-yellow-400" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">
                    Queued {selectedQueuedOrder.side === 'buy' ? 'Buy Back' : 'Sell'} Order
                  </h2>
                  <p className="text-yellow-400 text-sm">Pending execution</p>
                </div>
              </div>
              
              <div className="bg-yellow-900/20 border border-yellow-600/50 rounded-lg p-4 mb-6">
                <p className="text-yellow-200 text-center">
                  {selectedQueuedOrder.side === 'buy' ? 'Buy back' : 'Sell'} order for <strong className="text-white">{selectedQueuedOrder.qty} shares</strong> of <strong className="text-white">{selectedQueuedOrder.symbol}</strong> is queued for <strong className="text-yellow-400">{formatNextMarketOpen(selectedQueuedOrder.nextMarketOpen)}</strong>
                </p>
              </div>
              
              <div className="bg-[#252838] p-4 rounded-lg mb-6 space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-400">Symbol:</span>
                  <span className="text-white font-semibold">{selectedQueuedOrder.symbol}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Order Type:</span>
                  <span className={`font-semibold ${selectedQueuedOrder.side === 'buy' ? 'text-green-400' : 'text-red-400'}`}>
                    {selectedQueuedOrder.side === 'buy' ? 'Buy Back (Close Short)' : 'Sell (Close Long)'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Quantity:</span>
                  <span className="text-white font-semibold">{selectedQueuedOrder.qty} shares</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Queued At:</span>
                  <span className="text-white">{new Date(selectedQueuedOrder.queuedAt).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Executes:</span>
                  <span className="text-yellow-400 font-semibold">
                    {selectedQueuedOrder.nextMarketOpen 
                      ? new Date(selectedQueuedOrder.nextMarketOpen).toLocaleString()
                      : 'Next market open'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Order ID:</span>
                  <span className="text-gray-300 text-sm font-mono">{selectedQueuedOrder.orderId.slice(0, 8)}...</span>
                </div>
              </div>
              
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1 border-gray-600 text-gray-400 hover:bg-gray-700"
                  onClick={() => {
                    setShowQueuedOrderModal(false)
                    setSelectedQueuedOrder(null)
                  }}
                >
                  Close
                </Button>
                <Button
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                  onClick={() => handleCancelQueuedOrder(selectedQueuedOrder)}
                  disabled={cancellingOrder}
                >
                  {cancellingOrder ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Cancelling...
                    </>
                  ) : (
                    'Cancel Queued Order'
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Completed Trade Details Modal */}
      {showCompletedTradeModal && selectedCompletedTrade && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => {
          setShowCompletedTradeModal(false)
          setSelectedCompletedTrade(null)
        }}>
          <div className="bg-[#1a1d2e] rounded-lg border border-gray-700 max-w-4xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-white">Trade Details: {selectedCompletedTrade.symbol}</h2>
                <button
                  onClick={() => {
                    setShowCompletedTradeModal(false)
                    setSelectedCompletedTrade(null)
                  }}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* Trade Summary */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-[#252838] p-4 rounded-lg border border-gray-700">
                  <div className="text-gray-500 text-sm mb-1">Profit/Loss</div>
                  <div className={`text-2xl font-bold ${selectedCompletedTrade.profit_loss >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {formatCurrency(selectedCompletedTrade.profit_loss)}
                  </div>
                  <div className={`text-sm ${selectedCompletedTrade.profit_loss_percent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {selectedCompletedTrade.profit_loss_percent >= 0 ? '+' : ''}{selectedCompletedTrade.profit_loss_percent.toFixed(2)}%
                  </div>
                </div>
                <div className="bg-[#252838] p-4 rounded-lg border border-gray-700">
                  <div className="text-gray-500 text-sm mb-1">Quantity</div>
                  <div className="text-2xl font-bold text-white">{selectedCompletedTrade.qty}</div>
                  <div className="text-sm text-gray-400">shares</div>
                </div>
                <div className="bg-[#252838] p-4 rounded-lg border border-gray-700">
                  <div className="text-gray-500 text-sm mb-1">Buy Price</div>
                  <div className="text-xl font-bold text-white">{formatCurrency(selectedCompletedTrade.buy_price)}</div>
                </div>
                <div className="bg-[#252838] p-4 rounded-lg border border-gray-700">
                  <div className="text-gray-500 text-sm mb-1">Sell Price</div>
                  <div className="text-xl font-bold text-white">{formatCurrency(selectedCompletedTrade.sell_price)}</div>
                </div>
              </div>

              {/* Timestamps */}
              <div className="bg-[#252838] p-4 rounded-lg border border-gray-700 mb-6">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-gray-500 mb-1">Buy Time</div>
                    <div className="text-white">{new Date(selectedCompletedTrade.buy_timestamp).toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-gray-500 mb-1">Sell Time</div>
                    <div className="text-white">{new Date(selectedCompletedTrade.sell_timestamp).toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-gray-500 mb-1">Holding Duration</div>
                    <div className="text-white">{formatDuration(selectedCompletedTrade.holding_duration)}</div>
                  </div>
                  <div>
                    <div className="text-gray-500 mb-1">Strategy</div>
                    <div className="text-blue-400">{selectedCompletedTrade.strategy}</div>
                  </div>
                </div>
              </div>

              {/* Buy Decision Metrics */}
              {selectedCompletedTrade.buy_decision_metrics && (
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
                          {((selectedCompletedTrade.buy_decision_metrics.confidence || 0) * 100).toFixed(1)}%
                        </div>
                      </div>
                      <div>
                        <div className="text-gray-500 text-sm mb-1">Adjusted Confidence</div>
                        <div className="text-2xl font-bold text-purple-400">
                          {((selectedCompletedTrade.buy_decision_metrics.adjusted_confidence || 0) * 100).toFixed(1)}%
                        </div>
                      </div>
                    </div>
                    
                    <div className="mb-4">
                      <div className="text-gray-500 text-sm mb-1">Reasoning</div>
                      <div className="text-white bg-[#1a1d2e] p-3 rounded border border-gray-700">
                        {selectedCompletedTrade.buy_decision_metrics.reasoning || 'No reasoning provided'}
                      </div>
                    </div>

                    {/* Buy Indicators */}
                    {selectedCompletedTrade.buy_decision_metrics.indicators && (
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                        {Object.entries(selectedCompletedTrade.buy_decision_metrics.indicators).map(([key, value]: [string, any]) => (
                          <div key={key} className="bg-[#1a1d2e] p-2 rounded border border-gray-700">
                            <div className="text-gray-400 text-xs mb-1">{key.toUpperCase()}</div>
                            <div className="font-bold text-white">
                              {typeof value === 'number' ? value.toFixed(2) : String(value)}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Sell Decision Metrics */}
              {selectedCompletedTrade.sell_decision_metrics && (
                <div className="mb-6">
                  <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                    <TrendingDown className="h-5 w-5 text-red-500" />
                    Sell Decision Metrics
                  </h3>
                  <div className="bg-[#252838] p-4 rounded-lg border border-gray-700">
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <div className="text-gray-500 text-sm mb-1">Confidence</div>
                        <div className="text-2xl font-bold text-white">
                          {((selectedCompletedTrade.sell_decision_metrics.confidence || 0) * 100).toFixed(1)}%
                        </div>
                      </div>
                      <div>
                        <div className="text-gray-500 text-sm mb-1">Adjusted Confidence</div>
                        <div className="text-2xl font-bold text-purple-400">
                          {((selectedCompletedTrade.sell_decision_metrics.adjusted_confidence || 0) * 100).toFixed(1)}%
                        </div>
                      </div>
                    </div>
                    
                    <div className="mb-4">
                      <div className="text-gray-500 text-sm mb-1">Reasoning</div>
                      <div className="text-white bg-[#1a1d2e] p-3 rounded border border-gray-700">
                        {selectedCompletedTrade.sell_decision_metrics.reasoning || 'No reasoning provided'}
                      </div>
                    </div>

                    {/* Sell Indicators */}
                    {selectedCompletedTrade.sell_decision_metrics.indicators && (
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                        {Object.entries(selectedCompletedTrade.sell_decision_metrics.indicators).map(([key, value]: [string, any]) => (
                          <div key={key} className="bg-[#1a1d2e] p-2 rounded border border-gray-700">
                            <div className="text-gray-400 text-xs mb-1">{key.toUpperCase()}</div>
                            <div className="font-bold text-white">
                              {typeof value === 'number' ? value.toFixed(2) : String(value)}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Strategy Configuration Modal */}
      {showStrategyModal && strategyModalAccountId && (
        <AccountStrategyModal
          accountId={strategyModalAccountId}
          accountName={strategyModalAccountName}
          isOpen={showStrategyModal}
          onClose={() => {
            setShowStrategyModal(false)
            setStrategyModalAccountId(null)
            setStrategyModalAccountName('')
          }}
          onSave={() => {
            // Optionally refresh data after settings are saved
            loadData()
          }}
        />
      )}
    </div>
  )
}
