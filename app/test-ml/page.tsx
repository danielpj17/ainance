'use client';

/**
 * ML Model Testing Page
 * Test your trained Random Forest model with real-time predictions
 */

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

interface Prediction {
  symbol: string;
  action: string;
  confidence: number;
  price: number;
  reasoning: string;
  indicators: {
    rsi: number;
    macd: number;
    bb_position: number;
    volume_ratio: number;
    stochastic: number;
  };
  timestamp?: string;
}

interface MLServiceInfo {
  status: 'unknown' | 'online' | 'offline';
  url?: string;
  model_loaded?: boolean;
  model_version?: string;
  uptime_seconds?: number;
}

interface DebugInfo {
  ml_service_url?: string;
  request_features_count?: number;
  response_signals_count?: number;
}

export default function TestMLPage() {
  const [symbols, setSymbols] = useState('AAPL,TSLA,NVDA');
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mlServiceInfo, setMlServiceInfo] = useState<MLServiceInfo>({ status: 'unknown' });
  const [debugInfo, setDebugInfo] = useState<DebugInfo>({});

  const checkMLService = async () => {
    try {
      const response = await fetch('/api/ml/test');
      const data = await response.json();
      
      if (response.ok && data.success) {
        setMlServiceInfo({
          status: 'online',
          url: data.ml_service?.url,
          model_loaded: data.ml_service?.model_loaded,
          model_version: data.ml_service?.model_version,
          uptime_seconds: data.ml_service?.uptime_seconds
        });
        return true;
      }
      setMlServiceInfo({ status: 'offline' });
      return false;
    } catch (err) {
      setMlServiceInfo({ status: 'offline' });
      return false;
    }
  };

  const getPredictions = async (forceFresh = false) => {
    setLoading(true);
    setError(null);

    try {
      // Check ML service first
      const serviceOnline = await checkMLService();
      if (!serviceOnline) {
        throw new Error('ML service is offline');
      }

      const symbolList = symbols.split(',').map(s => s.trim().toUpperCase()).filter(s => s);

      if (symbolList.length === 0) {
        throw new Error('Please enter at least one stock symbol');
      }

      // Fetch real stock data and technical indicators
      const indicatorsResponse = await fetch('/api/stocks/indicators', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols: symbolList })
      });

      if (!indicatorsResponse.ok) {
        const errorData = await indicatorsResponse.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to fetch stock data: ${indicatorsResponse.status}`);
      }

      const indicatorsData = await indicatorsResponse.json();

      if (!indicatorsData.success) {
        const errorMsg = indicatorsData.error || 'Failed to fetch stock data';
        const errorDetails = indicatorsData.errors ? `\n\nDetails:\n${indicatorsData.errors.join('\n')}` : '';
        throw new Error(errorMsg + errorDetails);
      }

      if (!indicatorsData.indicators || indicatorsData.indicators.length === 0) {
        throw new Error('No stock data available. Please check the symbols and try again.');
      }

      // Use the real indicators as features
      const features = indicatorsData.indicators;

      // Call ML service with real data
      const response = await fetch('/api/ml/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          features,
          force_fresh: forceFresh
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      const data = await response.json();
      
      if (data.success && data.signals) {
        setPredictions(data.signals);
        setDebugInfo(data.debug || {});
      } else {
        throw new Error('No predictions returned');
      }

    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">🤖 ML Model Testing</h1>
        <p className="text-muted-foreground">
          Test your Random Forest model trained on 100 stocks
        </p>
      </div>

      {/* ML Service Status */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            ML Service Status
            <Badge variant={mlServiceInfo.status === 'online' ? 'default' : 'destructive'}>
              {mlServiceInfo.status === 'online' ? '🟢 Online' : mlServiceInfo.status === 'offline' ? '🔴 Offline' : '⚪ Unknown'}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {mlServiceInfo.url && (
              <p className="text-sm">
                <strong>Endpoint:</strong> Google Cloud Run
              </p>
            )}
            {mlServiceInfo.status === 'online' ? (
              <>
                <p className="text-sm">
                  <strong>Model:</strong> ✅ Real Random Forest Model (200 trees)
                </p>
                <p className="text-sm">
                  <strong>Model Version:</strong> {mlServiceInfo.model_version || 'N/A'}
                </p>
                <p className="text-sm">
                  <strong>Model Loaded:</strong> {mlServiceInfo.model_loaded ? '✅ Yes' : '❌ No'}
                </p>
                {mlServiceInfo.uptime_seconds !== undefined && (
                  <p className="text-sm">
                    <strong>Uptime:</strong> {Math.floor(mlServiceInfo.uptime_seconds / 60)} minutes
                  </p>
                )}
                <div className="mt-4 p-3 bg-green-500/10 text-green-700 dark:text-green-400 rounded-md text-sm">
                  ✅ Connected to real ML model on Google Cloud Run. All predictions are generated by your trained Random Forest model.
                </div>
              </>
            ) : mlServiceInfo.status === 'offline' ? (
              <div className="mt-4 p-3 bg-destructive/10 text-destructive rounded-md text-sm">
                ⚠️ ML service is not accessible. Check your ML_SERVICE_URL environment variable.
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Click "Check Status" to verify ML service connection
              </p>
            )}
            <Button size="sm" onClick={checkMLService} className="mt-2" disabled={loading}>
              {loading ? 'Checking...' : 'Check Status'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Input Section */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Get Predictions</CardTitle>
          <CardDescription>
            Enter stock symbols (comma-separated) to get real ML predictions from your trained Random Forest model
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="AAPL,TSLA,NVDA,SPY,QQQ"
              value={symbols}
              onChange={(e) => setSymbols(e.target.value)}
              className="flex-1"
            />
            <Button onClick={getPredictions} disabled={loading}>
              {loading ? 'Analyzing...' : 'Get Predictions'}
            </Button>
            <Button 
              onClick={() => getPredictions(true)} 
              disabled={loading}
              variant="outline"
              title="Force fresh predictions (bypass any caching)"
            >
              {loading ? 'Analyzing...' : 'Force Fresh'}
            </Button>
          </div>
          {error && (
            <div className="mt-4 p-3 bg-destructive/10 text-destructive rounded-md text-sm">
              ❌ {error}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results */}
      {predictions.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold">Real ML Predictions ({predictions.length})</h2>
            <Badge variant="outline" className="text-green-600 border-green-600">
              ✅ Generated by Real Model
            </Badge>
          </div>
          
          {predictions[0]?.timestamp && (
            <p className="text-sm text-muted-foreground">
              Generated: {new Date(predictions[0].timestamp).toLocaleString()}
            </p>
          )}
          
          {Object.keys(debugInfo).length > 0 && (
            <div className="mt-4 p-3 bg-blue-500/10 text-blue-700 dark:text-blue-400 rounded-md text-sm">
              <strong>🔍 Debug Info:</strong>
              <div className="mt-1 space-y-1">
                {debugInfo.ml_service_url && (
                  <div>ML Service URL: {debugInfo.ml_service_url}</div>
                )}
                {debugInfo.request_features_count && (
                  <div>Features sent: {debugInfo.request_features_count}</div>
                )}
                {debugInfo.response_signals_count && (
                  <div>Signals received: {debugInfo.response_signals_count}</div>
                )}
              </div>
            </div>
          )}
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {predictions.map((pred) => {
              const actionColor = pred.action === 'buy' ? 'text-green-500' : pred.action === 'sell' ? 'text-red-500' : 'text-yellow-500';
              const bgColor = pred.action === 'buy' ? 'bg-green-500/10' : pred.action === 'sell' ? 'bg-red-500/10' : 'bg-yellow-500/10';
              
              return (
                <Card key={pred.symbol} className={bgColor}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-xl">{pred.symbol}</CardTitle>
                        <p className="text-2xl font-bold mt-1">${pred.price?.toFixed(2) || 'N/A'}</p>
                      </div>
                      <Badge className={actionColor}>
                        {pred.action.toUpperCase()}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {/* Confidence */}
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>Confidence</span>
                        <span className="font-bold">{(pred.confidence * 100).toFixed(1)}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-blue-500 h-2 rounded-full"
                          style={{ width: `${pred.confidence * 100}%` }}
                        />
                      </div>
                    </div>

                    {/* Reasoning */}
                    <div className="text-sm">
                      <strong>Reasoning:</strong>
                      <p className="text-muted-foreground mt-1">{pred.reasoning}</p>
                    </div>

                    {/* Indicators */}
                    <div className="text-sm space-y-1">
                      <strong>Key Indicators:</strong>
                      <div className="grid grid-cols-2 gap-1 text-xs">
                        <div>RSI: {pred.indicators?.rsi || 'N/A'}</div>
                        <div>MACD: {pred.indicators?.macd?.toFixed(4) || 'N/A'}</div>
                        <div>BB Pos: {pred.indicators?.bb_position?.toFixed(2) || 'N/A'}</div>
                        <div>Vol Ratio: {pred.indicators?.volume_ratio?.toFixed(2) || 'N/A'}</div>
                        <div>Stoch: {pred.indicators?.stochastic || 'N/A'}</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Info Section */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>📊 Model Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p><strong>Training Data:</strong> 100 stocks, 2 years daily data</p>
          <p><strong>Total Samples:</strong> 43,679 (train) + 8,736 (test)</p>
          <p><strong>Test Accuracy:</strong> 61.8% (profitable threshold: 60%+)</p>
          <p><strong>Features:</strong> 13 technical indicators (RSI, MACD, Bollinger Bands, etc.)</p>
          <p><strong>Model Type:</strong> Random Forest Classifier (200 trees)</p>
          <p><strong>Predictions:</strong> BUY (15%), HOLD (71%), SELL (14%)</p>
        </CardContent>
      </Card>
    </div>
  );
}

