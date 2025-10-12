/**
 * Stock Technical Indicators API
 * Fetches real stock data from Alpaca and calculates technical indicators
 */

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const ALPACA_KEY = process.env.ALPACA_PAPER_KEY;
const ALPACA_SECRET = process.env.ALPACA_PAPER_SECRET;
const ALPACA_BASE_URL = 'https://data.alpaca.markets';

interface StockData {
  symbol: string;
  price: number;
  rsi: number;
  macd: number;
  macd_histogram: number;
  bb_width: number;
  bb_position: number;
  ema_trend: number;
  volume_ratio: number;
  stochastic: number;
  price_change_1d: number;
  price_change_5d: number;
  price_change_10d: number;
  volatility_20: number;
  news_sentiment: number;
}

/**
 * Calculate RSI (Relative Strength Index)
 */
function calculateRSI(prices: number[], period = 14): number {
  if (prices.length < period + 1) return 50; // Default neutral

  let gains = 0;
  let losses = 0;

  // Calculate initial average gain/loss
  for (let i = 1; i <= period; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  // Calculate RSI using smoothed averages
  for (let i = period + 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) {
      avgGain = (avgGain * (period - 1) + change) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) + Math.abs(change)) / period;
    }
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

/**
 * Calculate MACD (Moving Average Convergence Divergence)
 */
function calculateMACD(prices: number[]): { macd: number; histogram: number } {
  if (prices.length < 26) return { macd: 0, histogram: 0 };

  // Calculate EMAs
  const ema12 = calculateEMA(prices, 12);
  const ema26 = calculateEMA(prices, 26);
  const macd = ema12 - ema26;

  // Signal line (9-period EMA of MACD)
  const macdValues = [macd]; // Simplified - would need more history
  const signal = macd * 0.2; // Simplified signal

  return { macd, histogram: macd - signal };
}

/**
 * Calculate EMA (Exponential Moving Average)
 */
function calculateEMA(prices: number[], period: number): number {
  if (prices.length < period) return prices[prices.length - 1];

  const k = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;

  for (let i = period; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }

  return ema;
}

/**
 * Calculate Bollinger Bands
 */
function calculateBollingerBands(prices: number[], period = 20): { width: number; position: number } {
  if (prices.length < period) return { width: 0.02, position: 0.5 };

  const recentPrices = prices.slice(-period);
  const sma = recentPrices.reduce((a, b) => a + b, 0) / period;
  const variance = recentPrices.reduce((sum, price) => sum + Math.pow(price - sma, 2), 0) / period;
  const stdDev = Math.sqrt(variance);

  const upper = sma + (2 * stdDev);
  const lower = sma - (2 * stdDev);
  const current = prices[prices.length - 1];

  const width = (upper - lower) / sma;
  const position = (current - lower) / (upper - lower);

  return { width, position: Math.max(0, Math.min(1, position)) };
}

/**
 * Calculate Stochastic Oscillator
 */
function calculateStochastic(prices: number[], period = 14): number {
  if (prices.length < period) return 50;

  const recentPrices = prices.slice(-period);
  const high = Math.max(...recentPrices);
  const low = Math.min(...recentPrices);
  const current = prices[prices.length - 1];

  if (high === low) return 50;
  return ((current - low) / (high - low)) * 100;
}

/**
 * Fetch historical bars from Alpaca
 */
async function fetchAlpacaBars(symbol: string, limit = 100): Promise<number[]> {
  const url = `${ALPACA_BASE_URL}/v2/stocks/${symbol}/bars?timeframe=1Day&limit=${limit}&feed=iex`;
  
  const response = await fetch(url, {
    headers: {
      'APCA-API-KEY-ID': ALPACA_KEY!,
      'APCA-API-SECRET-KEY': ALPACA_SECRET!,
    },
  });

  if (!response.ok) {
    throw new Error(`Alpaca API error: ${response.status}`);
  }

  const data = await response.json();
  
  if (!data.bars || data.bars.length === 0) {
    throw new Error(`No data for ${symbol}`);
  }

  return data.bars.map((bar: any) => bar.c); // Close prices
}

/**
 * Fetch latest quote from Alpaca
 */
async function fetchLatestQuote(symbol: string): Promise<number> {
  const url = `${ALPACA_BASE_URL}/v2/stocks/${symbol}/trades/latest?feed=iex`;
  
  const response = await fetch(url, {
    headers: {
      'APCA-API-KEY-ID': ALPACA_KEY!,
      'APCA-API-SECRET-KEY': ALPACA_SECRET!,
    },
  });

  if (!response.ok) {
    throw new Error(`Alpaca API error: ${response.status}`);
  }

  const data = await response.json();
  return data.trade?.p || 0;
}

/**
 * Calculate all technical indicators for a symbol
 */
async function calculateIndicators(symbol: string): Promise<StockData> {
  try {
    // Fetch historical data
    const prices = await fetchAlpacaBars(symbol, 100);
    const currentPrice = await fetchLatestQuote(symbol);

    // Calculate indicators
    const rsi = calculateRSI(prices);
    const { macd, histogram } = calculateMACD(prices);
    const { width, position } = calculateBollingerBands(prices);
    const stochastic = calculateStochastic(prices);

    // Calculate price changes
    const price_change_1d = prices.length >= 2 ? ((prices[prices.length - 1] - prices[prices.length - 2]) / prices[prices.length - 2]) * 100 : 0;
    const price_change_5d = prices.length >= 6 ? ((prices[prices.length - 1] - prices[prices.length - 6]) / prices[prices.length - 6]) * 100 : 0;
    const price_change_10d = prices.length >= 11 ? ((prices[prices.length - 1] - prices[prices.length - 11]) / prices[prices.length - 11]) * 100 : 0;

    // Calculate volatility (20-day standard deviation)
    const recentPrices = prices.slice(-20);
    const avgPrice = recentPrices.reduce((a, b) => a + b, 0) / recentPrices.length;
    const variance = recentPrices.reduce((sum, price) => sum + Math.pow(price - avgPrice, 2), 0) / recentPrices.length;
    const volatility_20 = Math.sqrt(variance) / avgPrice;

    // EMA trend (simplified: 1 if price > EMA50, 0 otherwise)
    const ema50 = calculateEMA(prices, 50);
    const ema_trend = currentPrice > ema50 ? 1 : 0;

    // Volume ratio (simplified - would need volume data)
    const volume_ratio = 1.0;

    return {
      symbol,
      price: currentPrice,
      rsi: Math.round(rsi * 100) / 100,
      macd: Math.round(macd * 10000) / 10000,
      macd_histogram: Math.round(histogram * 10000) / 10000,
      bb_width: Math.round(width * 100) / 100,
      bb_position: Math.round(position * 100) / 100,
      ema_trend,
      volume_ratio,
      stochastic: Math.round(stochastic * 100) / 100,
      price_change_1d: Math.round(price_change_1d * 100) / 100,
      price_change_5d: Math.round(price_change_5d * 100) / 100,
      price_change_10d: Math.round(price_change_10d * 100) / 100,
      volatility_20: Math.round(volatility_20 * 10000) / 10000,
      news_sentiment: 0, // Would need news API
    };
  } catch (error: any) {
    console.error(`Error calculating indicators for ${symbol}:`, error);
    throw error;
  }
}

/**
 * POST - Get technical indicators for multiple symbols
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    if (!ALPACA_KEY || !ALPACA_SECRET) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Alpaca API keys not configured. Please add ALPACA_PAPER_KEY and ALPACA_PAPER_SECRET to your environment variables.' 
        },
        { status: 500 }
      );
    }

    const { symbols } = await req.json();

    if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
      return NextResponse.json(
        { success: false, error: 'symbols array is required' },
        { status: 400 }
      );
    }

    // Calculate indicators for all symbols in parallel
    const results = await Promise.allSettled(
      symbols.map((symbol: string) => calculateIndicators(symbol.toUpperCase()))
    );

    const indicators: StockData[] = [];
    const errors: string[] = [];

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        indicators.push(result.value);
      } else {
        errors.push(`${symbols[index]}: ${result.reason.message}`);
      }
    });

    return NextResponse.json({
      success: true,
      indicators,
      errors: errors.length > 0 ? errors : undefined,
    });

  } catch (error: any) {
    console.error('Indicators API error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to calculate indicators' },
      { status: 500 }
    );
  }
}
