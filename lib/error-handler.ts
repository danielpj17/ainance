export interface TradingError {
  code: number
  message: string
  type: 'INSUFFICIENT_FUNDS' | 'RATE_LIMIT' | 'SETTLEMENT' | 'MARKET_CLOSED' | 'INVALID_ORDER' | 'UNKNOWN'
  retryable: boolean
  retryAfter?: number // seconds
}

export interface ErrorContext {
  operation: string
  symbol?: string
  quantity?: number
  price?: number
  userId?: string
}

export class TradingErrorHandler {
  // Handle different types of trading errors
  public static handleError(error: any, context: ErrorContext): TradingError {
    console.error(`Trading error in ${context.operation}:`, error)

    // Rate limiting
    if (error.status === 429 || error.message?.includes('rate limit')) {
      return {
        code: 429,
        message: 'Rate limit exceeded. Please wait before making another request.',
        type: 'RATE_LIMIT',
        retryable: true,
        retryAfter: 60 // Wait 1 minute
      }
    }

    // Insufficient funds
    if (error.status === 403 && error.message?.includes('insufficient')) {
      return {
        code: 403,
        message: 'Insufficient funds for this trade. Please check your account balance.',
        type: 'INSUFFICIENT_FUNDS',
        retryable: false
      }
    }

    // Settlement period (T+2 for cash accounts)
    if (error.status === 422 && error.message?.includes('settlement')) {
      return {
        code: 422,
        message: 'Trade blocked due to settlement period. Cash accounts must wait T+2 days between trades.',
        type: 'SETTLEMENT',
        retryable: false
      }
    }

    // Market closed
    if (error.status === 422 && error.message?.includes('market closed')) {
      return {
        code: 422,
        message: 'Market is currently closed. Trading is only available during market hours.',
        type: 'MARKET_CLOSED',
        retryable: true,
        retryAfter: 3600 // Wait 1 hour
      }
    }

    // Invalid order parameters
    if (error.status === 422) {
      return {
        code: 422,
        message: 'Invalid order parameters. Please check your trade details.',
        type: 'INVALID_ORDER',
        retryable: false
      }
    }

    // Network/timeout errors
    if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.message?.includes('timeout')) {
      return {
        code: 408,
        message: 'Request timeout. Please try again.',
        type: 'UNKNOWN',
        retryable: true,
        retryAfter: 30 // Wait 30 seconds
      }
    }

    // Generic error
    return {
      code: error.status || 500,
      message: error.message || 'An unexpected error occurred',
      type: 'UNKNOWN',
      retryable: false
    }
  }

  // Check if an operation should be retried
  public static shouldRetry(error: TradingError, attempt: number): boolean {
    const maxRetries = 3
    return error.retryable && attempt < maxRetries
  }

  // Get retry delay with exponential backoff
  public static getRetryDelay(error: TradingError, attempt: number): number {
    const baseDelay = error.retryAfter || 5 // Default 5 seconds
    const exponentialDelay = baseDelay * Math.pow(2, attempt - 1)
    const jitter = Math.random() * 0.1 * exponentialDelay // Add 10% jitter
    return Math.min(exponentialDelay + jitter, 300) // Cap at 5 minutes
  }

  // Log error for monitoring
  public static logError(error: TradingError, context: ErrorContext): void {
    const logData = {
      timestamp: new Date().toISOString(),
      error: {
        code: error.code,
        message: error.message,
        type: error.type,
        retryable: error.retryable
      },
      context,
      severity: error.type === 'INSUFFICIENT_FUNDS' || error.type === 'SETTLEMENT' ? 'high' : 'medium'
    }

    console.error('Trading Error Log:', logData)

    // In production, you would send this to your logging service
    // e.g., Sentry, LogRocket, or your own logging API
  }

  // Validate trade parameters before execution
  public static validateTradeParams(params: {
    symbol: string
    quantity: number
    price?: number
    accountBalance: number
    buyingPower: number
  }): { valid: boolean, error?: string } {
    // Check symbol format
    if (!params.symbol || !/^[A-Z]{1,5}$/.test(params.symbol)) {
      return { valid: false, error: 'Invalid symbol format' }
    }

    // Check quantity
    if (!params.quantity || params.quantity <= 0 || !Number.isInteger(params.quantity)) {
      return { valid: false, error: 'Quantity must be a positive integer' }
    }

    // Check price if provided
    if (params.price !== undefined && (params.price <= 0 || !Number.isFinite(params.price))) {
      return { valid: false, error: 'Price must be a positive number' }
    }

    // Check buying power
    const totalCost = params.price ? params.price * params.quantity : 0
    if (totalCost > params.buyingPower) {
      return { valid: false, error: 'Insufficient buying power for this trade' }
    }

    return { valid: true }
  }

  // Check trading hours (simplified)
  public static isMarketOpen(): boolean {
    const now = new Date()
    const day = now.getDay()
    const hour = now.getHours()
    const minute = now.getMinutes()
    const time = hour * 60 + minute

    // Market is closed on weekends
    if (day === 0 || day === 6) {
      return false
    }

    // Market hours: 9:30 AM - 4:00 PM ET (simplified)
    const marketOpen = 9 * 60 + 30 // 9:30 AM
    const marketClose = 16 * 60 // 4:00 PM

    return time >= marketOpen && time < marketClose
  }

  // Get user-friendly error message
  public static getUserFriendlyMessage(error: TradingError): string {
    switch (error.type) {
      case 'INSUFFICIENT_FUNDS':
        return 'You don\'t have enough funds for this trade. Please check your account balance and try again.'
      
      case 'RATE_LIMIT':
        return 'Too many requests. Please wait a moment before trying again.'
      
      case 'SETTLEMENT':
        return 'This trade is blocked due to settlement rules. Cash accounts must wait 2 business days between trades.'
      
      case 'MARKET_CLOSED':
        return 'The market is currently closed. Trading is only available during market hours (9:30 AM - 4:00 PM ET).'
      
      case 'INVALID_ORDER':
        return 'There was an issue with your order. Please check the details and try again.'
      
      default:
        return 'An unexpected error occurred. Please try again later or contact support if the problem persists.'
    }
  }
}

// Utility function for retrying operations
export async function withRetry<T>(
  operation: () => Promise<T>,
  context: ErrorContext,
  maxAttempts: number = 3
): Promise<T> {
  let lastError: TradingError

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = TradingErrorHandler.handleError(error, context)
      
      if (!TradingErrorHandler.shouldRetry(lastError, attempt)) {
        throw lastError
      }

      const delay = TradingErrorHandler.getRetryDelay(lastError, attempt)
      console.log(`Retry attempt ${attempt}/${maxAttempts} after ${delay}ms`)
      
      await new Promise(resolve => setTimeout(resolve, delay * 1000))
    }
  }

  throw lastError!
}

export default TradingErrorHandler
