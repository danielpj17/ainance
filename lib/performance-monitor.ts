/**
 * Performance Monitoring Utilities
 * 
 * Track API performance metrics to Supabase
 */

import { createClient } from '@supabase/supabase-js';

interface PerformanceMetric {
  endpoint: string;
  method: string;
  durationMs: number;
  statusCode: number;
  userId?: string;
  errorMessage?: string;
  metadata?: Record<string, any>;
}

/**
 * Log performance metric to Supabase
 */
export async function logPerformanceMetric(metric: PerformanceMetric): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    // Silently skip if not configured
    return;
  }
  
  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    await supabase.from('performance_metrics').insert({
      endpoint: metric.endpoint,
      method: metric.method,
      duration_ms: metric.durationMs,
      status_code: metric.statusCode,
      user_id: metric.userId || null,
      error_message: metric.errorMessage || null,
      metadata: metric.metadata || null
    });
    
  } catch (error) {
    // Don't throw errors for monitoring failures
    console.error('Failed to log performance metric:', error);
  }
}

/**
 * Performance monitoring middleware wrapper
 */
export function withPerformanceMonitoring<T>(
  endpoint: string,
  method: string,
  handler: () => Promise<T>
): Promise<T> {
  const startTime = Date.now();
  
  return handler()
    .then((result) => {
      const durationMs = Date.now() - startTime;
      
      // Log success metric
      logPerformanceMetric({
        endpoint,
        method,
        durationMs,
        statusCode: 200
      }).catch(() => {}); // Ignore monitoring errors
      
      return result;
    })
    .catch((error) => {
      const durationMs = Date.now() - startTime;
      
      // Log error metric
      logPerformanceMetric({
        endpoint,
        method,
        durationMs,
        statusCode: error.status || 500,
        errorMessage: error.message
      }).catch(() => {}); // Ignore monitoring errors
      
      throw error;
    });
}

/**
 * Create performance monitoring headers
 */
export function getPerformanceHeaders(durationMs: number): Record<string, string> {
  return {
    'X-Response-Time': `${durationMs}ms`,
    'Server-Timing': `total;dur=${durationMs}`
  };
}

/**
 * Simple timer utility
 */
export class PerformanceTimer {
  private startTime: number;
  private marks: Map<string, number>;
  
  constructor() {
    this.startTime = Date.now();
    this.marks = new Map();
  }
  
  mark(label: string): void {
    this.marks.set(label, Date.now() - this.startTime);
  }
  
  getDuration(label?: string): number {
    if (label) {
      return this.marks.get(label) || 0;
    }
    return Date.now() - this.startTime;
  }
  
  getMarks(): Record<string, number> {
    return Object.fromEntries(this.marks);
  }
  
  toString(): string {
    const total = this.getDuration();
    const marks = Array.from(this.marks.entries())
      .map(([label, duration]) => `${label}=${duration}ms`)
      .join(', ');
    
    return `total=${total}ms${marks ? ` (${marks})` : ''}`;
  }
}

