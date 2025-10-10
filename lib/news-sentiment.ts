const vader = require('vader-sentiment')

export interface NewsArticle {
  title: string
  description: string
  content: string
  publishedAt: string
  source: string
  url: string
}

export interface NewsSentiment {
  score: number // -1 to 1
  headlines: string[]
  timestamp: string
  confidence: number
  articleCount: number
}

export interface NewsAPIConfig {
  apiKey: string
  baseUrl: string
}

class NewsSentimentAnalyzer {
  private newsAPI: NewsAPIConfig
  private sentimentAnalyzer: any

  constructor(newsAPIKey: string) {
    this.newsAPI = {
      apiKey: newsAPIKey,
      baseUrl: 'https://newsapi.org/v2'
    }
    this.sentimentAnalyzer = vader
  }

  // Fetch news articles for a specific symbol
  public async fetchNewsForSymbol(symbol: string, days = 1): Promise<NewsArticle[]> {
    const endDate = new Date()
    const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000)
    
    const query = `${symbol} OR "${symbol}" stock OR "${symbol}" earnings OR "${symbol}" trading`
    const fromDate = startDate.toISOString().split('T')[0]
    const toDate = endDate.toISOString().split('T')[0]

    try {
      const response = await fetch(
        `${this.newsAPI.baseUrl}/everything?` +
        `q=${encodeURIComponent(query)}&` +
        `from=${fromDate}&` +
        `to=${toDate}&` +
        `sortBy=publishedAt&` +
        `pageSize=50&` +
        `apiKey=${this.newsAPI.apiKey}`,
        {
          headers: {
            'User-Agent': 'ainance-trading-bot/1.0'
          }
        }
      )

      if (!response.ok) {
        throw new Error(`News API error: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()
      
      if (data.status !== 'ok') {
        throw new Error(`News API error: ${data.message}`)
      }

      return data.articles.map((article: any) => ({
        title: article.title || '',
        description: article.description || '',
        content: article.content || '',
        publishedAt: article.publishedAt || '',
        source: article.source?.name || 'Unknown',
        url: article.url || ''
      }))

    } catch (error) {
      console.error('Error fetching news:', error)
      return []
    }
  }

  // Analyze sentiment of a single text
  public analyzeTextSentiment(text: string): { score: number, confidence: number } {
    try {
      const result = this.sentimentAnalyzer.polarity_scores(text)
      
      // VADER returns compound score (-1 to 1) and individual scores
      // We'll use the compound score as our main sentiment score
      const score = result.compound
      
      // Calculate confidence based on the absolute difference between pos and neg scores
      const confidence = Math.abs(result.pos - result.neg)
      
      return { score, confidence }
    } catch (error) {
      console.error('Error analyzing sentiment:', error)
      return { score: 0, confidence: 0 }
    }
  }

  // Analyze sentiment for multiple articles
  public analyzeNewsSentiment(articles: NewsArticle[]): NewsSentiment {
    if (articles.length === 0) {
      return {
        score: 0,
        headlines: [],
        timestamp: new Date().toISOString(),
        confidence: 0,
        articleCount: 0
      }
    }

    let totalScore = 0
    let totalConfidence = 0
    const headlines: string[] = []
    let validArticles = 0

    for (const article of articles) {
      // Combine title and description for sentiment analysis
      const textToAnalyze = `${article.title} ${article.description}`.trim()
      
      if (textToAnalyze.length > 10) { // Only analyze if we have meaningful text
        const sentiment = this.analyzeTextSentiment(textToAnalyze)
        
        // Weight the sentiment by confidence
        totalScore += sentiment.score * sentiment.confidence
        totalConfidence += sentiment.confidence
        headlines.push(article.title)
        validArticles++
      }
    }

    // Calculate weighted average sentiment
    const avgScore = validArticles > 0 ? totalScore / totalConfidence : 0
    const avgConfidence = validArticles > 0 ? totalConfidence / validArticles : 0

    // Normalize score to ensure it's between -1 and 1
    const normalizedScore = Math.max(-1, Math.min(1, avgScore))

    return {
      score: normalizedScore,
      headlines: headlines.slice(0, 5), // Keep only first 5 headlines
      timestamp: new Date().toISOString(),
      confidence: avgConfidence,
      articleCount: validArticles
    }
  }

  // Get sentiment for a specific symbol
  public async getSentimentForSymbol(symbol: string, days = 1): Promise<NewsSentiment> {
    try {
      const articles = await this.fetchNewsForSymbol(symbol, days)
      return this.analyzeNewsSentiment(articles)
    } catch (error) {
      console.error(`Error getting sentiment for ${symbol}:`, error)
      return {
        score: 0,
        headlines: [],
        timestamp: new Date().toISOString(),
        confidence: 0,
        articleCount: 0
      }
    }
  }

  // Get sentiment for multiple symbols
  public async getSentimentForSymbols(symbols: string[], days = 1): Promise<{ [symbol: string]: NewsSentiment }> {
    const results: { [symbol: string]: NewsSentiment } = {}
    
    // Process symbols in parallel with rate limiting
    const batchSize = 3 // Process 3 symbols at a time to respect API limits
    for (let i = 0; i < symbols.length; i += batchSize) {
      const batch = symbols.slice(i, i + batchSize)
      
      const batchPromises = batch.map(async (symbol) => {
        const sentiment = await this.getSentimentForSymbol(symbol, days)
        return { symbol, sentiment }
      })
      
      const batchResults = await Promise.all(batchPromises)
      
      for (const { symbol, sentiment } of batchResults) {
        results[symbol] = sentiment
      }
      
      // Add delay between batches to respect API rate limits
      if (i + batchSize < symbols.length) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }
    
    return results
  }

  // Filter articles by relevance to trading
  public filterRelevantArticles(articles: NewsArticle[], symbol: string): NewsArticle[] {
    const relevantKeywords = [
      'earnings', 'revenue', 'profit', 'loss', 'guidance', 'forecast',
      'merger', 'acquisition', 'partnership', 'deal',
      'upgrade', 'downgrade', 'rating', 'analyst',
      'FDA', 'approval', 'trial', 'clinical', // For biotech/pharma
      'launch', 'product', 'innovation', 'technology',
      'regulation', 'lawsuit', 'investigation',
      'dividend', 'buyback', 'split'
    ]

    return articles.filter(article => {
      const text = `${article.title} ${article.description}`.toLowerCase()
      
      // Must contain the symbol
      if (!text.includes(symbol.toLowerCase())) {
        return false
      }
      
      // Must contain at least one relevant keyword
      return relevantKeywords.some(keyword => text.includes(keyword))
    })
  }

  // Get market sentiment (overall market news)
  public async getMarketSentiment(): Promise<NewsSentiment> {
    const marketKeywords = [
      'federal reserve', 'fed', 'interest rate', 'inflation',
      'market', 'dow jones', 'nasdaq', 's&p 500',
      'recession', 'economy', 'gdp', 'unemployment',
      'trade war', 'tariff', 'china', 'trade deal'
    ]

    try {
      const query = marketKeywords.join(' OR ')
      const endDate = new Date()
      const startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000) // Last 24 hours
      
      const fromDate = startDate.toISOString().split('T')[0]
      const toDate = endDate.toISOString().split('T')[0]

      const response = await fetch(
        `${this.newsAPI.baseUrl}/everything?` +
        `q=${encodeURIComponent(query)}&` +
        `from=${fromDate}&` +
        `to=${toDate}&` +
        `sortBy=publishedAt&` +
        `pageSize=30&` +
        `apiKey=${this.newsAPI.apiKey}`,
        {
          headers: {
            'User-Agent': 'ainance-trading-bot/1.0'
          }
        }
      )

      if (!response.ok) {
        throw new Error(`Market news API error: ${response.status}`)
      }

      const data = await response.json()
      
      if (data.status !== 'ok') {
        throw new Error(`Market news API error: ${data.message}`)
      }

      const articles = data.articles.map((article: any) => ({
        title: article.title || '',
        description: article.description || '',
        content: article.content || '',
        publishedAt: article.publishedAt || '',
        source: article.source?.name || 'Unknown',
        url: article.url || ''
      }))

      return this.analyzeNewsSentiment(articles)

    } catch (error) {
      console.error('Error fetching market sentiment:', error)
      return {
        score: 0,
        headlines: [],
        timestamp: new Date().toISOString(),
        confidence: 0,
        articleCount: 0
      }
    }
  }

  // Update sentiment in database (for caching)
  public async cacheSentiment(
    symbol: string, 
    sentiment: NewsSentiment,
    supabaseClient: any
  ): Promise<void> {
    try {
      const { error } = await supabaseClient
        .from('news_sentiment')
        .upsert({
          symbol,
          sentiment_score: sentiment.score,
          confidence: sentiment.confidence,
          article_count: sentiment.articleCount,
          headlines: sentiment.headlines,
          updated_at: sentiment.timestamp
        }, { onConflict: 'symbol' })

      if (error) {
        console.error('Error caching sentiment:', error)
      }
    } catch (error) {
      console.error('Error caching sentiment:', error)
    }
  }

  // Get cached sentiment
  public async getCachedSentiment(
    symbol: string,
    supabaseClient: any,
    maxAgeHours = 2
  ): Promise<NewsSentiment | null> {
    try {
      const cutoffTime = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000).toISOString()
      
      const { data, error } = await supabaseClient
        .from('news_sentiment')
        .select('*')
        .eq('symbol', symbol)
        .gte('updated_at', cutoffTime)
        .single()

      if (error || !data) {
        return null
      }

      return {
        score: data.sentiment_score,
        headlines: data.headlines || [],
        timestamp: data.updated_at,
        confidence: data.confidence,
        articleCount: data.article_count
      }
    } catch (error) {
      console.error('Error getting cached sentiment:', error)
      return null
    }
  }
}

// Export singleton instance (will be initialized with API key from environment)
let newsAnalyzer: NewsSentimentAnalyzer | null = null

export function initializeNewsAnalyzer(apiKey: string): NewsSentimentAnalyzer {
  newsAnalyzer = new NewsSentimentAnalyzer(apiKey)
  return newsAnalyzer
}

export function getNewsAnalyzer(): NewsSentimentAnalyzer {
  if (!newsAnalyzer) {
    throw new Error('News analyzer not initialized. Call initializeNewsAnalyzer first.')
  }
  return newsAnalyzer
}

// Export utility functions
export async function getSentimentForSymbol(symbol: string): Promise<NewsSentiment> {
  const analyzer = getNewsAnalyzer()
  return analyzer.getSentimentForSymbol(symbol)
}

export async function getSentimentForSymbols(symbols: string[]): Promise<{ [symbol: string]: NewsSentiment }> {
  const analyzer = getNewsAnalyzer()
  return analyzer.getSentimentForSymbols(symbols)
}

export async function getMarketSentiment(): Promise<NewsSentiment> {
  const analyzer = getNewsAnalyzer()
  return analyzer.getMarketSentiment()
}
