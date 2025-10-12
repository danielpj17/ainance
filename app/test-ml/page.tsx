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
}

export default function TestMLPage() {
  const [symbols, setSymbols] = useState('AAPL,TSLA,NVDA');
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mlServiceStatus, setMlServiceStatus] = useState<'unknown' | 'online' | 'offline'>('unknown');

  const checkMLService = async () => {
    try {
      const response = await fetch('/api/ml/predict');
      if (response.ok) {
        setMlServiceStatus('online');
        return true;
      }
      setMlServiceStatus('offline');
      return false;
    } catch (err) {
      setMlServiceStatus('offline');
      return false;
    }
  };

  const getPredictions = async () => {
    setLoading(true);
    setError(null);

    try {
      // Check ML service first
      const serviceOnline = await checkMLService();
      if (!serviceOnline) {
        throw new Error('ML service is offline. Start it with: python ml-service-local.py');
      }

      const symbolList = symbols.split(',').map(s => s.trim().toUpperCase()).filter(s => s);

      const response = await fetch('http://localhost:8080/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols: symbolList })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      const data = await response.json();
      
      if (data.success && data.signals) {
        setPredictions(data.signals);
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
            <Badge variant={mlServiceStatus === 'online' ? 'default' : 'destructive'}>
              {mlServiceStatus === 'online' ? '🟢 Online' : mlServiceStatus === 'offline' ? '🔴 Offline' : '⚪ Unknown'}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <p className="text-sm">
              <strong>Endpoint:</strong> Render ML Service
            </p>
            <p className="text-sm">
              <strong>Model:</strong> Mock Model (Trading Signals)
            </p>
            {mlServiceStatus === 'offline' && (
              <div className="mt-4 p-3 bg-destructive/10 text-destructive rounded-md text-sm">
                ⚠️ ML service is not accessible. Check your environment variables.
              </div>
            )}
            <Button size="sm" onClick={checkMLService} className="mt-2">
              Check Status
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Input Section */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Get Predictions</CardTitle>
          <CardDescription>
            Enter stock symbols (comma-separated) to get ML predictions
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
          <h2 className="text-2xl font-bold">Predictions ({predictions.length})</h2>
          
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
                        <p className="text-2xl font-bold mt-1">${pred.price.toFixed(2)}</p>
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
                        <div>RSI: {pred.indicators.rsi}</div>
                        <div>MACD: {pred.indicators.macd.toFixed(4)}</div>
                        <div>BB Pos: {pred.indicators.bb_position.toFixed(2)}</div>
                        <div>Vol Ratio: {pred.indicators.volume_ratio.toFixed(2)}</div>
                        <div>Stoch: {pred.indicators.stochastic}</div>
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

