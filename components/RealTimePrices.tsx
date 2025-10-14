'use client';

/**
 * Real-Time Price Display Component
 * 
 * Shows live market prices with SSE updates
 */

import { useState, useEffect } from 'react';
import { useMarketData } from '@/lib/hooks/useMarketData';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface RealTimePricesProps {
  initialSymbols?: string[];
  showControls?: boolean;
}

export default function RealTimePrices({ 
  initialSymbols = ['SPY', 'QQQ', 'AAPL', 'TSLA', 'NVDA'],
  showControls = true 
}: RealTimePricesProps) {
  const [symbols, setSymbols] = useState<string[]>(initialSymbols);
  const [newSymbol, setNewSymbol] = useState('');
  const [enabled, setEnabled] = useState(true);
  
  const {
    quotes,
    isConnected,
    error,
    lastUpdate,
    isStale,
    reconnect
  } = useMarketData(symbols, enabled);
  
  const handleAddSymbol = () => {
    const symbol = newSymbol.toUpperCase().trim();
    if (symbol && !symbols.includes(symbol)) {
      setSymbols([...symbols, symbol]);
      setNewSymbol('');
    }
  };
  
  const handleRemoveSymbol = (symbol: string) => {
    setSymbols(symbols.filter(s => s !== symbol));
  };
  
  const formatPrice = (price: number | undefined) => {
    if (!price) return '-';
    return `$${price.toFixed(2)}`;
  };
  
  const formatSpread = (bid: number | undefined, ask: number | undefined) => {
    if (!bid || !ask) return '-';
    const spread = ask - bid;
    return `$${spread.toFixed(2)}`;
  };
  
  const formatTimestamp = (timestamp: number | null) => {
    if (!timestamp) return 'Never';
    const secondsAgo = Math.floor((Date.now() - timestamp) / 1000);
    if (secondsAgo < 60) return `${secondsAgo}s ago`;
    return `${Math.floor(secondsAgo / 60)}m ago`;
  };
  
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Real-Time Market Data</CardTitle>
            <CardDescription>
              Live prices via Server-Sent Events • Updates every 2 seconds
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={isConnected ? 'default' : 'destructive'}>
              {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
            </Badge>
            {isStale && (
              <Badge variant="outline">
                ⚠️ Stale Data
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Connection Status */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Last update: {formatTimestamp(lastUpdate)}
          </span>
          {!isConnected && (
            <Button size="sm" variant="outline" onClick={reconnect}>
              Reconnect
            </Button>
          )}
        </div>
        
        {/* Error Message */}
        {error && (
          <div className="p-3 bg-destructive/10 text-destructive rounded-md text-sm">
            ⚠️ {error}
          </div>
        )}
        
        {/* Add Symbol Control */}
        {showControls && (
          <div className="flex gap-2">
            <Input
              placeholder="Add symbol (e.g., MSFT)"
              value={newSymbol}
              onChange={(e) => setNewSymbol(e.target.value.toUpperCase())}
              onKeyPress={(e) => e.key === 'Enter' && handleAddSymbol()}
              className="max-w-xs"
            />
            <Button onClick={handleAddSymbol}>Add</Button>
            <Button 
              variant="outline" 
              onClick={() => setEnabled(!enabled)}
            >
              {enabled ? 'Pause' : 'Resume'}
            </Button>
          </div>
        )}
        
        {/* Price Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {symbols.map(symbol => {
            const quote = quotes[symbol];
            const price = quote?.lastPrice || quote?.mid;
            const hasData = !!quote;
            
            return (
              <Card key={symbol} className={!hasData ? 'opacity-50' : ''}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">{symbol}</CardTitle>
                      <CardDescription className="text-2xl font-bold mt-1">
                        {formatPrice(price)}
                      </CardDescription>
                    </div>
                    {showControls && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleRemoveSymbol(symbol)}
                      >
                        ✕
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="pt-0 space-y-1 text-sm">
                  {hasData ? (
                    <>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Bid:</span>
                        <span className="font-mono">{formatPrice(quote.bid)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Ask:</span>
                        <span className="font-mono">{formatPrice(quote.ask)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Spread:</span>
                        <span className="font-mono">{formatSpread(quote.bid, quote.ask)}</span>
                      </div>
                    </>
                  ) : (
                    <div className="text-muted-foreground text-center py-2">
                      Waiting for data...
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
        
        {/* Legend */}
        <div className="text-xs text-muted-foreground space-y-1 pt-4 border-t">
          <p>💡 <strong>Tip:</strong> Prices update automatically in real-time</p>
          <p>📊 Data source: Alpaca Markets (IEX feed for free tier)</p>
          <p>🔄 Auto-reconnects on connection loss with exponential backoff</p>
        </div>
      </CardContent>
    </Card>
  );
}

