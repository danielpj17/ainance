/**
 * Alpaca WebSocket Stream Handler
 * 
 * Manages WebSocket connection to Alpaca for real-time market data
 */

const Alpaca = require('@alpacahq/alpaca-trade-api');

class AlpacaStream {
  constructor(config) {
    this.config = config;
    this.alpaca = null;
    this.dataStream = null;
    this.connected = false;
    this.subscribedSymbols = new Set();
    
    this.onData = config.onData || (() => {});
    this.onError = config.onError || console.error;
  }
  
  /**
   * Connect to Alpaca WebSocket
   */
  async connect() {
    try {
      // Initialize Alpaca client
      this.alpaca = new Alpaca({
        keyId: this.config.keyId,
        secretKey: this.config.secretKey,
        paper: this.config.paper !== false,
        feed: 'iex' // Free tier uses IEX feed
      });
      
      // Get data stream
      this.dataStream = this.alpaca.data_stream_v2;
      
      // Set up event handlers
      this.dataStream.onConnect(() => {
        console.log('✅ Alpaca WebSocket connected');
        this.connected = true;
      });
      
      this.dataStream.onDisconnect(() => {
        console.log('⚠️  Alpaca WebSocket disconnected');
        this.connected = false;
      });
      
      this.dataStream.onError((error) => {
        console.error('❌ Alpaca WebSocket error:', error);
        this.onError(error);
      });
      
      this.dataStream.onStateChange((state) => {
        console.log(`📡 Alpaca state: ${state}`);
      });
      
      // Handle trade updates
      this.dataStream.onStockTrade((trade) => {
        this.handleTrade(trade);
      });
      
      // Handle quote updates
      this.dataStream.onStockQuote((quote) => {
        this.handleQuote(quote);
      });
      
      // Handle bar updates (minute bars)
      this.dataStream.onStockBar((bar) => {
        this.handleBar(bar);
      });
      
      // Connect
      await this.dataStream.connect();
      
      // Wait for connection
      await this.waitForConnection();
      
      return true;
      
    } catch (error) {
      console.error('Failed to connect to Alpaca:', error);
      throw error;
    }
  }
  
  /**
   * Wait for WebSocket connection
   */
  waitForConnection(timeout = 10000) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      
      const checkConnection = () => {
        if (this.connected) {
          resolve();
        } else if (Date.now() - startTime > timeout) {
          reject(new Error('Connection timeout'));
        } else {
          setTimeout(checkConnection, 100);
        }
      };
      
      checkConnection();
    });
  }
  
  /**
   * Subscribe to symbols
   */
  async subscribe(symbols) {
    if (!this.connected) {
      throw new Error('Not connected to Alpaca');
    }
    
    const newSymbols = symbols.filter(s => !this.subscribedSymbols.has(s));
    
    if (newSymbols.length === 0) {
      return;
    }
    
    try {
      // Subscribe to trades, quotes, and bars
      this.dataStream.subscribeForTrades(newSymbols);
      this.dataStream.subscribeForQuotes(newSymbols);
      this.dataStream.subscribeForBars(newSymbols);
      
      newSymbols.forEach(s => this.subscribedSymbols.add(s));
      
      console.log(`📊 Subscribed to ${newSymbols.length} symbols: ${newSymbols.join(', ')}`);
      
    } catch (error) {
      console.error('Error subscribing to symbols:', error);
      throw error;
    }
  }
  
  /**
   * Unsubscribe from symbols
   */
  async unsubscribe(symbols) {
    if (!this.connected) {
      return;
    }
    
    try {
      this.dataStream.unsubscribeFromTrades(symbols);
      this.dataStream.unsubscribeFromQuotes(symbols);
      this.dataStream.unsubscribeFromBars(symbols);
      
      symbols.forEach(s => this.subscribedSymbols.delete(s));
      
      console.log(`📊 Unsubscribed from ${symbols.length} symbols`);
      
    } catch (error) {
      console.error('Error unsubscribing from symbols:', error);
    }
  }
  
  /**
   * Handle trade update
   */
  handleTrade(trade) {
    const data = {
      type: 'trade',
      symbol: trade.Symbol,
      price: trade.Price,
      size: trade.Size,
      timestamp: trade.Timestamp,
      exchange: trade.Exchange,
      conditions: trade.Conditions
    };
    
    this.onData(data);
  }
  
  /**
   * Handle quote update
   */
  handleQuote(quote) {
    const data = {
      type: 'quote',
      symbol: quote.Symbol,
      bid: quote.BidPrice,
      ask: quote.AskPrice,
      bidSize: quote.BidSize,
      askSize: quote.AskSize,
      timestamp: quote.Timestamp,
      conditions: quote.Conditions
    };
    
    this.onData(data);
  }
  
  /**
   * Handle bar update (OHLCV)
   */
  handleBar(bar) {
    const data = {
      type: 'bar',
      symbol: bar.Symbol,
      open: bar.OpenPrice,
      high: bar.HighPrice,
      low: bar.LowPrice,
      close: bar.ClosePrice,
      volume: bar.Volume,
      timestamp: bar.Timestamp,
      vwap: bar.VWAP,
      tradeCount: bar.TradeCount
    };
    
    this.onData(data);
  }
  
  /**
   * Check if connected
   */
  isConnected() {
    return this.connected;
  }
  
  /**
   * Get subscribed symbols
   */
  getSubscribedSymbols() {
    return Array.from(this.subscribedSymbols);
  }
  
  /**
   * Disconnect from Alpaca
   */
  async disconnect() {
    if (this.dataStream) {
      try {
        await this.dataStream.disconnect();
        this.connected = false;
        console.log('✅ Disconnected from Alpaca');
      } catch (error) {
        console.error('Error disconnecting:', error);
      }
    }
  }
}

module.exports = AlpacaStream;

