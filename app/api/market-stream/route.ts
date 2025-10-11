/**
 * Server-Sent Events (SSE) endpoint for real-time market data streaming
 * 
 * Streams real-time price updates to connected clients
 * Each user receives only data for their watchlist symbols
 */

import { NextRequest } from 'next/server';
import { createServerClient } from '@/utils/supabase/server';

// Market data aggregator URL (configure based on deployment)
const MARKET_DATA_URL = process.env.MARKET_DATA_AGGREGATOR_URL || 'http://localhost:3001';

// Update interval in milliseconds
const UPDATE_INTERVAL = parseInt(process.env.MARKET_UPDATE_INTERVAL || '2000');

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET handler for SSE connection
 */
export async function GET(req: NextRequest) {
  // Get user's watchlist symbols from query params
  const { searchParams } = new URL(req.url);
  const symbolsParam = searchParams.get('symbols');
  const symbols = symbolsParam ? symbolsParam.split(',').map(s => s.toUpperCase()) : ['SPY', 'QQQ'];
  
  console.log(`📡 SSE connection opened for symbols: ${symbols.join(', ')}`);
  
  // Create a ReadableStream for SSE
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      
      // Send initial connection message
      const sendMessage = (data: any) => {
        const message = `data: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(message));
      };
      
      // Send heartbeat to keep connection alive
      const sendHeartbeat = () => {
        sendMessage({ type: 'heartbeat', timestamp: Date.now() });
      };
      
      // Send initial connection confirmation
      sendMessage({
        type: 'connected',
        symbols,
        updateInterval: UPDATE_INTERVAL,
        timestamp: Date.now()
      });
      
      // Set up intervals
      let updateIntervalId: NodeJS.Timeout | null = null;
      let heartbeatIntervalId: NodeJS.Timeout | null = null;
      
      try {
        // Subscribe to symbols in market data aggregator
        await fetch(`${MARKET_DATA_URL}/subscribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbols })
        });
        
        // Fetch and send updates
        updateIntervalId = setInterval(async () => {
          try {
            const response = await fetch(`${MARKET_DATA_URL}/quotes`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ symbols }),
              signal: AbortSignal.timeout(5000) // 5 second timeout
            });
            
            if (!response.ok) {
              throw new Error(`Market data fetch failed: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.success && data.data) {
              // Send market data update
              sendMessage({
                type: 'market_data',
                quotes: data.data,
                timestamp: Date.now()
              });
            }
          } catch (error) {
            console.error('Error fetching market data:', error);
            sendMessage({
              type: 'error',
              message: 'Failed to fetch market data',
              timestamp: Date.now()
            });
          }
        }, UPDATE_INTERVAL);
        
        // Send heartbeat every 30 seconds
        heartbeatIntervalId = setInterval(sendHeartbeat, 30000);
        
        // Handle client disconnect
        req.signal.addEventListener('abort', () => {
          console.log(`📡 SSE connection closed for symbols: ${symbols.join(', ')}`);
          
          if (updateIntervalId) clearInterval(updateIntervalId);
          if (heartbeatIntervalId) clearInterval(heartbeatIntervalId);
          
          try {
            controller.close();
          } catch (e) {
            // Already closed
          }
        });
        
      } catch (error) {
        console.error('SSE setup error:', error);
        sendMessage({
          type: 'error',
          message: 'Failed to setup market data stream',
          timestamp: Date.now()
        });
        
        if (updateIntervalId) clearInterval(updateIntervalId);
        if (heartbeatIntervalId) clearInterval(heartbeatIntervalId);
        controller.close();
      }
    }
  });
  
  // Return SSE response
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable buffering in nginx
    }
  });
}

