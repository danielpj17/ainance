import Alpaca from '@alpacahq/alpaca-trade-api'

export interface AlpacaConfig {
  apiKey: string
  secretKey: string
  baseUrl: string
  dataUrl?: string
  paper: boolean
}

export interface AccountInfo {
  id: string
  account_number: string
  status: string
  currency: string
  buying_power: string
  cash: string
  portfolio_value: string
  pattern_day_trader: boolean
  trading_blocked: boolean
  transfers_blocked: boolean
  account_blocked: boolean
  created_at: string
  trade_suspended_by_user: boolean
  multiplier: string
  shorting_enabled: boolean
  equity: string
  last_equity: string
  long_market_value: string
  short_market_value: string
  initial_margin: string
  maintenance_margin: string
  last_maintenance_margin: string
  sma: string
}

export interface Position {
  asset_id: string
  symbol: string
  exchange: string
  asset_class: string
  qty: string
  side: string
  market_value: string
  cost_basis: string
  unrealized_pl: string
  unrealized_plpc: string
  unrealized_intraday_pl: string
  unrealized_intraday_plpc: string
  current_price: string
  lastday_price: string
  change_today: string
}

export interface Order {
  id: string
  client_order_id: string
  created_at: string
  updated_at: string
  submitted_at: string
  filled_at: string | null
  expired_at: string | null
  canceled_at: string | null
  failed_at: string | null
  replaced_at: string | null
  replaced_by: string | null
  replaces: string | null
  asset_id: string
  symbol: string
  asset_class: string
  notional: string | null
  qty: string | null
  filled_qty: string
  filled_avg_price: string | null
  order_class: string
  order_type: string
  type: string
  side: string
  time_in_force: string
  limit_price: string | null
  stop_price: string | null
  status: string
  extended_hours: boolean
  legs: any[] | null
  trail_percent: string | null
  trail_price: string | null
  hwm: string | null
}

export interface MarketData {
  symbol: string
  open: number
  high: number
  low: number
  close: number
  volume: number
  timestamp: string
  vwap?: number
}

export interface TradingError {
  code: number
  message: string
  type: 'INSUFFICIENT_FUNDS' | 'RATE_LIMIT' | 'SETTLEMENT' | 'MARKET_CLOSED' | 'INVALID_ORDER' | 'UNKNOWN'
}

class AlpacaWrapper {
  private client: any
  private stream: any | null = null
  private config: AlpacaConfig
  private isConnected = false

  constructor(config: AlpacaConfig) {
    this.config = config
    this.client = new (Alpaca as any)({
      keyId: config.apiKey,
      secretKey: config.secretKey,
      paper: config.paper,
      rate_limit: true,
    })
  }

  // Initialize connection
  public async initialize(): Promise<void> {
    try {
      // Test connection by getting account info
      await this.getAccount()
      this.isConnected = true
      console.log(`Alpaca client initialized (${this.config.paper ? 'Paper' : 'Live'} trading)`)
    } catch (error) {
      console.error('Failed to initialize Alpaca client:', error)
      throw error
    }
  }

  // Get account information
  public async getAccount(): Promise<AccountInfo> {
    try {
      const account = await this.client.getAccount()
      return account as AccountInfo
    } catch (error) {
      console.error('Error fetching account:', error)
      throw this.handleAlpacaError(error)
    }
  }

  // Get current positions
  public async getPositions(): Promise<Position[]> {
    try {
      const positions = await this.client.getPositions()
      return positions as Position[]
    } catch (error) {
      console.error('Error fetching positions:', error)
      throw this.handleAlpacaError(error)
    }
  }

  // Get open orders
  public async getOpenOrders(): Promise<Order[]> {
    try {
      const orders = await this.client.getOrders({
        status: 'open'
      })
      return orders as Order[]
    } catch (error) {
      console.error('Error fetching open orders:', error)
      throw this.handleAlpacaError(error)
    }
  }

  // Get order history
  public async getOrderHistory(limit = 50): Promise<Order[]> {
    try {
      const orders = await this.client.getOrders({
        status: 'all',
        limit
      })
      return orders as Order[]
    } catch (error) {
      console.error('Error fetching order history:', error)
      throw this.handleAlpacaError(error)
    }
  }

  // Place a market order
  public async placeMarketOrder(
    symbol: string,
    qty: number,
    side: 'buy' | 'sell',
    timeInForce: 'day' | 'gtc' | 'ioc' | 'fok' = 'day'
  ): Promise<Order> {
    try {
      const order = await this.client.createOrder({
        symbol,
        qty,
        side,
        type: 'market',
        time_in_force: timeInForce
      })
      console.log(`Market order placed: ${side} ${qty} ${symbol}`)
      return order as Order
    } catch (error) {
      console.error('Error placing market order:', error)
      throw this.handleAlpacaError(error)
    }
  }

  // Place a limit order
  public async placeLimitOrder(
    symbol: string,
    qty: number,
    side: 'buy' | 'sell',
    limitPrice: number,
    timeInForce: 'day' | 'gtc' | 'ioc' | 'fok' = 'day'
  ): Promise<Order> {
    try {
      const order = await this.client.createOrder({
        symbol,
        qty,
        side,
        type: 'limit',
        limit_price: limitPrice,
        time_in_force: timeInForce
      })
      console.log(`Limit order placed: ${side} ${qty} ${symbol} @ $${limitPrice}`)
      return order as Order
    } catch (error) {
      console.error('Error placing limit order:', error)
      throw this.handleAlpacaError(error)
    }
  }

  // Cancel an order
  public async cancelOrder(orderId: string): Promise<void> {
    try {
      await this.client.cancelOrder(orderId)
      console.log(`Order ${orderId} cancelled`)
    } catch (error) {
      console.error('Error cancelling order:', error)
      throw this.handleAlpacaError(error)
    }
  }

  // Cancel all orders
  public async cancelAllOrders(): Promise<void> {
    try {
      await this.client.cancelAllOrders()
      console.log('All orders cancelled')
    } catch (error) {
      console.error('Error cancelling all orders:', error)
      throw this.handleAlpacaError(error)
    }
  }

  // Get market data for symbols
  public async getMarketData(symbols: string[], timeframe: '1Min' | '5Min' | '15Min' | '1Hour' | '1Day' = '1Min'): Promise<MarketData[]> {
    try {
      console.log(`Fetching market data for symbols:`, symbols)
      console.log(`Available methods:`, {
        hasBarsV2: typeof this.client.getBarsV2,
        hasGetBars: typeof this.client.getBars,
        hasGetMultiBars: typeof this.client.getMultiBars
      })
      
      const marketData: any = {}
      
      // For Alpaca SDK v3, we need to fetch bars for each symbol individually
      for (const symbol of symbols) {
        try {
          console.log(`Fetching bars for ${symbol}...`)
          
          // Try getBarsV2 first (v3 SDK)
          if (typeof this.client.getBarsV2 === 'function') {
            const iterator = this.client.getBarsV2(symbol, {
              timeframe,
              limit: 100,
              start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString() // Last 7 days
            })
            
            const bars: any[] = []
            for await (const bar of iterator) {
              bars.push(bar)
            }
            marketData[symbol] = bars
            console.log(`Got ${bars.length} bars for ${symbol}`)
          }
          // Fallback to getBars
          else if (typeof this.client.getBars === 'function') {
            const bars = await this.client.getBars(symbol, {
              timeframe,
              limit: 100
            })
            marketData[symbol] = Array.isArray(bars) ? bars : [bars]
          }
          else {
            throw new Error('No compatible getBars method found in Alpaca client')
          }
        } catch (err) {
          console.error(`Failed to get bars for ${symbol}:`, err)
          // Continue with other symbols
        }
      }
      
      const results: MarketData[] = []
      for (const symbol of symbols) {
        const bars = marketData[symbol]
        if (bars && bars.length > 0) {
          const latestBar = bars[bars.length - 1]
          results.push({
            symbol,
            open: latestBar.Open || latestBar.o || latestBar.open,
            high: latestBar.High || latestBar.h || latestBar.high,
            low: latestBar.Low || latestBar.l || latestBar.low,
            close: latestBar.Close || latestBar.c || latestBar.close,
            volume: latestBar.Volume || latestBar.v || latestBar.volume,
            timestamp: new Date(latestBar.Timestamp || latestBar.t || latestBar.timestamp).toISOString(),
            vwap: latestBar.VWAP || latestBar.vw || latestBar.vwap
          })
        }
      }
      
      return results
    } catch (error) {
      console.error('Error fetching market data:', error)
      throw this.handleAlpacaError(error)
    }
  }

  // Get OHLCV series for a single symbol
  public async getBarsSeries(symbol: string, timeframe: '1Min' | '5Min' | '15Min' | '1Hour' | '1Day' = '1Min', limit = 300): Promise<Array<{ time: string, open: number, high: number, low: number, close: number, volume: number }>> {
    try {
      const bars = await (this.client as any).getBars({ symbols: [symbol], timeframe, limit })
      const series: Array<{ time: string, open: number, high: number, low: number, close: number, volume: number }> = []
      const rows = bars[symbol] || []
      for (const b of rows) {
        series.push({
          time: new Date(b.Timestamp).toISOString(),
          open: b.Open,
          high: b.High,
          low: b.Low,
          close: b.Close,
          volume: b.Volume,
        })
      }
      return series
    } catch (error) {
      console.error('Error fetching bars series:', error)
      throw this.handleAlpacaError(error)
    }
  }

  // Get latest quote for a symbol
  public async getLatestQuote(symbol: string): Promise<{ bid: number, ask: number, bidSize: number, askSize: number }> {
    try {
      const quote = await this.client.getLatestQuote(symbol)
      return {
        bid: quote.bid_price,
        ask: quote.ask_price,
        bidSize: quote.bid_size,
        askSize: quote.ask_size
      }
    } catch (error) {
      console.error('Error fetching latest quote:', error)
      throw this.handleAlpacaError(error)
    }
  }

  // Check if market is open
  public async isMarketOpen(): Promise<boolean> {
    try {
      const clock = await this.client.getClock()
      return clock.is_open
    } catch (error) {
      console.error('Error checking market status:', error)
      throw this.handleAlpacaError(error)
    }
  }

  // Get buying power (respects cash vs margin account)
  public async getBuyingPower(): Promise<{ cash: number, buying_power: number, non_marginable: number }> {
    try {
      const account = await this.getAccount()
      const cash = parseFloat(account.cash)
      const buyingPower = parseFloat(account.buying_power)
      
      // For cash accounts, non-marginable buying power is the same as cash
      // For margin accounts, it's the cash amount
      const nonMarginable = this.config.paper ? buyingPower : Math.min(cash, buyingPower)
      
      return {
        cash,
        buying_power: buyingPower,
        non_marginable: nonMarginable
      }
    } catch (error) {
      console.error('Error getting buying power:', error)
      throw this.handleAlpacaError(error)
    }
  }

  // Calculate position size based on account type and risk
  public async calculatePositionSize(
    symbol: string,
    price: number,
    riskPercent: number = 0.02,
    useMargin: boolean = false
  ): Promise<number> {
    try {
      const buyingPower = await this.getBuyingPower()
      
      let availableCapital: number
      if (useMargin && !this.config.paper) {
        availableCapital = buyingPower.buying_power
      } else {
        availableCapital = buyingPower.non_marginable
      }
      
      const riskAmount = availableCapital * riskPercent
      const positionSize = Math.floor(riskAmount / price)
      
      // Ensure minimum order size
      return Math.max(positionSize, 1)
    } catch (error) {
      console.error('Error calculating position size:', error)
      throw this.handleAlpacaError(error)
    }
  }

  // Subscribe to real-time data
  public async subscribeToData(symbols: string[], callback: (data: any) => void): Promise<void> {
    try {
      this.stream = (this.client as any).data_ws
      
      // Subscribe to trades and quotes
      this.stream.subscribeForTrades(symbols)
      this.stream.subscribeForQuotes(symbols)
      
      this.stream.onConnect(() => {
        console.log('Connected to Alpaca data stream')
      })
      
      this.stream.onTradeUpdate((trade: any) => {
        callback({
          type: 'trade',
          data: trade
        })
      })
      
      this.stream.onQuoteUpdate((quote: any) => {
        callback({
          type: 'quote',
          data: quote
        })
      })
      
      this.stream.onError((error: any) => {
        console.error('Stream error:', error)
      })
      
    } catch (error) {
      console.error('Error subscribing to data:', error)
      throw this.handleAlpacaError(error)
    }
  }

  // Unsubscribe from data stream
  public async unsubscribeFromData(): Promise<void> {
    if (this.stream) {
      this.stream.disconnect()
      this.stream = null
      console.log('Disconnected from Alpaca data stream')
    }
  }

  // Handle Alpaca API errors
  private handleAlpacaError(error: any): TradingError {
    console.error('Alpaca API Error:', error)
    
    // Import error handler dynamically to avoid circular dependencies
    const { TradingErrorHandler } = require('./error-handler')
    
    return TradingErrorHandler.handleError(error, {
      operation: 'alpaca_api_call',
      userId: 'unknown' // Would be passed from calling context
    })
  }

  // Check if client is connected
  public getConnectionStatus(): boolean {
    return this.isConnected
  }

  // Get configuration
  public getConfig(): AlpacaConfig {
    return { ...this.config }
  }

  // Dispose of resources
  public async dispose(): Promise<void> {
    await this.unsubscribeFromData()
    this.isConnected = false
  }
}

// Factory function to create Alpaca client
export function createAlpacaClient(config: AlpacaConfig): AlpacaWrapper {
  return new AlpacaWrapper(config)
}

// Helper function to determine if using paper trading
export function isPaperTrading(accountType: string, strategy: string): boolean {
  return accountType === 'paper' || strategy === 'cash'
}

// Helper function to get appropriate API keys
export function getAlpacaKeys(
  apiKeys: any,
  accountType: string,
  strategy: string
): { apiKey: string, secretKey: string, paper: boolean } {
  const isPaper = isPaperTrading(accountType, strategy)
  
  return {
    apiKey: isPaper ? apiKeys.alpaca_paper_key : apiKeys.alpaca_live_key,
    secretKey: isPaper ? apiKeys.alpaca_paper_secret : apiKeys.alpaca_live_secret,
    paper: isPaper
  }
}

export default AlpacaWrapper
