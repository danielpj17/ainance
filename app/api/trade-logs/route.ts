export const runtime = 'nodejs'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, getDemoUserIdServer } from '@/utils/supabase/server'
import { createAlpacaClient, getAlpacaKeys } from '@/lib/alpaca-client'
import { isDemoMode } from '@/lib/demo-user'

export interface TradeLog {
  id: bigint
  symbol: string
  trade_pair_id: string
  action: string
  qty: number
  price: number
  total_value: number
  timestamp: string
  status: string
  buy_timestamp?: string
  buy_price?: number
  buy_decision_metrics?: any
  sell_timestamp?: string
  sell_price?: number
  sell_decision_metrics?: any
  profit_loss?: number
  profit_loss_percent?: number
  holding_duration?: string
  strategy: string
  account_type: string
  alpaca_order_id?: string
  order_status?: string
  created_at: string
  updated_at: string
}

export interface CurrentTrade {
  id: bigint
  symbol: string
  qty: number
  buy_price: number
  buy_timestamp: string
  current_price: number
  current_value: number
  unrealized_pl: number
  unrealized_pl_percent: number
  holding_duration: string
  buy_decision_metrics: any
  strategy: string
  account_type: string
  trade_pair_id: string
}

export interface CompletedTrade {
  id: bigint
  symbol: string
  qty: number
  buy_price: number
  buy_timestamp: string
  sell_price: number
  sell_timestamp: string
  profit_loss: number
  profit_loss_percent: number
  holding_duration: string
  buy_decision_metrics: any
  sell_decision_metrics: any
  strategy: string
  account_type: string
  trade_pair_id: string
}

export interface TradeStatistics {
  total_trades: number
  open_trades: number
  closed_trades: number
  winning_trades: number
  losing_trades: number
  total_profit_loss: number
  avg_profit_loss: number
  win_rate: number
  avg_holding_duration: string
  best_trade: number
  worst_trade: number
}

// GET - Fetch trade logs
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createServerClient(req, {})
    
    // In demo mode, always use demo user ID
    let userId: string
    if (isDemoMode()) {
      userId = getDemoUserIdServer()
    } else {
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
      }
      userId = user.id
    }

    const { searchParams } = new URL(req.url)
    const view = searchParams.get('view') // 'current', 'completed', 'all', 'statistics'
    const limit = parseInt(searchParams.get('limit') || '100')
    const offset = parseInt(searchParams.get('offset') || '0')

    let currentTrades: CurrentTrade[] = []
    let completedTrades: CompletedTrade[] = []
    let statistics: TradeStatistics | null = null

    // Fetch trade statistics
    if (view === 'statistics' || view === 'all' || !view) {
      const { data: statsData, error: statsError } = await supabase.rpc('get_trade_statistics', {
        user_uuid: userId
      })

      if (!statsError && statsData && statsData.length > 0) {
        statistics = statsData[0]
      } else {
        statistics = {
          total_trades: 0,
          open_trades: 0,
          closed_trades: 0,
          winning_trades: 0,
          losing_trades: 0,
          total_profit_loss: 0,
          avg_profit_loss: 0,
          win_rate: 0,
          avg_holding_duration: '0',
          best_trade: 0,
          worst_trade: 0
        }
      }
    }

    // Fetch current/open trades from multiple sources
    if (view === 'current' || view === 'all' || !view) {
      // Get from trade_logs table
      const { data: currentData, error: currentError } = await supabase.rpc('get_current_trades', {
        user_uuid: userId
      })

      if (!currentError && currentData) {
        currentTrades = currentData
      }

      // Helper function to fetch quote for a trade
      async function fetchQuoteForTrade(trade: CurrentTrade, alpacaClient: any, preservedBuyPrice: number) {
        try {
          const quote = await alpacaClient.getLatestQuote(trade.symbol)
          const latestPrice = quote.bid && quote.ask ? (quote.bid + quote.ask) / 2 : (quote.bid || quote.ask || 0)
          
          if (latestPrice && latestPrice > 0 && !isNaN(latestPrice) && isFinite(latestPrice)) {
            const oldPrice = trade.current_price
            trade.current_price = latestPrice
            trade.current_value = trade.qty * latestPrice
            trade.unrealized_pl = (latestPrice - preservedBuyPrice) * trade.qty
            trade.unrealized_pl_percent = ((latestPrice - preservedBuyPrice) / preservedBuyPrice) * 100
            
            console.log(`✅ Updated ${trade.symbol} from quote: ${oldPrice}→${latestPrice}, P&L=${trade.unrealized_pl_percent.toFixed(2)}%`)
            return true
          }
        } catch (quoteError: any) {
          console.warn(`⚠️  Could not fetch quote for ${trade.symbol}:`, quoteError?.message || quoteError)
        }
        return false
      }

      // Also get current positions directly from Alpaca and update current_price
      // Group trades by account_type to fetch from correct Alpaca account
      const tradesByAccountType = new Map<string, CurrentTrade[]>()
      for (const trade of currentTrades) {
        if (!tradesByAccountType.has(trade.account_type)) {
          tradesByAccountType.set(trade.account_type, [])
        }
        tradesByAccountType.get(trade.account_type)!.push(trade)
      }

      console.log(`🔍 Fetching prices for ${currentTrades.length} trades across ${tradesByAccountType.size} account types`)

      try {
        const { data: apiKeys } = await supabase.rpc('get_user_api_keys', {
          user_uuid: userId
        })

        if (!apiKeys?.[0]) {
          console.warn('⚠️  No API keys found for user')
        } else {
          const keys = apiKeys[0]
          
          // Process each account type separately
          for (const [accountType, trades] of tradesByAccountType) {
            if (trades.length === 0) continue
            
            // Determine strategy from first trade (they should all have same strategy)
            const strategy = trades[0]?.strategy || 'cash'
            console.log(`🔍 Processing ${trades.length} trades for ${accountType} account with strategy ${strategy}`)
            
            const alpacaKeys = getAlpacaKeys(keys, accountType as 'paper' | 'live', strategy)
            
            if (!alpacaKeys.apiKey || !alpacaKeys.secretKey) {
              console.warn(`⚠️  No API keys found for ${accountType} account`)
              continue
            }
            
            try {
              const alpacaClient = createAlpacaClient({
                apiKey: alpacaKeys.apiKey,
                secretKey: alpacaKeys.secretKey,
                baseUrl: alpacaKeys.paper ? 'https://paper-api.alpaca.markets' : 'https://api.alpaca.markets',
                paper: alpacaKeys.paper
              })

              await alpacaClient.initialize()

              // Get all open positions from Alpaca
              const positions = await alpacaClient.getPositions()
              console.log(`📊 Alpaca returned ${positions.length} positions for ${accountType} account`)
              
              // Create a map of positions by symbol for quick lookup (case-insensitive)
              const positionMap = new Map<string, any>()
              for (const pos of positions) {
                const symbol = pos.symbol?.toUpperCase()
                if (symbol) {
                  positionMap.set(symbol, pos)
                  console.log(`   Position: ${symbol}, current_price: ${pos.current_price}, qty: ${pos.qty}`)
                }
              }
              
              // Update current_price for trades that exist in Alpaca
              for (const trade of trades) {
                const tradeSymbol = trade.symbol.toUpperCase()
                const position = positionMap.get(tradeSymbol)
                
                if (position) {
                  // Update with live data from Alpaca, but preserve buy_price from database
                  const preservedBuyPrice = trade.buy_price
                  const rawCurrentPrice = position.current_price
                  const newCurrentPrice = typeof rawCurrentPrice === 'string' 
                    ? parseFloat(rawCurrentPrice) 
                    : rawCurrentPrice
                  
                  console.log(`🔍 Processing ${trade.symbol}: buy_price=${preservedBuyPrice}, raw_current=${rawCurrentPrice}, parsed=${newCurrentPrice}`)
                  
                  // Always update current_price from Alpaca if we got a valid value
                  if (newCurrentPrice && !isNaN(newCurrentPrice) && isFinite(newCurrentPrice) && newCurrentPrice > 0) {
                    const oldCurrentPrice = trade.current_price
                    trade.current_price = newCurrentPrice
                    trade.current_value = parseFloat(position.market_value) || (trade.qty * newCurrentPrice)
                    trade.unrealized_pl = parseFloat(position.unrealized_pl) || ((newCurrentPrice - preservedBuyPrice) * trade.qty)
                    trade.unrealized_pl_percent = parseFloat(position.unrealized_plpc) * 100 || (((newCurrentPrice - preservedBuyPrice) / preservedBuyPrice) * 100)
                    
                    console.log(`✅ Updated ${trade.symbol}: buy=${preservedBuyPrice}, current=${oldCurrentPrice}→${newCurrentPrice}, P&L=${trade.unrealized_pl_percent.toFixed(2)}%`)
                  } else {
                    console.warn(`⚠️  Invalid current_price from Alpaca for ${trade.symbol}: raw=${rawCurrentPrice}, parsed=${newCurrentPrice}`)
                    // Try to fetch quote as fallback
                    await fetchQuoteForTrade(trade, alpacaClient, preservedBuyPrice)
                  }
                  
                  // Ensure buy_price is never overwritten
                  if (trade.buy_price !== preservedBuyPrice) {
                    console.warn(`⚠️  buy_price was changed for ${trade.symbol}, restoring: ${preservedBuyPrice}`)
                    trade.buy_price = preservedBuyPrice
                  }
                } else {
                  // Position not found in Alpaca - try to fetch quote
                  console.warn(`⚠️  Position ${trade.symbol} not found in Alpaca ${accountType} account, trying quote...`)
                  await fetchQuoteForTrade(trade, alpacaClient, trade.buy_price)
                }
              }
                
                // Also add positions from Alpaca that aren't in trade_logs
                for (const position of positions) {
                  const existingTrade = trades.find(t => t.symbol === position.symbol)
                  
                  if (!existingTrade) {
                    // Add position from Alpaca that's not in trade_logs
                    const qty = Math.abs(parseFloat(position.qty))
                    const costBasis = parseFloat(position.cost_basis)
                    const avgEntryPrice = qty > 0 ? costBasis / qty : 0
                    
                    currentTrades.push({
                      id: BigInt(0), // Placeholder
                      symbol: position.symbol,
                      qty,
                      buy_price: avgEntryPrice,
                      buy_timestamp: new Date().toISOString(), // Alpaca doesn't provide this in position
                      current_price: parseFloat(position.current_price),
                      current_value: parseFloat(position.market_value),
                      unrealized_pl: parseFloat(position.unrealized_pl),
                      unrealized_pl_percent: parseFloat(position.unrealized_plpc) * 100,
                      holding_duration: '0:0:0', // Will be calculated on frontend
                      buy_decision_metrics: {
                        confidence: 0,
                        reasoning: 'Trade from Alpaca (not logged in system)'
                      },
                      strategy: strategy,
                      account_type: accountType as 'paper' | 'live',
                      trade_pair_id: crypto.randomUUID()
                    })
                  }
                }
              } catch (accountError) {
                console.error(`Error fetching Alpaca positions for ${accountType} account:`, accountError)
                // Continue with other account types
              }
            }
          }
        } catch (error) {
          console.error('Error fetching Alpaca positions:', error)
          // Continue with data from database only
        }
      
      // For any trades that still have current_price == buy_price, try to fetch latest quote as fallback
      for (const trade of currentTrades) {
        if (Math.abs(trade.current_price - trade.buy_price) < 0.01) {
          console.warn(`⚠️  Trade ${trade.symbol} still has current_price (${trade.current_price}) equal to buy_price (${trade.buy_price}) - attempting quote fallback`)
          
          try {
            const { data: apiKeys } = await supabase.rpc('get_user_api_keys', {
              user_uuid: userId
            })
            
            if (apiKeys?.[0]) {
              const keys = apiKeys[0]
              const strategy = trade.strategy || 'cash'
              const alpacaKeys = getAlpacaKeys(keys, trade.account_type as 'paper' | 'live', strategy)
              
              if (alpacaKeys.apiKey && alpacaKeys.secretKey) {
                const alpacaClient = createAlpacaClient({
                  apiKey: alpacaKeys.apiKey,
                  secretKey: alpacaKeys.secretKey,
                  baseUrl: alpacaKeys.paper ? 'https://paper-api.alpaca.markets' : 'https://api.alpaca.markets',
                  paper: alpacaKeys.paper
                })
                
                await alpacaClient.initialize()
                await fetchQuoteForTrade(trade, alpacaClient, trade.buy_price)
              }
            }
          } catch (error) {
            console.warn(`⚠️  Error fetching quote fallback for ${trade.symbol}:`, error)
          }
        }
      }
    }

    // Fetch completed trades from multiple sources
    if (view === 'completed' || view === 'all' || !view) {
      // Get from trade_logs table
      const { data: completedData, error: completedError } = await supabase.rpc('get_completed_trades', {
        user_uuid: userId,
        limit_count: limit,
        offset_count: offset
      })

      if (!completedError && completedData) {
        completedTrades = completedData
      }

      // Also check legacy trades table for completed trades
      try {
        // First check if there are any SELL trades at all
        const { data: sellTrades, error: sellError } = await supabase
          .from('trades')
          .select('*')
          .eq('user_id', userId)
          .eq('action', 'sell')
          .order('trade_timestamp', { ascending: false })
          .limit(10)

        console.log(`Found ${sellTrades?.length || 0} SELL trades in legacy table`)

        const { data: legacyTrades, error: legacyError } = await supabase
          .from('trades')
          .select('*')
          .eq('user_id', userId)
          .order('trade_timestamp', { ascending: false })
          .limit(100)

        if (!legacyError && legacyTrades && legacyTrades.length > 0) {
          console.log(`Found ${legacyTrades.length} legacy trades to process`)
          
          // Group trades by symbol to find buy/sell pairs
          const tradesBySymbol = new Map<string, any[]>()
          
          for (const trade of legacyTrades) {
            if (!tradesBySymbol.has(trade.symbol)) {
              tradesBySymbol.set(trade.symbol, [])
            }
            tradesBySymbol.get(trade.symbol)!.push(trade)
          }

          // Find completed buy/sell pairs
          for (const [symbol, trades] of tradesBySymbol) {
            const buys = trades.filter(t => t.action === 'buy').sort((a, b) => 
              new Date(a.trade_timestamp).getTime() - new Date(b.trade_timestamp).getTime()
            )
            const sells = trades.filter(t => t.action === 'sell').sort((a, b) => 
              new Date(a.trade_timestamp).getTime() - new Date(b.trade_timestamp).getTime()
            )

            console.log(`Processing ${symbol}: ${buys.length} buys, ${sells.length} sells`)

            const pairsCount = Math.min(buys.length, sells.length)
            
            for (let i = 0; i < pairsCount; i++) {
              const buy = buys[i]
              const sell = sells[i]
              
              const pl = (sell.price - buy.price) * buy.qty
              const plPercent = ((sell.price - buy.price) / buy.price) * 100
              const duration = new Date(sell.trade_timestamp).getTime() - new Date(buy.trade_timestamp).getTime()
              const durationStr = `${Math.floor(duration / 3600000)}:${Math.floor((duration % 3600000) / 60000)}:${Math.floor((duration % 60000) / 1000)}`

              // Check if this pair is already in completedTrades
              const exists = completedTrades.some(ct => 
                ct.symbol === symbol && 
                Math.abs(new Date(ct.buy_timestamp).getTime() - new Date(buy.trade_timestamp).getTime()) < 1000
              )

              if (!exists) {
                completedTrades.push({
                  id: buy.id,
                  symbol,
                  qty: buy.qty,
                  buy_price: buy.price,
                  buy_timestamp: buy.trade_timestamp,
                  sell_price: sell.price,
                  sell_timestamp: sell.trade_timestamp,
                  profit_loss: pl,
                  profit_loss_percent: plPercent,
                  holding_duration: durationStr,
                  buy_decision_metrics: {
                    confidence: buy.confidence || 0,
                    reasoning: buy.reasoning || 'Legacy trade from trades table'
                  },
                  sell_decision_metrics: {
                    confidence: sell.confidence || 0,
                    reasoning: sell.reasoning || 'Legacy trade from trades table'
                  },
                  strategy: buy.strategy,
                  account_type: buy.account_type,
                  trade_pair_id: crypto.randomUUID()
                })
              }
            }
          }
          
          console.log(`Processed legacy trades: ${completedTrades.length} completed trades found`)
          
          // If no completed pairs found, show individual trades as "completed" for display purposes
          if (completedTrades.length === 0 && legacyTrades.length > 0) {
            console.log('No completed pairs found, showing individual trades')
            
            // If there are no SELL trades at all, treat all BUY trades as "completed" (sold at current price)
            if (!sellTrades || sellTrades.length === 0) {
              console.log('No SELL trades found - treating all BUY trades as completed')
              for (const trade of legacyTrades.filter(t => t.action === 'buy').slice(0, 20)) {
                completedTrades.push({
                  id: trade.id,
                  symbol: trade.symbol,
                  qty: trade.qty,
                  buy_price: trade.price,
                  buy_timestamp: trade.trade_timestamp,
                  sell_price: trade.price, // Assume sold at same price for now
                  sell_timestamp: trade.trade_timestamp,
                  profit_loss: 0, // No profit/loss since we don't have actual sell price
                  profit_loss_percent: 0,
                  holding_duration: '0:0:0',
                  buy_decision_metrics: {
                    confidence: trade.confidence || 0,
                    reasoning: trade.reasoning || 'Legacy buy trade (no sell recorded)'
                  },
                  sell_decision_metrics: {
                    confidence: trade.confidence || 0,
                    reasoning: 'No sell trade recorded in database'
                  },
                  strategy: trade.strategy,
                  account_type: trade.account_type,
                  trade_pair_id: crypto.randomUUID()
                })
              }
            } else {
              // Show individual trades as completed
              for (const trade of legacyTrades.slice(0, 20)) {
                completedTrades.push({
                  id: trade.id,
                  symbol: trade.symbol,
                  qty: trade.qty,
                  buy_price: trade.action === 'buy' ? trade.price : 0,
                  buy_timestamp: trade.action === 'buy' ? trade.trade_timestamp : trade.created_at,
                  sell_price: trade.action === 'sell' ? trade.price : 0,
                  sell_timestamp: trade.action === 'sell' ? trade.trade_timestamp : trade.created_at,
                  profit_loss: 0, // Can't calculate without pair
                  profit_loss_percent: 0,
                  holding_duration: '0:0:0',
                  buy_decision_metrics: {
                    confidence: trade.confidence || 0,
                    reasoning: trade.reasoning || `Legacy ${trade.action} trade`
                  },
                  sell_decision_metrics: {
                    confidence: trade.confidence || 0,
                    reasoning: trade.reasoning || `Legacy ${trade.action} trade`
                  },
                  strategy: trade.strategy,
                  account_type: trade.account_type,
                  trade_pair_id: crypto.randomUUID()
                })
              }
            }
          }
        } else {
          console.log('No legacy trades found or error:', legacyError)
        }
      } catch (error) {
        console.error('Error fetching legacy trades:', error)
        // Continue with trade_logs data only
      }

      // Sort completed trades by sell timestamp (most recent first)
      completedTrades.sort((a, b) => 
        new Date(b.sell_timestamp).getTime() - new Date(a.sell_timestamp).getTime()
      )
    }

    return NextResponse.json({
      success: true,
      data: {
        currentTrades,
        completedTrades,
        statistics
      }
    })

  } catch (error) {
    console.error('Error in GET /api/trade-logs:', error)
    return NextResponse.json({ 
      success: false, 
      error: 'Internal server error' 
    }, { status: 500 })
  }
}

// POST - Create or update trade log
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createServerClient(req, {})
    
    // In demo mode, always use demo user ID
    let userId: string
    if (isDemoMode()) {
      userId = getDemoUserIdServer()
    } else {
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
      }
      userId = user.id
    }

    const body = await req.json()
    const { action, symbol, qty, price, decision_metrics, strategy, account_type, alpaca_order_id, order_status, trade_pair_id } = body

    if (!action || !symbol || !qty || !price || !strategy || !account_type) {
      return NextResponse.json({ 
        success: false, 
        error: 'Missing required fields' 
      }, { status: 400 })
    }

    if (action === 'buy') {
      // Create new trade log for buy
      const { data: tradeLog, error: insertError } = await supabase
        .from('trade_logs')
        .insert({
          user_id: userId,
          symbol,
          trade_pair_id: trade_pair_id || undefined, // Let DB generate if not provided
          action: 'buy',
          qty: parseFloat(qty),
          price: parseFloat(price),
          total_value: parseFloat(qty) * parseFloat(price),
          timestamp: new Date().toISOString(),
          status: 'open',
          buy_timestamp: new Date().toISOString(),
          buy_price: parseFloat(price),
          buy_decision_metrics: decision_metrics,
          strategy,
          account_type,
          alpaca_order_id,
          order_status
        })
        .select()
        .single()

      if (insertError) {
        console.error('Error creating trade log:', insertError)
        return NextResponse.json({ 
          success: false, 
          error: 'Failed to create trade log' 
        }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        data: tradeLog
      })

    } else if (action === 'sell') {
      // Update existing trade log for sell
      const { error: closeError } = await supabase.rpc('close_trade_position', {
        user_uuid: userId,
        symbol_param: symbol,
        sell_qty: parseFloat(qty),
        sell_price_param: parseFloat(price),
        sell_metrics: decision_metrics
      })

      if (closeError) {
        console.error('Error closing trade position:', closeError)
        return NextResponse.json({ 
          success: false, 
          error: 'Failed to close trade position' 
        }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        message: 'Trade position closed successfully'
      })

    } else {
      return NextResponse.json({ 
        success: false, 
        error: 'Invalid action. Must be "buy" or "sell"' 
      }, { status: 400 })
    }

  } catch (error) {
    console.error('Error in POST /api/trade-logs:', error)
    return NextResponse.json({ 
      success: false, 
      error: 'Internal server error' 
    }, { status: 500 })
  }
}

