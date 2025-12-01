import { NextRequest, NextResponse } from 'next/server';
import { tradingModel, type MarketData as TMMarketData, type NewsSentiment as TMNewsSentiment } from '@/lib/trading-model';
import AlpacaWrapper, { getAlpacaKeys } from '@/lib/alpaca-client';
import { createServerClient } from '@/utils/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { startDate, endDate, strategy, account_type, symbols } = body as {
      startDate: string;
      endDate: string;
      strategy: string;
      account_type: string;
      symbols: string[];
    };
    if (!startDate || !endDate || !strategy || !account_type || !symbols) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Get user/session via server client (forwards Authorization)
    const supabase = await createServerClient(req, {});
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Validate and narrow strategy/account_type to expected unions
    const narrowedStrategy = strategy === 'cash' || strategy === '25k_plus' ? strategy : null;
    const narrowedAccountType = account_type === 'cash' || account_type === 'margin' ? account_type : null;

    if (!narrowedStrategy || !narrowedAccountType) {
      return NextResponse.json({ error: 'Invalid strategy or account_type' }, { status: 400 });
    }

    // Get API keys from user settings
    const { data: settings } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', user.id)
      .single();
    if (!settings) {
      return NextResponse.json({ error: 'No API keys found' }, { status: 403 });
    }
    const alpacaKeys = getAlpacaKeys(settings, narrowedAccountType, narrowedStrategy);
    const alpaca = new AlpacaWrapper({ ...alpacaKeys, baseUrl: 'https://paper-api.alpaca.markets' });

    // Fetch 1-min and 5-min bars for all symbols
    const bars1m = await alpaca.getMarketData(symbols, '1Min');
    const bars5m = await alpaca.getMarketData(symbols, '5Min');
    // TODO: Filter bars by date range and format as needed

    // Prepare historicalData for tradingModel.backtest
    const historicalData: Record<string, TMMarketData[]> = {};
    for (const symbol of symbols) {
      historicalData[symbol] = bars1m.filter(bar => bar.symbol === symbol) as unknown as TMMarketData[];
    }
    // For multi-timeframe, pass both 1m and 5m bars to the model

    // News sentiment mock (empty)
    const newsSentimentData: Record<string, TMNewsSentiment[]> = {};
    for (const symbol of symbols) {
      newsSentimentData[symbol] = [];
    }

    // Run backtest
    const result = await tradingModel.backtest(
      startDate,
      endDate,
      { strategy: narrowedStrategy, account_type: narrowedAccountType, cash_balance: 100000 },
      historicalData,
      newsSentimentData
    );

    // Save backtest result to Supabase
    await supabase.from('backtests').insert({
      user_id: user.id,
      strategy,
      date_range: { start: startDate, end: endDate },
      metrics: result,
    });

    return NextResponse.json({ success: true, result });
  } catch (error) {
    console.error('Backtest API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
