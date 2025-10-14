/**
 * FRED (Federal Reserve Economic Data) Integration
 * Fetches macro-economic indicators to enhance ML predictions
 */

export interface FREDIndicators {
  // Interest Rates & Monetary Policy
  fed_funds_rate: number;        // FEDFUNDS - Federal Funds Rate
  treasury_10y: number;          // DGS10 - 10-Year Treasury Rate
  treasury_2y: number;           // DGS2 - 2-Year Treasury Rate
  yield_curve: number;           // Calculated: 10Y - 2Y (recession indicator)
  
  // Inflation & Economic Health
  cpi: number;                   // CPIAUCSL - Consumer Price Index
  pce: number;                   // PCEPI - Personal Consumption Expenditures
  unemployment_rate: number;     // UNRATE - Unemployment Rate
  gdp_growth: number;            // GDP - Real Gross Domestic Product (quarterly)
  
  // Market Sentiment
  vix: number;                   // VIXCLS - VIX Volatility Index
  
  timestamp: string;
  source: 'fred' | 'cache';
}

class FREDDataService {
  private apiKey: string;
  private baseUrl = 'https://api.stlouisfed.org/fred/series/observations';
  private cache: Map<string, { data: number; timestamp: number }> = new Map();
  private cacheTTL = 24 * 60 * 60 * 1000; // 24 hours (FRED updates daily)

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Fetch latest value for a FRED series
   */
  private async fetchSeries(seriesId: string): Promise<number> {
    // Check cache first
    const cached = this.cache.get(seriesId);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      console.log(`Using cached FRED data for ${seriesId}`);
      return cached.data;
    }

    try {
      const url = new URL(this.baseUrl);
      url.searchParams.append('series_id', seriesId);
      url.searchParams.append('api_key', this.apiKey);
      url.searchParams.append('file_type', 'json');
      url.searchParams.append('sort_order', 'desc');
      url.searchParams.append('limit', '1');

      const response = await fetch(url.toString());
      
      if (!response.ok) {
        throw new Error(`FRED API error for ${seriesId}: ${response.status}`);
      }

      const data = await response.json();
      
      if (!data.observations || data.observations.length === 0) {
        throw new Error(`No data for FRED series ${seriesId}`);
      }

      const value = parseFloat(data.observations[0].value);
      
      if (isNaN(value)) {
        throw new Error(`Invalid value for FRED series ${seriesId}`);
      }
      
      // Cache the result
      this.cache.set(seriesId, { data: value, timestamp: Date.now() });
      
      console.log(`Fetched FRED ${seriesId}: ${value}`);
      return value;
    } catch (error) {
      console.error(`Error fetching FRED series ${seriesId}:`, error);
      // Return cached value if available, even if stale
      if (cached) {
        console.log(`Using stale cache for ${seriesId}`);
        return cached.data;
      }
      throw error;
    }
  }

  /**
   * Get all economic indicators
   */
  public async getIndicators(): Promise<FREDIndicators> {
    try {
      console.log('📊 Fetching FRED economic indicators...');
      
      // Fetch all series in parallel
      const [
        fed_funds_rate,
        treasury_10y,
        treasury_2y,
        cpi,
        pce,
        unemployment_rate,
        gdp_growth,
        vix
      ] = await Promise.all([
        this.fetchSeries('FEDFUNDS'),
        this.fetchSeries('DGS10'),
        this.fetchSeries('DGS2'),
        this.fetchSeries('CPIAUCSL'),
        this.fetchSeries('PCEPI'),
        this.fetchSeries('UNRATE'),
        this.fetchSeries('GDP'),
        this.fetchSeries('VIXCLS')
      ]);

      const yield_curve = treasury_10y - treasury_2y;

      console.log('✅ FRED indicators fetched successfully');
      console.log(`   VIX: ${vix.toFixed(2)}, Yield Curve: ${yield_curve.toFixed(2)}, Fed Funds: ${fed_funds_rate.toFixed(2)}%`);

      return {
        fed_funds_rate,
        treasury_10y,
        treasury_2y,
        yield_curve,
        cpi,
        pce,
        unemployment_rate,
        gdp_growth,
        vix,
        timestamp: new Date().toISOString(),
        source: 'fred'
      };
    } catch (error) {
      console.error('❌ Error fetching FRED indicators:', error);
      
      // Return default values if FRED fails
      console.warn('⚠️  Using default economic indicators (FRED unavailable)');
      return {
        fed_funds_rate: 5.0,
        treasury_10y: 4.5,
        treasury_2y: 4.8,
        yield_curve: -0.3,
        cpi: 300,
        pce: 120,
        unemployment_rate: 4.0,
        gdp_growth: 2.5,
        vix: 18,
        timestamp: new Date().toISOString(),
        source: 'cache'
      };
    }
  }

  /**
   * Get market risk score based on FRED data (0-1, higher = more risky)
   */
  public calculateMarketRisk(indicators: FREDIndicators): number {
    let riskScore = 0;

    // VIX (fear index) - normalize to 0-1 (VIX typically 10-80)
    const vixScore = Math.min(indicators.vix / 80, 1) * 0.3;
    riskScore += vixScore;

    // Inverted yield curve (recession indicator)
    if (indicators.yield_curve < 0) {
      riskScore += 0.2;
    } else if (indicators.yield_curve < 0.5) {
      riskScore += 0.1;
    }

    // High unemployment (>5% is concerning)
    if (indicators.unemployment_rate > 5) {
      riskScore += Math.min((indicators.unemployment_rate - 5) / 5, 0.2);
    }

    // Rising Fed Funds Rate (contractionary policy)
    if (indicators.fed_funds_rate > 4) {
      riskScore += 0.15;
    }

    // Cap at 1.0
    const finalRisk = Math.min(riskScore, 1);
    
    console.log(`📈 Market Risk Score: ${(finalRisk * 100).toFixed(1)}% (VIX: ${indicators.vix.toFixed(1)}, Yield: ${indicators.yield_curve.toFixed(2)})`);
    
    return finalRisk;
  }

  /**
   * Get market sentiment classification
   */
  public getMarketSentiment(indicators: FREDIndicators): 'bullish' | 'neutral' | 'bearish' {
    const risk = this.calculateMarketRisk(indicators);
    
    if (risk < 0.3) return 'bullish';
    if (risk < 0.6) return 'neutral';
    return 'bearish';
  }
}

// Singleton instance
let fredService: FREDDataService | null = null;

export function initializeFRED(apiKey: string): FREDDataService {
  if (!fredService) {
    fredService = new FREDDataService(apiKey);
    console.log('✅ FRED service initialized');
  }
  return fredService;
}

export function getFREDService(): FREDDataService {
  if (!fredService) {
    throw new Error('FRED service not initialized. Call initializeFRED first.');
  }
  return fredService;
}

export function isFREDInitialized(): boolean {
  return fredService !== null;
}

