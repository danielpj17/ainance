/**
 * Redis Cache Manager
 * 
 * Caches market data in Redis with TTL for fast access
 */

const redis = require('redis');

class RedisCache {
  constructor(config = {}) {
    this.config = {
      host: config.host || 'localhost',
      port: config.port || 6379,
      password: config.password,
      ttl: config.ttl || 2, // Default 2 seconds
      maxBars: config.maxBars || 100 // Keep last 100 bars per symbol
    };
    
    this.client = null;
    this.connected = false;
  }
  
  /**
   * Connect to Redis
   */
  async connect() {
    try {
      const redisConfig = {
        socket: {
          host: this.config.host,
          port: this.config.port
        }
      };
      
      if (this.config.password) {
        redisConfig.password = this.config.password;
      }
      
      this.client = redis.createClient(redisConfig);
      
      this.client.on('error', (err) => {
        console.error('Redis error:', err);
      });
      
      this.client.on('connect', () => {
        console.log('✅ Connected to Redis');
        this.connected = true;
      });
      
      this.client.on('disconnect', () => {
        console.log('⚠️  Disconnected from Redis');
        this.connected = false;
      });
      
      await this.client.connect();
      
    } catch (error) {
      console.error('Failed to connect to Redis:', error);
      throw error;
    }
  }
  
  /**
   * Cache market data from Alpaca stream
   */
  async cacheMarketData(data) {
    if (!this.connected) {
      return;
    }
    
    try {
      const { type, symbol, timestamp } = data;
      
      switch (type) {
        case 'trade':
          await this.cacheTrade(data);
          break;
        case 'quote':
          await this.cacheQuote(data);
          break;
        case 'bar':
          await this.cacheBar(data);
          break;
      }
      
    } catch (error) {
      console.error('Error caching data:', error);
    }
  }
  
  /**
   * Cache trade data
   */
  async cacheTrade(data) {
    const key = `trade:${data.symbol}`;
    const value = JSON.stringify({
      price: data.price,
      size: data.size,
      timestamp: data.timestamp,
      exchange: data.exchange
    });
    
    await this.client.setEx(key, this.config.ttl, value);
    
    // Also update latest quote with trade price
    await this.updateLatestQuote(data.symbol, { lastPrice: data.price });
  }
  
  /**
   * Cache quote data
   */
  async cacheQuote(data) {
    const key = `quote:${data.symbol}`;
    const value = JSON.stringify({
      bid: data.bid,
      ask: data.ask,
      bidSize: data.bidSize,
      askSize: data.askSize,
      timestamp: data.timestamp
    });
    
    await this.client.setEx(key, this.config.ttl, value);
    
    // Update latest quote
    await this.updateLatestQuote(data.symbol, {
      bid: data.bid,
      ask: data.ask,
      mid: (data.bid + data.ask) / 2
    });
  }
  
  /**
   * Cache bar data (OHLCV)
   */
  async cacheBar(data) {
    const key = `bar:${data.symbol}`;
    const value = JSON.stringify({
      open: data.open,
      high: data.high,
      low: data.low,
      close: data.close,
      volume: data.volume,
      vwap: data.vwap,
      timestamp: data.timestamp
    });
    
    await this.client.setEx(key, this.config.ttl, value);
    
    // Add to bars list (for historical data)
    await this.addToBarsList(data.symbol, data);
    
    // Update latest quote with close price
    await this.updateLatestQuote(data.symbol, { lastPrice: data.close });
  }
  
  /**
   * Update latest quote (aggregated view)
   */
  async updateLatestQuote(symbol, updates) {
    const key = `latest:${symbol}`;
    
    // Get existing quote or create new
    let quote = await this.client.get(key);
    quote = quote ? JSON.parse(quote) : { symbol };
    
    // Update fields
    Object.assign(quote, updates, { updatedAt: Date.now() });
    
    // Save with longer TTL
    await this.client.setEx(key, 5, JSON.stringify(quote));
  }
  
  /**
   * Get latest quote for a symbol
   */
  async getQuote(symbol) {
    try {
      const key = `latest:${symbol}`;
      const value = await this.client.get(key);
      
      if (!value) {
        return null;
      }
      
      return JSON.parse(value);
      
    } catch (error) {
      console.error(`Error getting quote for ${symbol}:`, error);
      return null;
    }
  }
  
  /**
   * Add bar to historical bars list
   */
  async addToBarsList(symbol, bar) {
    const key = `bars:${symbol}`;
    const value = JSON.stringify({
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume,
      timestamp: bar.timestamp
    });
    
    // Add to list
    await this.client.lPush(key, value);
    
    // Trim to max bars
    await this.client.lTrim(key, 0, this.config.maxBars - 1);
    
    // Set expiration (longer for historical data)
    await this.client.expire(key, 3600); // 1 hour
  }
  
  /**
   * Get bars for a symbol
   */
  async getBars(symbol, limit = 100) {
    try {
      const key = `bars:${symbol}`;
      const values = await this.client.lRange(key, 0, limit - 1);
      
      return values.map(v => JSON.parse(v));
      
    } catch (error) {
      console.error(`Error getting bars for ${symbol}:`, error);
      return [];
    }
  }
  
  /**
   * Get multiple quotes
   */
  async getQuotes(symbols) {
    const quotes = {};
    
    for (const symbol of symbols) {
      const quote = await this.getQuote(symbol);
      if (quote) {
        quotes[symbol] = quote;
      }
    }
    
    return quotes;
  }
  
  /**
   * Get cache statistics
   */
  async getStats() {
    try {
      const info = await this.client.info('stats');
      const dbSize = await this.client.dbSize();
      
      return {
        connected: this.connected,
        dbSize,
        ttl: this.config.ttl,
        maxBars: this.config.maxBars
      };
      
    } catch (error) {
      console.error('Error getting stats:', error);
      return {
        connected: this.connected,
        error: error.message
      };
    }
  }
  
  /**
   * Clear cache for a symbol
   */
  async clearSymbol(symbol) {
    const keys = [
      `trade:${symbol}`,
      `quote:${symbol}`,
      `bar:${symbol}`,
      `latest:${symbol}`,
      `bars:${symbol}`
    ];
    
    for (const key of keys) {
      await this.client.del(key);
    }
  }
  
  /**
   * Clear all cache
   */
  async clearAll() {
    await this.client.flushDb();
  }
  
  /**
   * Check if connected
   */
  isConnected() {
    return this.connected;
  }
  
  /**
   * Disconnect from Redis
   */
  async disconnect() {
    if (this.client) {
      try {
        await this.client.quit();
        this.connected = false;
        console.log('✅ Disconnected from Redis');
      } catch (error) {
        console.error('Error disconnecting from Redis:', error);
      }
    }
  }
}

module.exports = RedisCache;

