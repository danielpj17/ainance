import { NextRequest, NextResponse } from 'next/server';
import { tradingModel } from '@/lib/trading-model';
import AlpacaWrapper, { getAlpacaKeys } from '@/lib/alpaca-client';
import { createClient } from '@/utils/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { startDate, endDate, strategy, account_type, symbols } = body;
    if (!startDate || !endDate || !strategy || !account_type || !symbols) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Get user/session (mocked for now)
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
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
    const alpacaKeys = getAlpacaKeys(settings, account_type, strategy);
    const alpaca = new AlpacaWrapper({ ...alpacaKeys, baseUrl: 'https://paper-api.alpaca.markets' });

    // Fetch 1-min and 5-min bars for all symbols
    const bars1m = await alpaca.getMarketData(symbols, '1Min');
    const bars5m = await alpaca.getMarketData(symbols, '5Min');
    // TODO: Filter bars by date range and format as needed

    // Prepare historicalData for tradingModel.backtest
    const historicalData = {};
    for (const symbol of symbols) {
      historicalData[symbol] = bars1m.filter(bar => bar.symbol === symbol);
    }
    // For multi-timeframe, pass both 1m and 5m bars to the model

    // News sentiment mock (empty)
    const newsSentimentData = {};
    for (const symbol of symbols) {
      newsSentimentData[symbol] = [];
    }

    // Run backtest
    const result = await tradingModel.backtest(
      startDate,
      endDate,
      { strategy, account_type, cash_balance: 100000, max_trade_size: 5000, daily_loss_limit: -2000, take_profit: 0.5, stop_loss: 0.3 },
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
