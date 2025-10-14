# 🚀 Complete Deployment Guide - Multi-User Real-Time Trading Platform

This guide walks you through deploying a **production-grade, scalable, multi-user trading platform** with real-time data and ML predictions.

## 📋 Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    USERS (Unlimited)                             │
│         Browser ↔ WebSocket/SSE ↔ Real-time Updates            │
└────────────────────────┬────────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────────┐
│              FRONTEND (Vercel - Free Tier)                      │
│  • Next.js 14 with App Router                                   │
│  • Real-time SSE streaming                                       │
│  • User authentication (Supabase Auth)                          │
│  • Per-user watchlists and trading                              │
└───┬─────────────┬──────────────┬─────────────────┬─────────────┘
    │             │              │                 │
    │             │              │                 │
┌───▼────────┐ ┌──▼──────────┐ ┌▼──────────────┐ ┌▼─────────────┐
│  Supabase  │ │  Market     │ │  ML Service   │ │   Alpaca     │
│  (Free)    │ │  Data       │ │  (GCP)        │ │   Markets    │
│            │ │  Aggregator │ │               │ │              │
│  • Auth    │ │  (Railway)  │ │  • Random     │ │  • Real-time │
│  • DB      │ │             │ │    Forest     │ │    Market    │
│  • Storage │ │  • Redis    │ │  • FastAPI    │ │    Data      │
│  • RLS     │ │  • WebSocket│ │  • Docker     │ │  • Trading   │
└────────────┘ └─────────────┘ └───────────────┘ └──────────────┘
```

## 💰 Cost Breakdown

| Service | Tier | Cost | Usage |
|---------|------|------|-------|
| **Vercel** | Free | $0 | Hosting Next.js app |
| **Supabase** | Free | $0 | Auth, DB, Storage (500MB DB, 1GB storage) |
| **Google Cloud Run** | Free | $0-5 | ML inference (2M requests/month free) |
| **Railway** | Free | $5 | Market data server + Redis |
| **Alpaca** | Free | $0 | Paper trading (basic data feed) |
| **TOTAL (Development)** | | **$5-10/month** | Unlimited users |

### Production Upgrade Path

For production with >100 users:
- **Polygon.io**: $29/mo (unlimited real-time data)
- **Railway**: $10-20/mo (scale up)
- **Google Cloud Run**: $10-20/mo (beyond free tier)
- **Total**: $50-70/month for unlimited users with professional data

---

## 🎯 Phase 1: Database Setup (Supabase)

### 1.1 Create Supabase Project

1. Go to [supabase.com](https://supabase.com)
2. Create new project
3. Save your credentials:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`

### 1.2 Run Database Migrations

```bash
# Install Supabase CLI
npm install -g supabase

# Link to your project
supabase link --project-ref your-project-ref

# Apply migrations
supabase db push

# Or manually run migrations in SQL Editor:
# 1. 202510081400_create_tables.sql
# 2. 202510081500_add_validation.sql
# 3. 202510081600_add_trading_tables.sql
# 4. 202510081700_add_encryption.sql
# 5. 20251011000_add_ml_cache.sql
# 6. 20251011001_add_watchlists.sql
# 7. 20251011002_add_rate_limits.sql
```

### 1.3 Create Storage Buckets

```sql
-- In Supabase SQL Editor
INSERT INTO storage.buckets (id, name, public)
VALUES ('models', 'models', false);

-- Set up RLS policy for models bucket
CREATE POLICY "Service role can access models"
ON storage.objects FOR ALL
TO service_role
USING (bucket_id = 'models');
```

---

## 🎯 Phase 2: Train ML Model

### 2.1 Setup Python Environment

```bash
cd python-functions
pip install -r requirements.txt
```

### 2.2 Configure Environment

Create `.env` file:
```bash
# Alpaca API Keys
ALPACA_PAPER_KEY=your_paper_key
ALPACA_PAPER_SECRET=your_paper_secret

# Supabase
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### 2.3 Train the Model

```bash
python train_model.py
```

This will:
- ✅ Fetch 5 years of historical data from Alpaca
- ✅ Calculate 13 technical indicators
- ✅ Train Random Forest on 10 major stocks
- ✅ Save model locally and upload to Supabase
- ⏱️ Takes ~10-15 minutes

Expected output:
```
✅ Training accuracy: 0.85-0.90
✅ Test accuracy: 0.75-0.85
✅ Model size: 5-20 MB
```

---

## 🎯 Phase 3: Deploy ML Service (Google Cloud Run)

### 3.1 Setup Google Cloud

```bash
# Install gcloud CLI
# Follow: https://cloud.google.com/sdk/docs/install

# Login
gcloud auth login

# Create project (or use existing)
gcloud projects create your-project-id

# Set project
gcloud config set project your-project-id

# Enable APIs
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com
```

### 3.2 Copy Model to ML Service

```bash
# Copy trained model
cp python-functions/scalping_model_v2.pkl ml-service/
```

### 3.3 Deploy to Cloud Run

```bash
cd ml-service

# Deploy
gcloud run deploy trading-ml-service \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 2 \
  --timeout 60 \
  --max-instances 10 \
  --min-instances 0

# Get service URL
gcloud run services describe trading-ml-service \
  --platform managed \
  --region us-central1 \
  --format 'value(status.url)'
```

Save the URL as `ML_SERVICE_URL`

### 3.4 Test ML Service

```bash
# Test health
curl https://your-ml-service-url.run.app/health

# Test prediction
python test_service.py https://your-ml-service-url.run.app
```

---

## 🎯 Phase 4: Deploy Market Data Aggregator (Railway)

### 4.1 Setup Railway Account

1. Go to [railway.app](https://railway.app)
2. Sign up with GitHub
3. Create new project

### 4.2 Add Redis

1. In Railway project → "New Service"
2. Select "Database" → "Redis"
3. Note the connection details

### 4.3 Deploy Market Data Server

Option A: Deploy from GitHub (Recommended)

```bash
# Push to GitHub
git add market-data-server/
git commit -m "Add market data aggregator"
git push

# In Railway:
# 1. New Service → GitHub Repo
# 2. Select your repo
# 3. Set root directory: market-data-server
```

Option B: Deploy via Railway CLI

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Link project
railway link

# Deploy
cd market-data-server
railway up
```

### 4.4 Configure Environment Variables

In Railway project settings, add:

```
PORT=3001
ALPACA_PAPER_KEY=your_paper_key
ALPACA_PAPER_SECRET=your_paper_secret
REDIS_HOST=redis.railway.internal
REDIS_PORT=6379
CACHE_TTL=2
DEFAULT_SYMBOLS=SPY,QQQ,AAPL,TSLA,NVDA,MSFT,GOOGL,META,AMZN,AMD
```

### 4.5 Test Market Data Server

```bash
# Get your Railway URL
railway domain

# Test
curl https://your-market-data.railway.app/health
```

---

## 🎯 Phase 5: Deploy Frontend (Vercel)

### 5.1 Configure Environment Variables

Create `.env.local`:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Alpaca (for per-user trading)
ALPACA_PAPER_KEY=your_paper_key
ALPACA_PAPER_SECRET=your_paper_secret

# Services
MARKET_DATA_AGGREGATOR_URL=https://your-market-data.railway.app
ML_SERVICE_URL=https://your-ml-service.run.app

# Configuration
MARKET_UPDATE_INTERVAL=2000
ML_CACHE_TTL=30
```

### 5.2 Deploy to Vercel

Option A: Deploy via Vercel CLI

```bash
# Install Vercel CLI
npm install -g vercel

# Login
vercel login

# Deploy
vercel

# Deploy to production
vercel --prod
```

Option B: Deploy via GitHub

1. Push code to GitHub
2. Go to [vercel.com](https://vercel.com)
3. "Import Project" → Select your GitHub repo
4. Add environment variables
5. Deploy

### 5.3 Add Environment Variables in Vercel

In Vercel Dashboard → Your Project → Settings → Environment Variables

Add all variables from `.env.local`

---

## 🎯 Phase 6: Test Complete System

### 6.1 Health Checks

```bash
# Frontend
curl https://your-app.vercel.app/api/health

# ML Service
curl https://your-ml-service.run.app/health

# Market Data
curl https://your-market-data.railway.app/health
```

### 6.2 Test Trading Flow

1. **Sign up** at https://your-app.vercel.app/auth
2. **Configure API keys** in Settings
3. **Create watchlist** with symbols
4. **View real-time prices** on dashboard
5. **Get ML predictions**
6. **Execute paper trade**

### 6.3 Monitor Performance

```sql
-- In Supabase SQL Editor

-- Check performance stats
SELECT * FROM get_performance_stats();

-- Check rate limits
SELECT * FROM rate_limits 
WHERE window_end > NOW() 
ORDER BY count DESC;

-- Check ML cache hits
SELECT 
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE expires_at > NOW()) as active
FROM ml_predictions_cache;
```

---

## 🔧 Configuration & Optimization

### Real-Time Update Frequency

Adjust `MARKET_UPDATE_INTERVAL`:
- **Scalping**: 1000-2000ms (1-2 seconds)
- **Day Trading**: 2000-5000ms (2-5 seconds)
- **Swing Trading**: 10000-30000ms (10-30 seconds)

### ML Cache TTL

Adjust `ML_CACHE_TTL`:
- **Frequent predictions**: 30 seconds
- **Moderate**: 60 seconds
- **Conservative**: 120 seconds

Lower = more accurate, higher cost
Higher = less accurate, lower cost

### Rate Limiting

Default limits (per user):
- `/api/trade`: 10 requests/minute
- `/api/ml/predict`: 30 requests/minute
- `/api/market-stream`: 1 connection per user

Adjust in `lib/rate-limiter.ts`

---

## 🎯 Post-Deployment Checklist

- [ ] All services health checks passing
- [ ] Real-time prices updating every 2 seconds
- [ ] ML predictions returning in <500ms
- [ ] Users can create accounts and login
- [ ] API keys can be configured
- [ ] Trades execute successfully (paper trading)
- [ ] Watchlists working
- [ ] SSE connection stable
- [ ] Database migrations applied
- [ ] Monitoring and rate limiting active

---

## 🐛 Troubleshooting

### ML Service Returns 503

**Problem**: ML service not responding

**Solutions**:
1. Check if model file exists in ml-service/
2. Verify Cloud Run deployment succeeded
3. Check logs: `gcloud run services logs read trading-ml-service`
4. Ensure 2GB memory allocated

### Real-time Prices Not Updating

**Problem**: SSE connection failing

**Solutions**:
1. Check market data aggregator is running
2. Verify MARKET_DATA_AGGREGATOR_URL is correct
3. Check Railway logs
4. Ensure Redis is connected
5. Verify Alpaca WebSocket connected

### Rate Limit Errors

**Problem**: Users hitting rate limits

**Solutions**:
1. Increase rate limits in code
2. Add ML cache to reduce prediction calls
3. Batch API requests
4. Implement request queuing

### High Costs

**Problem**: Exceeding free tiers

**Solutions**:
1. Increase ML cache TTL (reduce Cloud Run calls)
2. Reduce SSE update frequency
3. Optimize database queries
4. Implement query result caching
5. Use Polygon.io for shared data feed

---

## 📊 Monitoring Dashboard

### Key Metrics to Track

1. **API Performance**
   - Response times (p50, p95, p99)
   - Error rates
   - Request volumes

2. **ML Service**
   - Prediction latency
   - Cache hit rate
   - Inference cost

3. **Market Data**
   - WebSocket uptime
   - Data freshness
   - Symbols tracked

4. **User Activity**
   - Active users
   - Trades per day
   - Watchlist usage

### View Metrics

```sql
-- Performance stats (last 24 hours)
SELECT * FROM get_performance_stats(NULL, 24);

-- ML cache effectiveness
SELECT 
  (COUNT(*) FILTER (WHERE expires_at > NOW()) * 100.0 / NULLIF(COUNT(*), 0))::NUMERIC(10,2) as cache_hit_rate_percent
FROM ml_predictions_cache;

-- Active users
SELECT COUNT(DISTINCT user_id) as active_users
FROM performance_metrics
WHERE created_at >= NOW() - INTERVAL '24 hours';
```

---

## 🚀 Scaling for Production

### 100-1,000 Users

**Changes needed**:
- ✅ Upgrade to Polygon.io ($29/mo)
- ✅ Railway: Scale to $10-20/mo
- ✅ Keep Vercel, Supabase, Cloud Run free tiers

**Total cost**: ~$40-50/month

### 1,000-10,000 Users

**Changes needed**:
- ✅ Vercel Pro ($20/mo)
- ✅ Supabase Pro ($25/mo)
- ✅ Polygon Advanced ($99/mo)
- ✅ Railway: Scale to $50/mo
- ✅ Google Cloud Run: $20-50/mo

**Total cost**: ~$200-250/month

### 10,000+ Users

**Enterprise setup**:
- ✅ Vercel Enterprise
- ✅ Supabase Team/Enterprise
- ✅ Polygon Enterprise
- ✅ Dedicated servers (Kubernetes)
- ✅ CDN (CloudFlare)
- ✅ Advanced monitoring (DataDog)

---

## 📚 Additional Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [Supabase Documentation](https://supabase.com/docs)
- [Google Cloud Run Documentation](https://cloud.google.com/run/docs)
- [Railway Documentation](https://docs.railway.app)
- [Alpaca API Documentation](https://alpaca.markets/docs)
- [Polygon.io Documentation](https://polygon.io/docs)

---

## 🎉 Congratulations!

You now have a **production-grade, scalable, multi-user trading platform** with:

✅ Real-time market data (<2 second updates)
✅ ML-powered predictions (Random Forest with real data)
✅ Per-user authentication and isolation
✅ Unlimited users supported
✅ Rate limiting and monitoring
✅ Sub-$10/month cost for development
✅ Clear path to scale

**Happy Trading! 🚀📈**

