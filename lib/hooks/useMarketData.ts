/**
 * React hook for real-time market data via Server-Sent Events
 * 
 * Usage:
 * const { quotes, isConnected, error } = useMarketData(['AAPL', 'TSLA']);
 */

import { useState, useEffect, useCallback, useRef } from 'react';

interface Quote {
  symbol: string;
  bid?: number;
  ask?: number;
  mid?: number;
  lastPrice?: number;
  updatedAt: number;
}

interface MarketDataState {
  quotes: Record<string, Quote>;
  isConnected: boolean;
  error: string | null;
  lastUpdate: number | null;
}

interface SSEMessage {
  type: 'connected' | 'market_data' | 'heartbeat' | 'error';
  quotes?: Record<string, Quote>;
  message?: string;
  timestamp: number;
}

export function useMarketData(symbols: string[], enabled = true) {
  const [state, setState] = useState<MarketDataState>({
    quotes: {},
    isConnected: false,
    error: null,
    lastUpdate: null
  });
  
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  
  const connect = useCallback(() => {
    if (!enabled || symbols.length === 0) {
      return;
    }
    
    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
    
    try {
      // Create SSE connection
      const symbolsParam = symbols.join(',');
      const url = `/api/market-stream?symbols=${encodeURIComponent(symbolsParam)}`;
      
      console.log(`📡 Connecting to market data stream: ${symbolsParam}`);
      
      const eventSource = new EventSource(url);
      eventSourceRef.current = eventSource;
      
      // Handle incoming messages
      eventSource.onmessage = (event) => {
        try {
          const message: SSEMessage = JSON.parse(event.data);
          
          switch (message.type) {
            case 'connected':
              console.log('✅ Market data stream connected');
              setState(prev => ({
                ...prev,
                isConnected: true,
                error: null
              }));
              reconnectAttemptsRef.current = 0;
              break;
            
            case 'market_data':
              if (message.quotes) {
                setState(prev => ({
                  ...prev,
                  quotes: { ...prev.quotes, ...message.quotes },
                  lastUpdate: message.timestamp,
                  error: null
                }));
              }
              break;
            
            case 'heartbeat':
              // Connection is alive
              break;
            
            case 'error':
              console.error('Market data error:', message.message);
              setState(prev => ({
                ...prev,
                error: message.message || 'Unknown error'
              }));
              break;
          }
        } catch (error) {
          console.error('Error parsing SSE message:', error);
        }
      };
      
      // Handle connection error
      eventSource.onerror = (error) => {
        console.error('SSE connection error:', error);
        
        setState(prev => ({
          ...prev,
          isConnected: false,
          error: 'Connection lost'
        }));
        
        eventSource.close();
        
        // Exponential backoff for reconnection
        const backoffTime = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
        reconnectAttemptsRef.current++;
        
        console.log(`Reconnecting in ${backoffTime / 1000}s (attempt ${reconnectAttemptsRef.current})...`);
        
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, backoffTime);
      };
      
    } catch (error) {
      console.error('Error creating SSE connection:', error);
      setState(prev => ({
        ...prev,
        isConnected: false,
        error: 'Failed to connect'
      }));
    }
  }, [symbols, enabled]);
  
  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      console.log('📡 Disconnecting from market data stream');
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    setState(prev => ({
      ...prev,
      isConnected: false
    }));
  }, []);
  
  // Connect on mount and when symbols change
  useEffect(() => {
    if (enabled && symbols.length > 0) {
      connect();
    }
    
    return () => {
      disconnect();
    };
  }, [symbols.join(','), enabled]); // eslint-disable-line react-hooks/exhaustive-deps
  
  // Get price for a specific symbol
  const getPrice = useCallback((symbol: string): number | null => {
    const quote = state.quotes[symbol];
    if (!quote) return null;
    
    return quote.lastPrice || quote.mid || null;
  }, [state.quotes]);
  
  // Get quote for a specific symbol
  const getQuote = useCallback((symbol: string): Quote | null => {
    return state.quotes[symbol] || null;
  }, [state.quotes]);
  
  // Check if data is stale (no update in last 10 seconds)
  const isStale = state.lastUpdate && (Date.now() - state.lastUpdate > 10000);
  
  return {
    quotes: state.quotes,
    isConnected: state.isConnected,
    error: state.error,
    lastUpdate: state.lastUpdate,
    isStale,
    getPrice,
    getQuote,
    reconnect: connect,
    disconnect
  };
}

