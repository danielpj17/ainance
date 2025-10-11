/**
 * Market Data Aggregator Server
 * 
 * Aggregates real-time market data from Alpaca via WebSocket
 * Caches in Redis for fast access by multiple users
 * Exposes REST API for frontend consumption
 */

const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const AlpacaStream = require('./alpaca-stream');
const RedisCache = require('./redis-cache');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize components
let alpacaStream = null;
let redisCache = null;
let isReady = false;

// Track watched symbols
const watchedSymbols = new Set();

/**
 * Initialize services
 */
async function initialize() {
  console.log('🚀 Starting Market Data Aggregator...');
  
  try {
    // Initialize Redis cache
    console.log('📦 Connecting to Redis...');
    redisCache = new RedisCache({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD,
      ttl: parseInt(process.env.CACHE_TTL || '2') // 2 seconds default
    });
    await redisCache.connect();
    console.log('✅ Redis connected');
    
    // Initialize Alpaca stream
    console.log('📡 Connecting to Alpaca...');
    alpacaStream = new AlpacaStream({
      keyId: process.env.ALPACA_PAPER_KEY,
      secretKey: process.env.ALPACA_PAPER_SECRET,
      paper: true,
      onData: async (data) => {
        // Cache incoming data
        await redisCache.cacheMarketData(data);
      },
      onError: (error) => {
        console.error('❌ Alpaca stream error:', error);
      }
    });
    
    await alpacaStream.connect();
    console.log('✅ Alpaca connected');
    
    // Subscribe to default symbols
    const defaultSymbols = (process.env.DEFAULT_SYMBOLS || 'SPY,QQQ,AAPL,TSLA,NVDA').split(',');
    await subscribeToSymbols(defaultSymbols);
    
    isReady = true;
    console.log('✅ Market Data Aggregator ready!');
    
  } catch (error) {
    console.error('❌ Initialization failed:', error);
    process.exit(1);
  }
}

/**
 * Subscribe to symbols
 */
async function subscribeToSymbols(symbols) {
  const newSymbols = symbols.filter(s => !watchedSymbols.has(s));
  
  if (newSymbols.length > 0) {
    console.log(`📊 Subscribing to: ${newSymbols.join(', ')}`);
    await alpacaStream.subscribe(newSymbols);
    newSymbols.forEach(s => watchedSymbols.add(s));
  }
}

/**
 * Routes
 */

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: isReady ? 'healthy' : 'starting',
    redis: redisCache ? redisCache.isConnected() : false,
    alpaca: alpacaStream ? alpacaStream.isConnected() : false,
    watchedSymbols: Array.from(watchedSymbols),
    uptime: process.uptime()
  });
});

// Get quote for a single symbol
app.get('/quote/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    
    // Check cache first
    const cached = await redisCache.getQuote(symbol);
    
    if (cached) {
      return res.json({
        success: true,
        data: cached,
        source: 'cache'
      });
    }
    
    // If not in cache and not watched, subscribe to it
    if (!watchedSymbols.has(symbol)) {
      await subscribeToSymbols([symbol]);
    }
    
    // Return empty for now, will be cached on next update
    res.json({
      success: true,
      data: null,
      source: 'pending',
      message: 'Symbol subscribed, data will be available shortly'
    });
    
  } catch (error) {
    console.error('Error getting quote:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get quotes for multiple symbols
app.post('/quotes', async (req, res) => {
  try {
    const { symbols } = req.body;
    
    if (!symbols || !Array.isArray(symbols)) {
      return res.status(400).json({
        success: false,
        error: 'symbols array is required'
      });
    }
    
    const upperSymbols = symbols.map(s => s.toUpperCase());
    
    // Subscribe to any new symbols
    await subscribeToSymbols(upperSymbols);
    
    // Get all quotes from cache
    const quotes = {};
    for (const symbol of upperSymbols) {
      const cached = await redisCache.getQuote(symbol);
      if (cached) {
        quotes[symbol] = cached;
      }
    }
    
    res.json({
      success: true,
      data: quotes,
      source: 'cache',
      requested: upperSymbols.length,
      returned: Object.keys(quotes).length
    });
    
  } catch (error) {
    console.error('Error getting quotes:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get bars (OHLCV) for a symbol
app.get('/bars/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const limit = parseInt(req.query.limit || '100');
    
    const bars = await redisCache.getBars(symbol, limit);
    
    res.json({
      success: true,
      data: bars,
      symbol,
      count: bars.length
    });
    
  } catch (error) {
    console.error('Error getting bars:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Subscribe to new symbols
app.post('/subscribe', async (req, res) => {
  try {
    const { symbols } = req.body;
    
    if (!symbols || !Array.isArray(symbols)) {
      return res.status(400).json({
        success: false,
        error: 'symbols array is required'
      });
    }
    
    await subscribeToSymbols(symbols.map(s => s.toUpperCase()));
    
    res.json({
      success: true,
      watchedSymbols: Array.from(watchedSymbols)
    });
    
  } catch (error) {
    console.error('Error subscribing:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get list of watched symbols
app.get('/symbols', (req, res) => {
  res.json({
    success: true,
    symbols: Array.from(watchedSymbols),
    count: watchedSymbols.size
  });
});

// Get cache statistics
app.get('/stats', async (req, res) => {
  try {
    const stats = await redisCache.getStats();
    
    res.json({
      success: true,
      stats: {
        ...stats,
        watchedSymbols: watchedSymbols.size,
        alpacaConnected: alpacaStream ? alpacaStream.isConnected() : false
      }
    });
    
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'Market Data Aggregator',
    version: '1.0.0',
    status: isReady ? 'ready' : 'starting',
    endpoints: {
      health: 'GET /health',
      quote: 'GET /quote/:symbol',
      quotes: 'POST /quotes',
      bars: 'GET /bars/:symbol',
      subscribe: 'POST /subscribe',
      symbols: 'GET /symbols',
      stats: 'GET /stats'
    }
  });
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 SIGTERM received, shutting down gracefully...');
  
  if (alpacaStream) {
    await alpacaStream.disconnect();
  }
  
  if (redisCache) {
    await redisCache.disconnect();
  }
  
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('🛑 SIGINT received, shutting down gracefully...');
  
  if (alpacaStream) {
    await alpacaStream.disconnect();
  }
  
  if (redisCache) {
    await redisCache.disconnect();
  }
  
  process.exit(0);
});

// Start server
app.listen(PORT, async () => {
  console.log(`🚀 Server listening on port ${PORT}`);
  await initialize();
});

module.exports = app;

