/**
 * ML Test API - No Authentication Required
 * For testing ML predictions without user authentication
 */

import { NextRequest, NextResponse } from 'next/server';
import { getMarketStatus } from '@/lib/market-utils';

export const runtime = 'nodejs';

// ML service URL (Render) - remove trailing slash if present
const ML_SERVICE_URL = (process.env.ML_SERVICE_URL || 'http://localhost:8080').replace(/\/$/, '');

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
 * POST - Get ML predictions for symbols (no auth required)
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body: PredictionRequest = await req.json();
    
    if (!body.features || !Array.isArray(body.features) || body.features.length === 0) {
      return NextResponse.json(
        { success: false, error: 'features array is required' },
        { status: 400 }
      );
    }
    
    // Call ML service
    console.log(`🤖 Calling ML service for ${body.features.length} symbols: ${body.features.map(f => f.symbol).join(', ')}`);
    console.log(`🔗 ML Service URL: ${ML_SERVICE_URL}`);
    console.log(`📊 Sample feature data:`, JSON.stringify(body.features[0], null, 2));
    
    const mlResponse = await callMLService(body.features, body.include_probabilities);
    
    console.log(`✅ ML Response received:`, {
      model_version: mlResponse.model_version,
      signal_count: mlResponse.signals?.length,
      timestamp: mlResponse.timestamp
    });
    
    // Get market status for display
    const marketStatus = getMarketStatus();
    
    // Enhance signals with market status info if available
    const enhancedSignals = mlResponse.signals.map((signal: any) => ({
      ...signal,
      market_open: marketStatus.open,
      data_timestamp: marketStatus.timestamp
    }));
    
    return NextResponse.json({
      success: true,
      signals: enhancedSignals,
      cached: false,
      model_version: mlResponse.model_version,
      timestamp: mlResponse.timestamp,
      market_status: marketStatus.message,
      market_open: marketStatus.open,
      data_timestamp: marketStatus.timestamp,
      debug: {
        ml_service_url: ML_SERVICE_URL,
        request_features_count: body.features.length,
        response_signals_count: mlResponse.signals?.length
      }
    });
    
  } catch (error: any) {
    console.error('ML test API error:', error);
    
    // Check if ML service is unreachable
    if (error.message?.includes('fetch failed') || error.message?.includes('ECONNREFUSED')) {
      return NextResponse.json(
        {
          success: false,
          error: 'ML service is currently unavailable. Please check the Render deployment.',
          hint: 'ML service URL: ' + ML_SERVICE_URL
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
 * GET - Health check for ML service (no auth required)
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
      }
    });
    
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      ml_service: {
        url: ML_SERVICE_URL,
        status: 'unreachable',
        error: error.message
      }
    }, { status: 503 });
  }
}
