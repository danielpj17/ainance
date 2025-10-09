# 🚀 Quick Start Guide - Ainance Trading Platform

## Setup Required Environment Variables

You need to configure your `.env.local` file with the following services:

### 1️⃣ Supabase Setup (Required)

Supabase provides authentication and database for your trading platform.

**Steps:**
1. Go to [https://supabase.com](https://supabase.com) and create a free account
2. Create a new project (takes 2-3 minutes to provision)
3. Go to Project Settings → API
4. Copy the values to your `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
```

5. Run the database migrations:
```bash
cd supabase
# Make sure you have Supabase CLI installed: npm install -g supabase
supabase db push
```

### 2️⃣ Alpaca Trading API (Required for Trading)

Alpaca provides free paper trading (no real money).

**Steps:**
1. Go to [https://alpaca.markets](https://alpaca.markets)
2. Sign up for a free account
3. Go to Dashboard → Paper Trading → Generate API Keys
4. Copy to `.env.local`:

```bash
ALPACA_PAPER_KEY=your-paper-key
ALPACA_PAPER_SECRET=your-paper-secret
```

### 3️⃣ NewsAPI (Optional - for AI Sentiment)

NewsAPI provides news headlines for sentiment analysis.

**Steps:**
1. Go to [https://newsapi.org/register](https://newsapi.org/register)
2. Sign up (free tier: 100 requests/day)
3. Copy your API key to `.env.local`:

```bash
NEWS_API_KEY=your-news-api-key
```

---

## 🏃 Running the App

Once you've configured `.env.local`:

```bash
# Install dependencies (if not done)
npm install

# Start development server
npm run dev
```

Visit: **http://localhost:3000** (or the port shown in terminal)

---

## 📁 Project Structure

```
ainance/
├── app/
│   ├── dashboard/          # Main trading dashboards
│   │   ├── page.tsx        # Analytics dashboard
│   │   ├── trade/          # Trade terminal
│   │   ├── paper/          # Paper trading
│   │   ├── live/           # Live trading
│   │   └── backtest/       # Backtesting
│   ├── api/                # Backend API routes
│   │   ├── account/        # Alpaca account data
│   │   ├── market/         # Market data
│   │   ├── trade/          # Execute trades
│   │   └── trading/        # AI trading bot
│   └── auth/               # Authentication
├── components/
│   ├── Sidebar.tsx         # Navigation sidebar
│   ├── TradingBot.tsx      # AI bot component
│   └── ui/                 # Shadcn UI components
├── lib/
│   ├── alpaca-client.ts    # Alpaca API wrapper
│   ├── trading-model.ts    # AI trading model
│   └── news-sentiment.ts   # News sentiment analyzer
└── supabase/
    └── migrations/         # Database schemas
```

---

## 🎯 First Steps After Setup

1. **Create Account**: Go to `/auth` and sign up
2. **Add API Keys**: In the app, go to Settings and add your Alpaca keys
3. **Start Trading Bot**: Go to Paper Trading → Start Bot
4. **View AI Signals**: Check Trade Terminal for live AI recommendations
5. **Execute Trades**: Use the Trade Terminal to place orders

---

## 🔧 Database Setup (First Time Only)

If you haven't run migrations yet:

```bash
# Option 1: Using Supabase local
cd /Users/lukesine/Desktop/AI/ainance
npm run start:supabase

# Option 2: Using Supabase CLI
supabase link --project-ref your-project-id
supabase db push
```

The migrations will create:
- User authentication tables
- Trading settings
- Trade history
- AI predictions
- Bot logs
- Encrypted API key storage

---

## 🆘 Troubleshooting

### "supabaseUrl is required"
- Make sure `.env.local` exists with correct Supabase URLs
- Restart the dev server after adding env variables

### "Unauthorized" errors
- Check that your Supabase keys are correct
- Make sure you've signed up at `/auth`

### API Keys not working
- Verify keys in Supabase dashboard → Table Editor → api_keys
- Make sure to use Paper Trading keys first (no real money)

### Build errors
- Run `npm install` to ensure all dependencies are installed
- Clear `.next` folder: `rm -rf .next && npm run build`

---

## 📚 Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [Supabase Documentation](https://supabase.com/docs)
- [Alpaca API Documentation](https://alpaca.markets/docs/)
- [TensorFlow.js](https://www.tensorflow.org/js)

---

## 🎨 Tech Stack

- **Framework**: Next.js 15 + Turbopack
- **Database**: Supabase (PostgreSQL)
- **Trading API**: Alpaca Markets
- **AI/ML**: TensorFlow.js
- **Charts**: Recharts
- **UI**: Tailwind CSS + Shadcn UI
- **Sentiment**: VADER Sentiment + NewsAPI

---

Need help? Check the terminal output for detailed error messages!


