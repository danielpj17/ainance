import { getLLMDecision } from './llm-service';

/**
 * Trading Algorithm Abstraction Layer
 * * This module provides a unified interface for different trading algorithms,
 * allowing the bot to switch between ML models, rule-based strategies, and LLM Agents.
 */

// Types for algorithm inputs and outputs
export type AlgorithmType = 
  | 'ml_model' 
  | 'rule_based_simple' 
  | 'rule_based_advanced'
  | 'gemini_analyst'    // <--- NEW
  | 'llama_technical'   // <--- NEW
  | 'consensus_combined'; // <--- NEW

export interface MarketFeatures {
  symbol: string
  rsi: number
  macd: number
  macd_histogram: number
  bb_width: number
  bb_position: number
  ema_trend: number
  volume_ratio: number
  stochastic: number
  price_change_1d: number
  price_change_5d: number
  price_change_10d: number
  volatility_20: number
  news_sentiment: number
  price: number
}

export interface TradingSignal {
  symbol: string
  action: 'buy' | 'sell' | 'hold'
  confidence: number
  price: number
  reasoning: string
  indicators?: Record<string, number>
  timestamp: string
}

export interface AlgorithmResponse {
  success: boolean
  signals: TradingSignal[]
  model_version?: string
  algorithm_type: AlgorithmType
  error?: string
}

/**
 * Base interface for all trading algorithms
 */
export interface TradingAlgorithm {
  readonly type: AlgorithmType
  readonly name: string
  predict(features: MarketFeatures[]): Promise<AlgorithmResponse>
}

/**
 * ML Model Algorithm - Calls external ML service (Random Forest on Cloud Run)
 */
export class MLModelAlgorithm implements TradingAlgorithm {
  readonly type: AlgorithmType = 'ml_model'
  readonly name = 'ML Model (Random Forest)'
  
  private serviceUrl: string
  
  constructor(serviceUrl?: string) {
    this.serviceUrl = (serviceUrl || process.env.ML_SERVICE_URL || 'http://localhost:8080').replace(/\/$/, '')
  }
  
  async predict(features: MarketFeatures[]): Promise<AlgorithmResponse> {
    try {
      const response = await fetch(`${this.serviceUrl}/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          features: features,
          include_probabilities: true
        }),
        signal: AbortSignal.timeout(30000) // 30 second timeout for cold starts
      })
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'No error details')
        throw new Error(`ML service returned ${response.status}: ${errorText.substring(0, 200)}`)
      }
      
      const data = await response.json()
      
      if (!data.success || !data.signals) {
        throw new Error(data.error || 'ML service returned invalid response')
      }
      
      return {
        success: true,
        signals: data.signals,
        model_version: data.model_version || 'unknown',
        algorithm_type: this.type
      }
    } catch (error: any) {
      console.error('❌ ML Model Algorithm error:', error)
      return {
        success: false,
        signals: [],
        algorithm_type: this.type,
        error: error.message || 'ML service failed'
      }
    }
  }
}

/**
 * Simple Rule-Based Algorithm
 */
export class SimpleRuleBasedAlgorithm implements TradingAlgorithm {
  readonly type: AlgorithmType = 'rule_based_simple'
  readonly name = 'Rule-Based (Simple)'
  
  async predict(features: MarketFeatures[]): Promise<AlgorithmResponse> {
    try {
      const signals: TradingSignal[] = []
      const timestamp = new Date().toISOString()
      
      for (const feature of features) {
        const { rsi, macd, ema_trend, news_sentiment, symbol, price } = feature
        
        let signal: 'buy' | 'sell' | 'hold' = 'hold'
        let confidence = 0.5
        const reasoning_parts: string[] = []
        
        // RSI-based signals
        if (rsi > 70) {
          signal = 'sell'
          confidence = 0.7
          reasoning_parts.push('Overbought (RSI>70)')
        } else if (rsi < 30) {
          signal = 'buy'
          confidence = 0.7
          reasoning_parts.push('Oversold (RSI<30)')
        } 
        // Strong MACD + EMA trend signals
        else if (macd > 0 && ema_trend === 1) {
          signal = 'buy'
          confidence = 0.65
          reasoning_parts.push('Bullish momentum (MACD+, EMA uptrend)')
        } else if (macd < 0 && ema_trend === -1) {
          signal = 'sell'
          confidence = 0.65
          reasoning_parts.push('Bearish momentum (MACD-, EMA downtrend)')
        }
        
        // Adjust confidence based on news sentiment
        if (signal !== 'hold' && Math.abs(news_sentiment) > 0.2) {
          if ((signal === 'buy' && news_sentiment > 0) || (signal === 'sell' && news_sentiment < 0)) {
            confidence = Math.min(0.95, confidence + 0.15)
            reasoning_parts.push(`Sentiment confirms (${(news_sentiment * 100).toFixed(0)}%)`)
          } else {
            confidence = Math.max(0.4, confidence - 0.15)
            reasoning_parts.push(`Sentiment conflicts (${(news_sentiment * 100).toFixed(0)}%)`)
          }
        }
        
        const reasoning = reasoning_parts.length > 0 
          ? reasoning_parts.join('; ') 
          : 'No strong signal'
        
        signals.push({
          symbol,
          action: signal,
          confidence,
          price,
          reasoning,
          indicators: {
            rsi: Math.round(rsi * 100) / 100,
            macd: Math.round(macd * 10000) / 10000,
            ema_trend,
            news_sentiment: Math.round(news_sentiment * 100) / 100
          },
          timestamp
        })
      }
      
      return {
        success: true,
        signals,
        algorithm_type: this.type,
        model_version: 'simple_v1'
      }
    } catch (error: any) {
      console.error('❌ Simple Rule-Based Algorithm error:', error)
      return {
        success: false,
        signals: [],
        algorithm_type: this.type,
        error: error.message || 'Simple rule-based algorithm failed'
      }
    }
  }
}

/**
 * Advanced Rule-Based Algorithm
 */
export class AdvancedRuleBasedAlgorithm implements TradingAlgorithm {
  readonly type: AlgorithmType = 'rule_based_advanced'
  readonly name = 'Rule-Based (Advanced)'
  
  async predict(features: MarketFeatures[]): Promise<AlgorithmResponse> {
    try {
      const signals: TradingSignal[] = []
      const timestamp = new Date().toISOString()
      
      for (const feature of features) {
        let score = 0
        const reasoning_parts: string[] = []
        
        // RSI scoring (±2 points)
        if (feature.rsi > 70) {
          score -= 2
          reasoning_parts.push('Overbought RSI')
        } else if (feature.rsi < 30) {
          score += 2
          reasoning_parts.push('Oversold RSI')
        }
        
        // MACD scoring (±1.5 points)
        if (feature.macd_histogram > 0) {
          score += 1.5
          reasoning_parts.push('Bullish MACD')
        } else if (feature.macd_histogram < 0) {
          score -= 1.5
          reasoning_parts.push('Bearish MACD')
        }
        
        // Bollinger Bands scoring (±1 point)
        if (feature.bb_position > 0.9) {
          score -= 1
          reasoning_parts.push('Near upper BB')
        } else if (feature.bb_position < 0.1) {
          score += 1
          reasoning_parts.push('Near lower BB')
        }
        
        // News sentiment scoring (±0.5 points)
        if (Math.abs(feature.news_sentiment) > 0.2) {
          score += feature.news_sentiment * 0.5
          reasoning_parts.push(`Sentiment: ${(feature.news_sentiment * 100).toFixed(0)}%`)
        }
        
        // Convert score to action and confidence
        let action: 'buy' | 'sell' | 'hold' = 'hold'
        let confidence = 0.6
        
        // More aggressive thresholds for better position management
        if (score >= 2) {
          action = 'buy'
          confidence = Math.min(0.95, 0.6 + (score - 2) * 0.1)
        } else if (score >= 1) {
          action = 'buy'
          confidence = 0.55
        } else if (score <= -2) {
          action = 'sell'
          confidence = Math.min(0.95, 0.6 + Math.abs(score + 2) * 0.1)
        } else if (score <= -1) {
          action = 'sell'
          confidence = 0.52
        }
        
        const reasoning = reasoning_parts.length > 0
          ? reasoning_parts.join('; ')
          : 'Neutral signal'
        
        signals.push({
          symbol: feature.symbol,
          action,
          confidence,
          price: feature.price,
          reasoning,
          indicators: {
            rsi: Math.round(feature.rsi * 100) / 100,
            macd: Math.round(feature.macd * 10000) / 10000,
            bb_position: Math.round(feature.bb_position * 100) / 100,
            volume_ratio: Math.round(feature.volume_ratio * 100) / 100,
            stochastic: Math.round(feature.stochastic * 100) / 100,
            score: Math.round(score * 100) / 100
          },
          timestamp
        })
      }
      
      return {
        success: true,
        signals,
        algorithm_type: this.type,
        model_version: 'advanced_v1'
      }
    } catch (error: any) {
      console.error('❌ Advanced Rule-Based Algorithm error:', error)
      return {
        success: false,
        signals: [],
        algorithm_type: this.type,
        error: error.message || 'Advanced rule-based algorithm failed'
      }
    }
  }
}

/**
 * NEW: LLM-Based Trading Algorithm
 * Handles Gemini, Llama, and Consensus strategies
 */
export class LLMTradingAlgorithm implements TradingAlgorithm {
  readonly type: AlgorithmType;
  readonly name: string;
  private modelProvider: 'gemini' | 'llama' | 'consensus';

  constructor(type: AlgorithmType) {
    this.type = type;
    if (type === 'gemini_analyst') {
      this.name = 'Gemini 1.5 Flash (Analyst)';
      this.modelProvider = 'gemini';
    } else if (type === 'llama_technical') {
      this.name = 'Llama 3.3 (Scalper)';
      this.modelProvider = 'llama';
    } else {
      this.name = 'Consensus (Gemini + Llama)';
      this.modelProvider = 'consensus';
    }
  }

  async predict(features: MarketFeatures[]): Promise<AlgorithmResponse> {
    const timestamp = new Date().toISOString();

    try {
      // Loop through the Top Candidates in PARALLEL for speed
      const promises = features.map(async (feature) => {
        
        // 1. Convert Data to Text for the LLM
        const dataString = `
          Price: $${feature.price}
          RSI (14): ${feature.rsi}
          MACD: ${feature.macd}
          Trend (EMA): ${feature.ema_trend === 1 ? 'UP' : 'DOWN'}
          Bollinger Position: ${feature.bb_position}
          News Sentiment: ${feature.news_sentiment}
          Volatility: ${feature.volatility_20}
        `;

        let action: 'buy' | 'sell' | 'hold' = 'hold';
        let confidence = 0.0;
        let reasoning = '';

        if (this.modelProvider === 'consensus') {
          // --- CONSENSUS MODE ---
          // Call BOTH models in parallel
          const [geminiDecision, llamaDecision] = await Promise.all([
              getLLMDecision('gemini', feature.symbol, dataString),
              getLLMDecision('llama', feature.symbol, dataString)
          ]);

          // Logic: Require agreement or strong conviction
          if (geminiDecision.action === llamaDecision.action) {
              action = geminiDecision.action;
              confidence = (geminiDecision.confidence + llamaDecision.confidence) / 2;
              reasoning = `Consensus: Gemini (${geminiDecision.reasoning}) & Llama (${llamaDecision.reasoning})`;
          } else {
              // Disagreement -> Default to HOLD unless one is super confident (>0.85)
              action = 'hold';
              reasoning = `Disagreement: Gemini says ${geminiDecision.action}, Llama says ${llamaDecision.action}`;
              
              if (geminiDecision.confidence > 0.85) {
                  action = geminiDecision.action;
                  confidence = geminiDecision.confidence * 0.9; // Penalty for disagreement
                  reasoning = `Gemini Strong Conviction Override: ${geminiDecision.reasoning}`;
              } else if (llamaDecision.confidence > 0.85) {
                  action = llamaDecision.action;
                  confidence = llamaDecision.confidence * 0.9;
                  reasoning = `Llama Strong Conviction Override: ${llamaDecision.reasoning}`;
              }
          }

        } else {
          // --- SINGLE MODEL MODE ---
          const decision = await getLLMDecision(this.modelProvider as 'gemini' | 'llama', feature.symbol, dataString);
          action = decision.action;
          confidence = decision.confidence;
          reasoning = decision.reasoning;
          
          // Safety Check: Did it hallucinate?
          // We can do a basic check if the "data_verification" string contains part of our Price
          const priceCheck = feature.price.toString().split('.')[0];
          if (!decision.data_verification.includes(priceCheck)) {
               console.warn(`[${this.name}] Possible Hallucination on ${feature.symbol}: ${decision.data_verification} vs ${feature.price}`);
               // Penalty for failed verification
               confidence = confidence * 0.5;
               reasoning += " (Data verification warning)";
          }
        }

        return {
          symbol: feature.symbol,
          action: action,
          confidence: confidence,
          price: feature.price,
          reasoning: reasoning,
          indicators: {
            rsi: feature.rsi,
            sentiment: feature.news_sentiment
          },
          timestamp
        } as TradingSignal;
      });

      const signals = await Promise.all(promises);
      
      return {
        success: true,
        signals: signals,
        algorithm_type: this.type,
        model_version: 'llm_v1'
      };

    } catch (error: any) {
      console.error(`❌ LLM Algorithm (${this.name}) error:`, error);
      return {
        success: false,
        signals: [],
        algorithm_type: this.type,
        error: error.message || 'LLM algorithm failed'
      };
    }
  }
}

/**
 * Factory function to create the appropriate algorithm instance
 */
export function createAlgorithm(type: AlgorithmType, options?: { mlServiceUrl?: string }): TradingAlgorithm {
  switch (type) {
    case 'ml_model':
      return new MLModelAlgorithm(options?.mlServiceUrl)
    case 'rule_based_simple':
      return new SimpleRuleBasedAlgorithm()
    case 'rule_based_advanced':
      return new AdvancedRuleBasedAlgorithm()
    // NEW ALGORITHMS
    case 'gemini_analyst':
    case 'llama_technical':
    case 'consensus_combined':
      return new LLMTradingAlgorithm(type);
    default:
      throw new Error(`Unknown algorithm type: ${type}`)
  }
}

/**
 * Get a human-readable name for an algorithm type
 */
export function getAlgorithmDisplayName(type: AlgorithmType): string {
  const algorithm = createAlgorithm(type)
  return algorithm.name
}

/**
 * Get all available algorithm types with their display names
 */
export function getAvailableAlgorithms(): Array<{ value: AlgorithmType; label: string }> {
  return [
    { value: 'ml_model', label: 'ML Model (Random Forest)' },
    { value: 'rule_based_simple', label: 'Rule-Based (Simple)' },
    { value: 'rule_based_advanced', label: 'Rule-Based (Advanced)' },
    // NEW OPTIONS
    { value: 'gemini_analyst', label: 'Gemini 1.5 (Analyst)' },
    { value: 'llama_technical', label: 'Llama 3.3 (Scalper)' },
    { value: 'consensus_combined', label: 'Consensus (Combined)' }
  ]
}