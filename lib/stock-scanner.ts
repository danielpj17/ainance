/**
 * Stock Scanner for finding best scalping candidates
 * Scans for high liquidity, volatility, and volume
 */

export interface ScalpingCandidate {
  symbol: string;
  price: number;
  volume: number;
  avg_volume_20d: number;
  volume_ratio: number;
  volatility: number;
  spread_pct: number;
  market_cap?: number;
  score: number; // Composite scalping score (0-100)
}

// Curated list of liquid stocks good for scalping
const SCALPING_UNIVERSE = [
  // Mega Cap Tech
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'NFLX', 'AMD', 'INTC',
  // High Volume Large Caps
  'SPY', 'QQQ', 'IWM', 'DIA', 'VOO', // ETFs
  'JPM', 'BAC', 'WFC', 'C', 'GS', // Banks
  'XOM', 'CVX', 'COP', // Energy
  'JNJ', 'UNH', 'PFE', 'ABBV', 'MRK', // Healthcare
  'WMT', 'HD', 'COST', 'TGT', // Retail
  'DIS', 'CMCSA', // Media
  'BA', 'CAT', 'GE', // Industrials
  // High Volatility Momentum
  'COIN', 'RIOT', 'MARA', 'SQ', 'PYPL', 'SHOP', // Fintech/Crypto
  'PLTR', 'SNOW', 'DDOG', 'NET', 'CRWD', // Cloud/Software
  'NIO', 'LCID', 'RIVN', // EV
  'PLUG', 'FCEL', 'ENPH', // Clean Energy
  // Additional High Volume
  'F', 'GM', 'UBER', 'LYFT', 'DASH', 'ABNB',
  'V', 'MA', 'AXP', 'SCHW',
  'ORCL', 'IBM', 'CSCO', 'CRM',
  // Volatility/Momentum ETFs
  'TQQQ', 'SQQQ', 'SPXL', 'SPXS'
];

export class StockScanner {
  private alpacaClient: any;

  constructor(alpacaClient: any) {
    this.alpacaClient = alpacaClient;
  }

  /**
   * Scan universe for best scalping candidates
   * RATE LIMIT AWARE: Processes in small batches with delays
   */
  public async scanForCandidates(maxSymbols = 20): Promise<ScalpingCandidate[]> {
    console.log(`🔍 Scanning ${SCALPING_UNIVERSE.length} stocks for scalping opportunities...`);

    const candidates: ScalpingCandidate[] = [];
    const batchSize = 5; // Reduced from 10 to avoid rate limits
    let requestCount = 0;
    const maxRequests = 150; // Stay well under 200/min limit

    // Process in batches to avoid rate limits
    for (let i = 0; i < SCALPING_UNIVERSE.length; i += batchSize) {
      // Stop if we've made too many requests
      if (requestCount >= maxRequests) {
        console.log(`⚠️  Rate limit protection: Stopped at ${requestCount} requests`);
        break;
      }
      
      const batch = SCALPING_UNIVERSE.slice(i, i + batchSize);
      
      const batchResults = await Promise.allSettled(
        batch.map(symbol => this.evaluateSymbol(symbol))
      );

      for (const result of batchResults) {
        if (result.status === 'fulfilled' && result.value) {
          candidates.push(result.value);
        }
      }
      
      requestCount += batchSize * 2; // Each symbol needs ~2 API calls (quote + bars)

      // Longer delay between batches to respect rate limits
      if (i + batchSize < SCALPING_UNIVERSE.length) {
        await new Promise(resolve => setTimeout(resolve, 500)); // Increased from 100ms
      }
      
      // If we have enough good candidates, stop early
      if (candidates.length >= maxSymbols * 2) {
        console.log(`✅ Found ${candidates.length} candidates early, stopping scan`);
        break;
      }
    }

    // Sort by scalping score (descending)
    candidates.sort((a, b) => b.score - a.score);

    console.log(`✅ Found ${candidates.length} valid scalping candidates from ${requestCount} API requests`);
    
    if (candidates.length > 0) {
      const top5 = candidates.slice(0, 5);
      console.log(`🎯 Top 5 candidates:`);
      top5.forEach((c, i) => {
        console.log(`   ${i + 1}. ${c.symbol}: Score ${c.score.toFixed(1)}, Vol ${c.volume_ratio.toFixed(2)}x, Volatility ${c.volatility.toFixed(2)}%`);
      });
    }

    return candidates.slice(0, maxSymbols);
  }

  /**
   * Evaluate a single symbol for scalping potential
   */
  private async evaluateSymbol(symbol: string): Promise<ScalpingCandidate | null> {
    try {
      // Get latest quote for current price
      const latestQuote = await this.alpacaClient.getLatestQuote(symbol);
      
      if (!latestQuote || !latestQuote.bp || !latestQuote.ap) {
        return null;
      }

      const price = (latestQuote.bp + latestQuote.ap) / 2;
      const spread_pct = ((latestQuote.ap - latestQuote.bp) / latestQuote.ap) * 100;

      // Get recent bars for volume and volatility analysis (last 30 5-min bars = 2.5 hours)
      const bars = await this.alpacaClient.getBars(symbol, '5Min', 30);
      
      if (!bars || bars.length < 10) {
        return null;
      }

      // Latest volume
      const latestBar = bars[bars.length - 1];
      const volume = latestBar.v;

      // Calculate average volume (use all available bars)
      const volumes = bars.map((b: any) => b.v);
      const avg_volume = volumes.reduce((a: number, b: number) => a + b, 0) / volumes.length;
      const volume_ratio = avg_volume > 0 ? volume / avg_volume : 1;

      // Calculate volatility (standard deviation of returns)
      const prices = bars.map((b: any) => b.c);
      if (prices.length < 2) {
        return null;
      }

      const returns = [];
      for (let i = 1; i < prices.length; i++) {
        const ret = (prices[i] - prices[i - 1]) / prices[i - 1];
        if (isFinite(ret)) {
          returns.push(ret);
        }
      }

      if (returns.length === 0) {
        return null;
      }

      const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
      const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
      const volatility = Math.sqrt(variance) * 100; // As percentage

      // Filter criteria
      if (price < 5 || price > 1000) return null; // Price range
      if (avg_volume < 50000) return null; // Min volume threshold
      if (spread_pct > 1.0) return null; // Max spread 1%
      if (volatility < 0.2 || volatility > 15) return null; // Volatility range
      if (!isFinite(volatility) || isNaN(volatility)) return null;

      // Calculate scalping score (0-100)
      let score = 0;
      
      // Volume score (30 points) - higher volume ratio is better
      const volScore = Math.min(volume_ratio * 15, 30);
      score += volScore;
      
      // Volatility score (30 points) - sweet spot around 1-3%
      let volScore2 = 0;
      if (volatility >= 1 && volatility <= 3) {
        volScore2 = 30;
      } else if (volatility >= 0.5 && volatility < 1) {
        volScore2 = 20;
      } else if (volatility > 3 && volatility <= 5) {
        volScore2 = 20;
      } else {
        volScore2 = Math.max(0, 15 - Math.abs(2 - volatility) * 3);
      }
      score += volScore2;
      
      // Spread score (20 points) - tighter is better
      const spreadScore = Math.max(0, 20 - spread_pct * 20);
      score += spreadScore;
      
      // Liquidity score (20 points) - based on average volume
      const liquidityScore = Math.min((avg_volume / 100000) * 2, 20);
      score += liquidityScore;

      return {
        symbol,
        price,
        volume,
        avg_volume_20d: avg_volume,
        volume_ratio,
        volatility,
        spread_pct,
        score: Math.round(score * 10) / 10 // Round to 1 decimal
      };
    } catch (error) {
      // Silently fail for individual symbols
      return null;
    }
  }

  /**
   * Get focused list for immediate trading
   */
  public async getTopScalpingStocks(count = 10): Promise<string[]> {
    const candidates = await this.scanForCandidates(count);
    return candidates.map(c => c.symbol);
  }

  /**
   * Get full candidate details for analysis
   */
  public async getTopCandidatesWithDetails(count = 20): Promise<ScalpingCandidate[]> {
    return this.scanForCandidates(count);
  }
}

// Utility function to get default stocks if scanner fails
export function getDefaultScalpingStocks(): string[] {
  return ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'SPY', 'QQQ', 'AMD', 'META', 'AMZN', 'GOOGL'];
}

