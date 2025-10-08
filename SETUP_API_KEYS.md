# API Keys Setup Guide

To run the ainance trading system, you need to create a `.env.local` file in the root directory with the following API keys:

## Required Environment Variables

Create a file named `.env.local` in the root directory with these variables:

```bash
# Supabase Configuration (Required)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# News API for sentiment analysis (Required)
NEWS_API_KEY=your_newsapi_key_here

# Alpaca Trading API (Optional - for live trading)
ALPACA_API_KEY=your_alpaca_api_key_here
ALPACA_SECRET_KEY=your_alpaca_secret_key_here
ALPACA_PAPER_API_KEY=your_alpaca_paper_api_key_here
ALPACA_PAPER_SECRET_KEY=your_alpaca_paper_secret_key_here
ALPACA_BASE_URL=https://paper-api.alpaca.markets
ALPACA_LIVE_BASE_URL=https://api.alpaca.markets
```

## How to Get API Keys

### 1. Supabase (Required)
1. Go to [supabase.com](https://supabase.com)
2. Create a new project
3. Go to Settings > API
4. Copy the Project URL and anon key
5. Copy the service_role key (keep this secret!)

### 2. NewsAPI (Required for sentiment analysis)
1. Go to [newsapi.org](https://newsapi.org)
2. Sign up for a free account
3. Get your API key from the dashboard
4. Free tier allows 1,000 requests per day

### 3. Alpaca Markets (Optional - for live trading)
1. Go to [alpaca.markets](https://alpaca.markets)
2. Create an account
3. Get your API keys from the dashboard
4. Use paper trading keys for testing

## File Structure

Your project should look like this:
```
ainance/
├── .env.local          # Your API keys (create this file)
├── app/
├── lib/
├── components/
└── ...
```

## Security Notes

- Never commit `.env.local` to git (it's in .gitignore)
- Keep your service role keys secret
- Use paper trading keys for development
- The NewsAPI key is safe to use in client-side code

## Testing the Setup

After adding your API keys, restart the development server:

```bash
npm run dev
```

The trading system will now be able to:
- Connect to Supabase for data storage
- Fetch news sentiment data
- (Optional) Connect to Alpaca for live trading
