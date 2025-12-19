/**
 * Trading Algorithm Abstraction Layer
 * 
 * This module provides a unified interface for different trading algorithms,
 * allowing the bot to switch between ML models and rule-based strategies.
 */

// Types for algorithm inputs and outputs
export type AlgorithmType = 'ml_model' | 'rule_based_simple' | 'rule_based_advanced'

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
 * Uses basic technical indicators (RSI, MACD, EMA) for trading decisions
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
        // Moderate sell signals (weakening momentum)
        else if (rsi > 60 && macd < 0) {
          signal = 'sell'
          confidence = 0.55
          reasoning_parts.push('Weakening momentum (RSI>60, MACD negative)')
        } else if (ema_trend === -1 && rsi > 55) {
          signal = 'sell'
          confidence = 0.52
          reasoning_parts.push('Downtrend forming (EMA down, RSI elevated)')
        }
        // Moderate buy signals (strengthening momentum)
        else if (rsi < 40 && macd > 0) {
          signal = 'buy'
          confidence = 0.55
          reasoning_parts.push('Strengthening momentum (RSI<40, MACD positive)')
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
 * Uses enhanced scoring system with multiple indicators including Stochastic
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
        
        // Volume scoring (±0.5 points)
        if (feature.volume_ratio > 1.5) {
          // High volume strengthens signal (don't change score, just note it)
          reasoning_parts.push('High volume')
        } else if (feature.volume_ratio < 0.5) {
          score -= 0.5
          reasoning_parts.push('Low volume')
        }
        
        // Stochastic scoring (±1 point)
        if (feature.stochastic > 80) {
          score -= 1
          reasoning_parts.push('Overbought Stoch')
        } else if (feature.stochastic < 20) {
          score += 1
          reasoning_parts.push('Oversold Stoch')
        }
        
        // EMA trend scoring (±0.5 points)
        if (feature.ema_trend === 1) {
          score += 0.5
          reasoning_parts.push('Bullish EMA')
        } else if (feature.ema_trend === -1) {
          score -= 0.5
          reasoning_parts.push('Bearish EMA')
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
          confidence = 0.55  // Moderate buy signal
        } else if (score <= -2) {
          action = 'sell'
          confidence = Math.min(0.95, 0.6 + Math.abs(score + 2) * 0.1)
        } else if (score <= -1) {
          action = 'sell'
          confidence = 0.52  // Moderate sell signal - helps exit positions earlier
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
    { value: 'rule_based_advanced', label: 'Rule-Based (Advanced)' }
  ]
}

