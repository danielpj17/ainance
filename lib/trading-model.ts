import * as tf from '@tensorflow/tfjs'

// Types and Interfaces
export interface MarketData {
  timestamp: string
  open: number
  high: number
  low: number
  close: number
  volume: number
  symbol: string
}

export interface TechnicalIndicators {
  rsi: number
  macd: number
  macdSignal: number
  macdHistogram: number
  bbUpper: number
  bbMiddle: number
  bbLower: number
  bbWidth: number
  volumeMA: number
  ema10_1min: number
  ema10_5min: number
  emaTrend: number // 1 if 5min EMA > 1min EMA, 0 otherwise
}

export interface NewsSentiment {
  score: number // -1 to 1
  headlines: string[]
  timestamp: string
}

export interface TradingFeatures {
  rsi: number
  macd: number
  bbWidth: number
  volumeRatio: number
  newsSentiment: number
  emaTrend: number
}

export interface TradingSignal {
  symbol: string
  action: 'buy' | 'sell' | 'hold'
  confidence: number
  price: number
  timestamp: string
  reasoning: string
}

export interface TradingSettings {
  strategy: 'cash' | '25k_plus'
  account_type: 'cash' | 'margin'
  max_exposure?: number  // Max total exposure % (default 90)
  cash_balance?: number
  buying_power?: number
}

export interface TradeHistory {
  symbol: string
  action: 'buy' | 'sell'
  quantity: number
  price: number
  timestamp: string
  strategy: string
  account_type: string
}

export interface BacktestResult {
  totalReturn: number
  winRate: number
  sharpeRatio: number
  maxDrawdown: number
  totalTrades: number
  winningTrades: number
  losingTrades: number
  avgWin: number
  avgLoss: number
  trades: TradeHistory[]
  equity_curve?: { date: string; equity: number }[] // Added for backtest
}

class TradingModel {
  private model: tf.LayersModel | null = null
  public isTrained = false
  private tradeHistory: TradeHistory[] = []

  constructor() {
    this.initializeModel()
  }

  // Initialize the neural network model
  private initializeModel(): void {
    this.model = tf.sequential({
      layers: [
        tf.layers.dense({
          inputShape: [6], // RSI, MACD, BB Width, Volume Ratio, News Sentiment, EMA Trend
          units: 64,
          activation: 'relu',
          kernelRegularizer: tf.regularizers.l2({ l2: 0.001 })
        }),
        tf.layers.dropout({ rate: 0.3 }),
        tf.layers.dense({
          units: 32,
          activation: 'relu',
          kernelRegularizer: tf.regularizers.l2({ l2: 0.001 })
        }),
        tf.layers.dropout({ rate: 0.2 }),
        tf.layers.dense({
          units: 16,
          activation: 'relu'
        }),
        tf.layers.dense({
          units: 3, // Buy, Sell, Hold
          activation: 'softmax'
        })
      ]
    })

    this.model.compile({
      optimizer: tf.train.adam(0.001),
      loss: 'categoricalCrossentropy',
      metrics: ['accuracy']
    })
  }

  // Calculate RSI (Relative Strength Index)
  private calculateRSI(prices: number[], period = 14): number[] {
    const rsi: number[] = []
    
    for (let i = period; i < prices.length; i++) {
      let gains = 0
      let losses = 0
      
      for (let j = i - period + 1; j <= i; j++) {
        const change = prices[j] - prices[j - 1]
        if (change > 0) gains += change
        else losses += Math.abs(change)
      }
      
      const avgGain = gains / period
      const avgLoss = losses / period
      const rs = avgGain / avgLoss
      const rsiValue = 100 - (100 / (1 + rs))
      rsi.push(rsiValue)
    }
    
    return rsi
  }

  // Calculate MACD
  private calculateMACD(prices: number[], fastPeriod = 12, slowPeriod = 26, signalPeriod = 9): {
    macd: number[]
    signal: number[]
    histogram: number[]
  } {
    const emaFast = this.calculateEMA(prices, fastPeriod)
    const emaSlow = this.calculateEMA(prices, slowPeriod)
    
    const macd: number[] = []
    for (let i = slowPeriod - 1; i < prices.length; i++) {
      macd.push(emaFast[i - slowPeriod + fastPeriod] - emaSlow[i])
    }
    
    const signal = this.calculateEMA(macd, signalPeriod)
    const histogram: number[] = []
    
    for (let i = signalPeriod - 1; i < macd.length; i++) {
      histogram.push(macd[i] - signal[i - signalPeriod + 1])
    }
    
    return { macd, signal, histogram }
  }

  // Calculate EMA (Exponential Moving Average)
  private calculateEMA(prices: number[], period: number): number[] {
    const ema: number[] = []
    const multiplier = 2 / (period + 1)
    
    ema[0] = prices[0]
    
    for (let i = 1; i < prices.length; i++) {
      ema[i] = (prices[i] * multiplier) + (ema[i - 1] * (1 - multiplier))
    }
    
    return ema
  }

  // Calculate Bollinger Bands
  private calculateBollingerBands(prices: number[], period = 20, stdDev = 2): {
    upper: number[]
    middle: number[]
    lower: number[]
    width: number[]
  } {
    const middle = this.calculateEMA(prices, period)
    const upper: number[] = []
    const lower: number[] = []
    const width: number[] = []
    
    for (let i = period - 1; i < prices.length; i++) {
      const slice = prices.slice(i - period + 1, i + 1)
      const mean = slice.reduce((sum, price) => sum + price, 0) / period
      const variance = slice.reduce((sum, price) => sum + Math.pow(price - mean, 2), 0) / period
      const stdDeviation = Math.sqrt(variance)
      
      const upperBand = mean + (stdDev * stdDeviation)
      const lowerBand = mean - (stdDev * stdDeviation)
      
      upper.push(upperBand)
      lower.push(lowerBand)
      width.push((upperBand - lowerBand) / mean)
    }
    
    return { upper, middle, lower, width }
  }

  // Calculate technical indicators from market data
  public calculateTechnicalIndicators(data: MarketData[]): TechnicalIndicators[] {
    const prices = data.map(d => d.close)
    const volumes = data.map(d => d.volume)
    
    const rsi = this.calculateRSI(prices)
    const macdData = this.calculateMACD(prices)
    const bbData = this.calculateBollingerBands(prices)
    const volumeMA = this.calculateEMA(volumes, 20)
    const ema10 = this.calculateEMA(prices, 10)
    
    const indicators: TechnicalIndicators[] = []
    
    for (let i = 26; i < data.length; i++) { // Start after MACD calculation
      const bbIndex = i - 20 // Bollinger Bands offset
      const rsiIndex = i - 14 // RSI offset
      
      if (bbIndex >= 0 && rsiIndex >= 0) {
        indicators.push({
          rsi: rsi[rsiIndex],
          macd: macdData.macd[i - 26],
          macdSignal: macdData.signal[i - 26],
          macdHistogram: macdData.histogram[i - 26],
          bbUpper: bbData.upper[bbIndex],
          bbMiddle: bbData.middle[bbIndex],
          bbLower: bbData.lower[bbIndex],
          bbWidth: bbData.width[bbIndex],
          volumeMA: volumeMA[i],
          ema10_1min: ema10[i],
          ema10_5min: 0, // Will be calculated separately for 5-min data
          emaTrend: 0 // Will be calculated when combining timeframes
        })
      }
    }
    
    return indicators
  }

  // Combine 1-min and 5-min indicators for multi-timeframe analysis
  public combineTimeframes(
    indicators1min: TechnicalIndicators[],
    indicators5min: TechnicalIndicators[]
  ): TechnicalIndicators[] {
    const combined: TechnicalIndicators[] = []
    
    for (let i = 0; i < indicators1min.length; i++) {
      const idx5min = Math.floor(i / 5) // Every 5th 1-min bar corresponds to 1 5-min bar
      
      if (idx5min < indicators5min.length) {
        const combinedIndicator = {
          ...indicators1min[i],
          ema10_5min: indicators5min[idx5min].ema10_1min,
          emaTrend: indicators5min[idx5min].ema10_1min > indicators1min[i].ema10_1min ? 1 : 0
        }
        combined.push(combinedIndicator)
      }
    }
    
    return combined
  }

  // Prepare features for ML model
  public prepareFeatures(indicators: TechnicalIndicators, newsSentiment: number): TradingFeatures {
    return {
      rsi: indicators.rsi / 100, // Normalize RSI to 0-1
      macd: indicators.macd,
      bbWidth: indicators.bbWidth,
      volumeRatio: indicators.volumeMA > 0 ? 1 : 0, // Simplified for now
      newsSentiment,
      emaTrend: indicators.emaTrend
    }
  }

  // Train the model
  public async trainModel(
    trainingData: { features: TradingFeatures[], targets: number[] }
  ): Promise<void> {
    if (!this.model) {
      throw new Error('Model not initialized')
    }

    const { features, targets } = trainingData
    
    // Convert targets to categorical (one-hot encoding)
    const categoricalTargets = targets.map(target => {
      if (target === 1) return [1, 0, 0] // Buy
      if (target === -1) return [0, 1, 0] // Sell
      return [0, 0, 1] // Hold
    })

    const xs = tf.tensor2d(features.map(f => [
      f.rsi,
      f.macd,
      f.bbWidth,
      f.volumeRatio,
      f.newsSentiment,
      f.emaTrend
    ]))
    
    const ys = tf.tensor2d(categoricalTargets)

    // Train the model
    await this.model.fit(xs, ys, {
      epochs: 100,
      batchSize: 32,
      validationSplit: 0.2,
      callbacks: {
        onEpochEnd: (epoch, logs) => {
          console.log(`Epoch ${epoch}: loss = ${logs?.loss?.toFixed(4)}, accuracy = ${logs?.acc?.toFixed(4)}`)
        }
      }
    })

    // Clean up tensors
    xs.dispose()
    ys.dispose()
    
    this.isTrained = true
    console.log('Model training completed')
  }

  // Make predictions
  public async predict(features: TradingFeatures[]): Promise<{ action: string, confidence: number }[]> {
    if (!this.model || !this.isTrained) {
      throw new Error('Model not trained yet')
    }

    const xs = tf.tensor2d(features.map(f => [
      f.rsi,
      f.macd,
      f.bbWidth,
      f.volumeRatio,
      f.newsSentiment,
      f.emaTrend
    ]))

    const predictions = this.model.predict(xs) as tf.Tensor
    const predictionsArray = await predictions.data()
    
    const results: { action: string, confidence: number }[] = []
    
    for (let i = 0; i < features.length; i++) {
      const startIdx = i * 3
      const buyConfidence = predictionsArray[startIdx]
      const sellConfidence = predictionsArray[startIdx + 1]
      const holdConfidence = predictionsArray[startIdx + 2]
      
      const maxConfidence = Math.max(buyConfidence, sellConfidence, holdConfidence)
      let action = 'hold'
      
      if (maxConfidence === buyConfidence) action = 'buy'
      else if (maxConfidence === sellConfidence) action = 'sell'
      
      results.push({ action, confidence: maxConfidence })
    }

    // Clean up tensors
    xs.dispose()
    predictions.dispose()
    
    return results
  }

  // Conditional trading logic
  public generateTradingSignals(
    predictions: { action: string, confidence: number }[],
    symbols: string[],
    settings: TradingSettings,
    currentPrices: number[]
  ): TradingSignal[] {
    const signals: TradingSignal[] = []
    const now = new Date().toISOString()
    
    // Check trade limits for cash accounts
    const recentTrades = this.getRecentTrades(5) // Last 5 days
    const canTrade = this.canExecuteTrade(settings, recentTrades)
    
    for (let i = 0; i < predictions.length; i++) {
      const prediction = predictions[i]
      const symbol = symbols[i]
      const price = currentPrices[i]
      
      if (prediction.confidence < 0.6) continue // Low confidence, skip
      
      let action: 'buy' | 'sell' | 'hold' = 'hold'
      let reasoning = ''
      
      // Apply conditional logic based on strategy
      if (settings.strategy === 'cash') {
        // Cash trading rules
        if (prediction.action === 'buy' && canTrade && recentTrades.length < 3) {
          action = 'buy'
          reasoning = `Cash strategy: Buy signal with ${(prediction.confidence * 100).toFixed(1)}% confidence`
        } else if (prediction.action === 'sell' && canTrade && recentTrades.length < 3) {
          action = 'sell'
          reasoning = `Cash strategy: Sell signal with ${(prediction.confidence * 100).toFixed(1)}% confidence`
        } else {
          reasoning = 'Cash strategy: Trade limit reached or low confidence'
        }
      } else {
        // $25k+ rules
        if (prediction.action === 'buy' && canTrade) {
          action = 'buy'
          reasoning = `$25k+ strategy: Buy signal with ${(prediction.confidence * 100).toFixed(1)}% confidence`
        } else if (prediction.action === 'sell' && canTrade) {
          action = 'sell'
          reasoning = `$25k+ strategy: Sell signal with ${(prediction.confidence * 100).toFixed(1)}% confidence`
        } else {
          reasoning = '$25k+ strategy: Low confidence or trading restrictions'
        }
      }
      
      if (action !== 'hold') {
        signals.push({
          symbol,
          action,
          confidence: prediction.confidence,
          price,
          timestamp: now,
          reasoning
        })
      }
    }
    
    return signals
  }

  // Check if trade can be executed based on settings and history
  private canExecuteTrade(settings: TradingSettings, recentTrades: TradeHistory[]): boolean {
    // Check daily loss limit
    const today = new Date().toDateString()
    const todayTrades = recentTrades.filter(trade => 
      new Date(trade.timestamp).toDateString() === today
    )
    
    // Daily loss limit check removed - not used in actual trading logic
    
    // Check account type restrictions
    if (settings.account_type === 'cash' && settings.strategy === 'cash') {
      // T+2 settlement check (simplified)
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
      const recentBuys = recentTrades.filter(trade => 
        trade.action === 'buy' && new Date(trade.timestamp) > twoDaysAgo
      )
      
      if (recentBuys.length > 0) {
        return false // T+2 restriction
      }
    }
    
    return true
  }

  // Get recent trades for limit checking
  private getRecentTrades(days: number): TradeHistory[] {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    return this.tradeHistory.filter(trade => new Date(trade.timestamp) > cutoff)
  }

  // Backtest the strategy
  public async backtest(
    startDate: string,
    endDate: string,
    settings: TradingSettings,
    historicalData: { [symbol: string]: MarketData[] },
    newsSentimentData: { [symbol: string]: NewsSentiment[] },
    historicalData5m?: { [symbol: string]: MarketData[] }
  ): Promise<BacktestResult> {
    const results: TradeHistory[] = []
    let portfolioValue = settings.cash_balance || 100000
    let positions: { [symbol: string]: number } = {}
    let peakValue = portfolioValue
    let maxDrawdown = 0
    const equityCurve: { date: string; equity: number }[] = []

    // For each symbol, get 1-min and 5-min indicators
    const indicators1m: { [symbol: string]: TechnicalIndicators[] } = {}
    const indicators5m: { [symbol: string]: TechnicalIndicators[] } = {}
    for (const symbol of Object.keys(historicalData)) {
      indicators1m[symbol] = this.calculateTechnicalIndicators(historicalData[symbol])
      if (historicalData5m && historicalData5m[symbol]) {
        indicators5m[symbol] = this.calculateTechnicalIndicators(historicalData5m[symbol])
      } else {
        indicators5m[symbol] = []
      }
    }

    // Process each day in the backtest period
    const start = new Date(startDate)
    const end = new Date(endDate)
    for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
      const dateStr = date.toISOString().split('T')[0]
      // For each symbol, get the latest 1-min and 5-min indicators for this date
      for (const symbol of Object.keys(historicalData)) {
        const oneMinBars = historicalData[symbol].filter(d => d.timestamp.startsWith(dateStr))
        const fiveMinBars = historicalData5m && historicalData5m[symbol] ? historicalData5m[symbol].filter(d => d.timestamp.startsWith(dateStr)) : []
        if (oneMinBars.length === 0 || fiveMinBars.length === 0) continue
        const oneMinIndicators = this.calculateTechnicalIndicators(oneMinBars)
        const fiveMinIndicators = this.calculateTechnicalIndicators(fiveMinBars)
        // Combine timeframes
        const combinedIndicators = this.combineTimeframes(oneMinIndicators, fiveMinIndicators)
        if (combinedIndicators.length === 0) continue
        // Use the latest combined indicator
        const latestIndicator = combinedIndicators[combinedIndicators.length - 1]
        const sentiment = (newsSentimentData[symbol]?.find(s => s.timestamp.startsWith(dateStr))?.score) || 0
        const features = this.prepareFeatures(latestIndicator, sentiment)
        // Predict
        const predictions = await this.predict([features])
        // Multi-timeframe confirmation: only allow trade if 5-min EMA(10) aligns with 1-min signal
        const signal = predictions[0]
        const ema10_1min = latestIndicator.ema10_1min
        const ema10_5min = latestIndicator.ema10_5min
        let allowTrade = false
        if (signal.action === 'buy' && ema10_5min > ema10_1min) allowTrade = true
        if (signal.action === 'sell' && ema10_5min < ema10_1min) allowTrade = true
        if (!allowTrade) continue
        // Generate trading signal and execute trade
        const price = oneMinBars[oneMinBars.length - 1].close
        const tradeSignal: TradingSignal = {
          symbol,
          action: signal.action as 'buy' | 'sell' | 'hold',
          confidence: signal.confidence,
          price,
          timestamp: date.toISOString(),
          reasoning: 'Multi-timeframe EMA(10) confirmed'
        }
        const trade = this.executeTrade(tradeSignal, settings, portfolioValue)
        if (trade) {
          results.push(trade)
          if (trade.action === 'buy') {
            positions[trade.symbol] = (positions[trade.symbol] || 0) + trade.quantity
            portfolioValue -= trade.price * trade.quantity
          } else {
            positions[trade.symbol] = (positions[trade.symbol] || 0) - trade.quantity
            portfolioValue += trade.price * trade.quantity
          }
        }
      }
      // Track equity curve
      equityCurve.push({ date: dateStr, equity: portfolioValue })
      if (portfolioValue > peakValue) {
        peakValue = portfolioValue
      } else {
        const drawdown = (peakValue - portfolioValue) / peakValue
        if (drawdown > maxDrawdown) {
          maxDrawdown = drawdown
        }
      }
    }
    // Calculate final metrics
    const totalReturn = (portfolioValue - (settings.cash_balance || 100000)) / (settings.cash_balance || 100000)
    const winningTrades = results.filter(t => t.price > 0).length // Simplified
    const losingTrades = results.filter(t => t.price <= 0).length
    const winRate = results.length > 0 ? winningTrades / results.length : 0
    const avgWin = winningTrades > 0 ? results.filter(t => t.price > 0).reduce((sum, t) => sum + t.price, 0) / winningTrades : 0
    const avgLoss = losingTrades > 0 ? Math.abs(results.filter(t => t.price <= 0).reduce((sum, t) => sum + t.price, 0) / losingTrades) : 0
    const sharpeRatio = totalReturn / (maxDrawdown || 0.01)
    return {
      totalReturn,
      winRate,
      sharpeRatio,
      maxDrawdown,
      totalTrades: results.length,
      winningTrades,
      losingTrades,
      avgWin,
      avgLoss,
      trades: results,
      equity_curve: equityCurve
    }
  }

  // Execute a trade based on signal and settings
  private executeTrade(
    signal: TradingSignal,
    settings: TradingSettings,
    availableCapital: number
  ): TradeHistory | null {
    // Only execute buy or sell trades, skip hold signals
    if (signal.action === 'hold') return null
    
    let quantity = 0
    
    if (settings.strategy === 'cash') {
      quantity = Math.floor((availableCapital * 0.01) / signal.price) // 1% of capital
    } else {
      const percentage = 0.05 // 5% for $25k+ strategy
      quantity = Math.floor((availableCapital * percentage) / signal.price)
    }
    
    if (quantity <= 0) return null
    
    return {
      symbol: signal.symbol,
      action: signal.action as 'buy' | 'sell',
      quantity,
      price: signal.price,
      timestamp: signal.timestamp,
      strategy: settings.strategy,
      account_type: settings.account_type
    }
  }

  // Save trade to history
  public addTrade(trade: TradeHistory): void {
    this.tradeHistory.push(trade)
  }

  // Get model summary
  public getModelSummary(): string {
    if (!this.model) return 'Model not initialized'
    
    return JSON.stringify({
      modelType: 'Neural Network',
      layers: 4,
      inputFeatures: 6,
      outputClasses: 3,
      isTrained: this.isTrained,
      strategy: 'Multi-timeframe with sentiment analysis'
    }, null, 2)
  }

  // Dispose of the model
  public dispose(): void {
    if (this.model) {
      this.model.dispose()
      this.model = null
    }
  }
}

// Export singleton instance
export const tradingModel = new TradingModel()

// Export functions for easier usage
export async function trainModel(data: { features: TradingFeatures[], targets: number[] }): Promise<void> {
  return tradingModel.trainModel(data)
}

export async function predict(symbols: string[], settings: TradingSettings): Promise<TradingSignal[]> {
  try {
    // Import news analyzer dynamically to avoid initialization issues
    const { getNewsAnalyzer } = await import('./news-sentiment')
    
    // Get news sentiment for symbols
    let sentimentData: { [symbol: string]: number } = {}
    try {
      const newsAnalyzer = getNewsAnalyzer()
      const sentimentResults = await newsAnalyzer.getSentimentForSymbols(symbols, 1)
      
      for (const [symbol, sentiment] of Object.entries(sentimentResults)) {
        sentimentData[symbol] = sentiment.score
      }
    } catch (error) {
      console.warn('Failed to get news sentiment:', error)
      // Continue without sentiment data
    }

    // Generate mock market data for prediction
    // In a real implementation, you would fetch actual market data
    const features = symbols.map(symbol => ({
      rsi: 0.5, // Would be calculated from real market data
      macd: 0,
      bbWidth: 0.02,
      volumeRatio: 1,
      newsSentiment: sentimentData[symbol] || 0,
      emaTrend: 1
    }))

    // Make predictions
    if (!tradingModel.isTrained) {
      console.log('Model not trained, returning empty predictions')
      return []
    }

    const predictions = await tradingModel.predict(features)
    
    // Generate trading signals
    const currentPrices = symbols.map(() => 150) // Mock prices
    const signals = tradingModel.generateTradingSignals(
      predictions,
      symbols,
      settings,
      currentPrices
    )

    return signals
  } catch (error) {
    console.error('Error in predict function:', error)
    return []
  }
}

export async function backtest(
  dateRange: { start: string, end: string },
  settings: TradingSettings
): Promise<BacktestResult> {
  // This would fetch historical data and run backtest
  // For now, return mock result
  return {
    totalReturn: 0,
    winRate: 0,
    sharpeRatio: 0,
    maxDrawdown: 0,
    totalTrades: 0,
    winningTrades: 0,
    losingTrades: 0,
    avgWin: 0,
    avgLoss: 0,
    trades: []
  }
}
