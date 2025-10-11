# Market Data Aggregator Service

Real-time market data aggregation service that solves the multi-user rate limit problem by maintaining a single WebSocket connection to Alpaca and caching data in Redis.

## 🎯 Purpose

- **Single Alpaca Connection**: One WebSocket connection serves unlimited users
- **Redis Caching**: Sub-100ms data access from cache
- **Rate Limit Solution**: Avoid Alpaca's 200 requests/minute limit
- **Scalable**: Supports unlimited users querying the same data

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Redis (via Docker or installed locally)
- Alpaca API keys

### 1. Install Dependencies

```bash
cd market-data-server
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your Alpaca keys
```

### 3. Start Redis (if not running)

```bash
# Using Docker
docker run -d -p 6379:6379 --name redis redis:7-alpine

# Or using docker-compose (includes both Redis and the server)
docker-compose up -d
```

### 4. Start the Server

```bash
# Development mode with auto-reload
npm run dev

# Production mode
npm start
```

The server will start on http://localhost:3001

### 5. Test the Service

```bash
npm test
```

## 📡 API Endpoints

### `GET /health`
Health check - returns service status

**Response:**
```json
{
  "status": "healthy",
  "redis": true,
  "alpaca": true,
  "watchedSymbols": ["SPY", "AAPL"],
  "uptime": 123.45
}
```

### `GET /quote/:symbol`
Get latest quote for a single symbol

**Example:**
```bash
curl http://localhost:3001/quote/AAPL
```

**Response:**
```json
{
  "success": true,
  "data": {
    "symbol": "AAPL",
    "bid": 175.20,
    "ask": 175.25,
    "mid": 175.225,
    "lastPrice": 175.23,
    "updatedAt": 1697043600000
  },
  "source": "cache"
}
```

### `POST /quotes`
Get quotes for multiple symbols

**Request:**
```bash
curl -X POST http://localhost:3001/quotes \
  -H "Content-Type: application/json" \
  -d '{"symbols": ["AAPL", "TSLA", "NVDA"]}'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "AAPL": { "symbol": "AAPL", "lastPrice": 175.23, ... },
    "TSLA": { "symbol": "TSLA", "lastPrice": 250.50, ... },
    "NVDA": { "symbol": "NVDA", "lastPrice": 450.75, ... }
  },
  "source": "cache",
  "requested": 3,
  "returned": 3
}
```

### `GET /bars/:symbol?limit=100`
Get historical OHLCV bars for a symbol

**Example:**
```bash
curl http://localhost:3001/bars/AAPL?limit=50
```

### `POST /subscribe`
Subscribe to new symbols

**Request:**
```bash
curl -X POST http://localhost:3001/subscribe \
  -H "Content-Type: application/json" \
  -d '{"symbols": ["META", "GOOGL"]}'
```

### `GET /symbols`
Get list of currently watched symbols

### `GET /stats`
Get cache and connection statistics

## 🐳 Docker Deployment

### Using Docker Compose (Recommended)

```bash
# Start both Redis and the service
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### Using Docker Only

```bash
# Build image
docker build -t market-data-server .

# Run (requires Redis running elsewhere)
docker run -d \
  -p 3001:3001 \
  -e ALPACA_PAPER_KEY=your_key \
  -e ALPACA_PAPER_SECRET=your_secret \
  -e REDIS_HOST=redis \
  --name market-data-server \
  market-data-server
```

## 🚢 Deploy to Railway/Render

### Railway

1. Push code to GitHub
2. Create new Railway project
3. Add Redis plugin
4. Deploy from GitHub repo
5. Add environment variables:
   - `ALPACA_PAPER_KEY`
   - `ALPACA_PAPER_SECRET`
   - `REDIS_HOST` (from Redis plugin)
   - `REDIS_PORT` (from Redis plugin)

### Render

1. Create new Web Service
2. Create Redis instance
3. Link Redis to Web Service
4. Add environment variables
5. Deploy

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | 3001 |
| `ALPACA_PAPER_KEY` | Alpaca API key | Required |
| `ALPACA_PAPER_SECRET` | Alpaca API secret | Required |
| `REDIS_HOST` | Redis hostname | localhost |
| `REDIS_PORT` | Redis port | 6379 |
| `REDIS_PASSWORD` | Redis password | None |
| `CACHE_TTL` | Cache TTL in seconds | 2 |
| `DEFAULT_SYMBOLS` | Symbols to watch on startup | SPY,QQQ,... |

### Performance Tuning

**Cache TTL**: Lower = more real-time, higher = less Alpaca load
- Scalping: 1-2 seconds
- Day trading: 2-5 seconds
- Swing trading: 10-30 seconds

**Redis Memory**: Approximately 1KB per symbol per second
- 30 symbols × 2 sec TTL = ~60KB
- 100 symbols × 5 sec TTL = ~500KB

## 🔗 Integration with Next.js

In your Next.js API routes, call this service instead of Alpaca directly:

```typescript
// app/api/market-data/route.ts
export async function GET(req: NextRequest) {
  const symbols = req.nextUrl.searchParams.get('symbols')?.split(',') || [];
  
  // Call market data aggregator instead of Alpaca
  const response = await fetch('http://market-data-server:3001/quotes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbols })
  });
  
  const data = await response.json();
  return NextResponse.json(data);
}
```

## 💰 Cost Estimate

**Railway/Render:**
- Redis: $5-10/month
- Server: $5-10/month
- **Total: $10-20/month**

**Handles unlimited users** querying the same data!

## 🔍 Monitoring

### Logs
```bash
# Docker Compose
docker-compose logs -f market-data-server

# Docker
docker logs -f market-data-server

# Local
npm start
```

### Health Check
```bash
curl http://localhost:3001/health
```

### Stats
```bash
curl http://localhost:3001/stats
```

## 🆘 Troubleshooting

### Alpaca won't connect
- Verify API keys are correct
- Check if using paper trading keys (not live keys)
- Ensure market is open or use paper trading

### Redis connection failed
- Check Redis is running: `redis-cli ping`
- Verify REDIS_HOST and REDIS_PORT
- Check firewall rules

### No data in cache
- Wait 2-3 seconds after subscribing to symbols
- Check Alpaca connection in `/health`
- Verify market hours

### High memory usage
- Reduce CACHE_TTL
- Reduce DEFAULT_SYMBOLS
- Increase Redis max memory and eviction policy

## 📚 Architecture

```
┌─────────────────────────────────────────────────┐
│           Multiple Next.js Users                │
│  User1, User2, User3, ..., UserN                │
└─────────────────┬───────────────────────────────┘
                  │ HTTP REST
                  ▼
┌─────────────────────────────────────────────────┐
│       Market Data Aggregator (This Service)     │
│  ┌──────────────┐      ┌──────────────┐        │
│  │   Express    │◄────►│    Redis     │        │
│  │   REST API   │      │    Cache     │        │
│  └──────┬───────┘      └──────────────┘        │
│         │                                        │
│  ┌──────▼────────┐                              │
│  │  Alpaca Stream│                              │
│  │   WebSocket   │                              │
│  └───────────────┘                              │
└────────┬────────────────────────────────────────┘
         │ Single WebSocket
         ▼
┌─────────────────────────────────────────────────┐
│           Alpaca Markets API                    │
│        Real-time Market Data Feed               │
└─────────────────────────────────────────────────┘
```

## 📝 Notes

- Automatically subscribes to symbols on first request
- Keeps last 100 bars per symbol in Redis
- Cache automatically expires after TTL
- Graceful shutdown on SIGTERM/SIGINT
- Health checks for monitoring

## 🔄 Updates

To update to latest version:

```bash
git pull
npm install
docker-compose down
docker-compose up -d --build
```

