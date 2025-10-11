/**
 * ML Prediction API with Caching
 * 
 * Calls the ML inference service (Google Cloud Run) and caches predictions
 * in Supabase for 30-60 seconds to reduce costs and improve response time
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/utils/supabase/server';

export const runtime = 'nodejs';

// ML service URL (Google Cloud Run or local)
const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8080';

// Cache TTL in seconds
const CACHE_TTL = parseInt(process.env.ML_CACHE_TTL || '30');

interface MarketFeatures {
  symbol: string;
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
  price?: number;
}

interface PredictionRequest {
  features: MarketFeatures[];
  include_probabilities?: boolean;
  bypass_cache?: boolean;
}

interface CachedPrediction {
  symbol: string;
  prediction: any;
  cached_at: string;
  expires_at: string;
}

/**
 * Check cache for recent predictions
 */
async function checkCache(supabase: any, symbols: string[]): Promise<Record<string, any>> {
  try {
    const now = new Date().toISOString();
    
    const { data, error } = await supabase
      .from('ml_predictions_cache')
      .select('*')
      .in('symbol', symbols)
      .gt('expires_at', now);
    
    if (error) {
      console.error('Error checking cache:', error);
      return {};
    }
    
    const cached: Record<string, any> = {};
    
    if (data && data.length > 0) {
      for (const item of data) {
        cached[item.symbol] = {
          ...item.prediction,
          cached: true,
          cached_at: item.cached_at
        };
      }
      
      console.log(`📦 Cache hit for ${data.length} symbols: ${data.map((d: any) => d.symbol).join(', ')}`);
    }
    
    return cached;
    
  } catch (error) {
    console.error('Cache check error:', error);
    return {};
  }
}

/**
 * Save predictions to cache
 */
async function saveToCache(supabase: any, predictions: any[]): Promise<void> {
  try {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + CACHE_TTL * 1000);
    
    const cacheRecords = predictions.map(pred => ({
      symbol: pred.symbol,
      prediction: pred,
      cached_at: now.toISOString(),
      expires_at: expiresAt.toISOString()
    }));
    
    const { error } = await supabase
      .from('ml_predictions_cache')
      .upsert(cacheRecords, {
        onConflict: 'symbol',
        ignoreDuplicates: false
      });
    
    if (error) {
      console.error('Error saving to cache:', error);
    } else {
      console.log(`💾 Cached ${predictions.length} predictions (TTL: ${CACHE_TTL}s)`);
    }
    
  } catch (error) {
    console.error('Cache save error:', error);
  }
}

/**
 * Call ML inference service
 */
async function callMLService(features: MarketFeatures[], includeProbabilities = false): Promise<any> {
  try {
    const response = await fetch(`${ML_SERVICE_URL}/predict`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        features,
        include_probabilities: includeProbabilities
      }),
      signal: AbortSignal.timeout(10000) // 10 second timeout
    });
    
    if (!response.ok) {
      throw new Error(`ML service returned ${response.status}: ${await response.text()}`);
    }
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error('ML service returned unsuccessful response');
    }
    
    return data;
    
  } catch (error) {
    console.error('ML service error:', error);
    throw error;
  }
}

/**
 * POST - Get ML predictions for symbols
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createServerClient(req, {});
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    const body: PredictionRequest = await req.json();
    
    if (!body.features || !Array.isArray(body.features) || body.features.length === 0) {
      return NextResponse.json(
        { success: false, error: 'features array is required' },
        { status: 400 }
      );
    }
    
    const symbols = body.features.map(f => f.symbol);
    
    // Check cache unless bypassed
    let cachedPredictions: Record<string, any> = {};
    let uncachedFeatures: MarketFeatures[] = body.features;
    
    if (!body.bypass_cache) {
      cachedPredictions = await checkCache(supabase, symbols);
      
      // Filter out cached symbols
      if (Object.keys(cachedPredictions).length > 0) {
        uncachedFeatures = body.features.filter(
          f => !cachedPredictions[f.symbol]
        );
      }
    }
    
    // If all predictions are cached, return immediately
    if (uncachedFeatures.length === 0) {
      const signals = Object.values(cachedPredictions);
      return NextResponse.json({
        success: true,
        signals,
        cached: true,
        cache_hits: signals.length,
        cache_misses: 0,
        model_version: 'cached'
      });
    }
    
    // Call ML service for uncached predictions
    console.log(`🤖 Calling ML service for ${uncachedFeatures.length} symbols: ${uncachedFeatures.map(f => f.symbol).join(', ')}`);
    
    const mlResponse = await callMLService(uncachedFeatures, body.include_probabilities);
    
    // Save fresh predictions to cache
    if (mlResponse.signals && mlResponse.signals.length > 0) {
      await saveToCache(supabase, mlResponse.signals);
    }
    
    // Combine cached and fresh predictions
    const allSignals = [
      ...Object.values(cachedPredictions),
      ...mlResponse.signals
    ];
    
    return NextResponse.json({
      success: true,
      signals: allSignals,
      cached: false,
      cache_hits: Object.keys(cachedPredictions).length,
      cache_misses: uncachedFeatures.length,
      model_version: mlResponse.model_version,
      timestamp: mlResponse.timestamp
    });
    
  } catch (error: any) {
    console.error('ML prediction API error:', error);
    
    // Check if ML service is unreachable
    if (error.message?.includes('fetch failed') || error.message?.includes('ECONNREFUSED')) {
      return NextResponse.json(
        {
          success: false,
          error: 'ML service is currently unavailable. Please ensure it is running.',
          hint: 'Start the ML service locally or deploy to Google Cloud Run'
        },
        { status: 503 }
      );
    }
    
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to get predictions'
      },
      { status: 500 }
    );
  }
}

/**
 * GET - Health check for ML service
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    // Check ML service health
    const response = await fetch(`${ML_SERVICE_URL}/health`, {
      signal: AbortSignal.timeout(5000)
    });
    
    const health = await response.json();
    
    return NextResponse.json({
      success: true,
      ml_service: {
        url: ML_SERVICE_URL,
        status: response.ok ? 'healthy' : 'degraded',
        ...health
      },
      cache: {
        enabled: true,
        ttl_seconds: CACHE_TTL
      }
    });
    
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      ml_service: {
        url: ML_SERVICE_URL,
        status: 'unreachable',
        error: error.message
      },
      cache: {
        enabled: true,
        ttl_seconds: CACHE_TTL
      }
    }, { status: 503 });
  }
}

