/**
 * Rate Limiting Utilities
 * 
 * Implements rate limiting for API endpoints using Supabase
 */

import { createClient } from '@supabase/supabase-js';

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  identifier: string; // User ID or IP address
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  reset: number;
  total: number;
}

/**
 * Check rate limit for a user/IP
 */
export async function checkRateLimit(config: RateLimitConfig): Promise<RateLimitResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  
  if (!supabaseUrl || !supabaseKey) {
    console.warn('Rate limiting disabled: Supabase credentials missing');
    return { allowed: true, remaining: config.maxRequests, reset: Date.now() + config.windowMs, total: config.maxRequests };
  }
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  const now = Date.now();
  const windowStart = now - config.windowMs;
  const key = `ratelimit:${config.identifier}`;
  
  try {
    // Get or create rate limit record
    const { data: existing } = await supabase
      .from('rate_limits')
      .select('*')
      .eq('key', key)
      .single();
    
    if (!existing) {
      // Create new record
      await supabase.from('rate_limits').insert({
        key,
        count: 1,
        window_start: new Date(now).toISOString(),
        window_end: new Date(now + config.windowMs).toISOString()
      });
      
      return {
        allowed: true,
        remaining: config.maxRequests - 1,
        reset: now + config.windowMs,
        total: config.maxRequests
      };
    }
    
    const windowEnd = new Date(existing.window_end).getTime();
    
    // Check if window has expired
    if (now > windowEnd) {
      // Reset window
      await supabase
        .from('rate_limits')
        .update({
          count: 1,
          window_start: new Date(now).toISOString(),
          window_end: new Date(now + config.windowMs).toISOString()
        })
        .eq('key', key);
      
      return {
        allowed: true,
        remaining: config.maxRequests - 1,
        reset: now + config.windowMs,
        total: config.maxRequests
      };
    }
    
    // Check if limit exceeded
    if (existing.count >= config.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        reset: windowEnd,
        total: config.maxRequests
      };
    }
    
    // Increment counter
    await supabase
      .from('rate_limits')
      .update({ count: existing.count + 1 })
      .eq('key', key);
    
    return {
      allowed: true,
      remaining: config.maxRequests - existing.count - 1,
      reset: windowEnd,
      total: config.maxRequests
    };
    
  } catch (error) {
    console.error('Rate limit check error:', error);
    // Fail open (allow request) on error
    return {
      allowed: true,
      remaining: config.maxRequests,
      reset: now + config.windowMs,
      total: config.maxRequests
    };
  }
}

/**
 * Rate limit middleware for API routes
 */
export async function withRateLimit(
  identifier: string,
  maxRequests = 100,
  windowMs = 60000 // 1 minute
): Promise<RateLimitResult> {
  return checkRateLimit({
    maxRequests,
    windowMs,
    identifier
  });
}

/**
 * Get rate limit headers for response
 */
export function getRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    'X-RateLimit-Limit': result.total.toString(),
    'X-RateLimit-Remaining': result.remaining.toString(),
    'X-RateLimit-Reset': new Date(result.reset).toISOString(),
    'Retry-After': Math.ceil((result.reset - Date.now()) / 1000).toString()
  };
}

