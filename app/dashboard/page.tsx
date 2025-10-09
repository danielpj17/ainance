'use client'

import * as Tabs from '@radix-ui/react-tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import StrategySettings from '@/components/StrategySettings'
import TradingBot from '@/components/TradingBot'
import ApiKeysForm from '@/components/ApiKeysForm'
import TrainModelButton from '@/components/TrainModelButton'


export default function DashboardPage() {
  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Trading Dashboard</h1>
      
      <Tabs.Root defaultValue="paper" className="w-full">
        <Tabs.List className="grid w-full grid-cols-4 mb-6">
          <Tabs.Trigger value="paper" className="p-4 text-lg">
            Paper Trading
          </Tabs.Trigger>
          <Tabs.Trigger value="live" className="p-4 text-lg">
            Live Trading
          </Tabs.Trigger>
          <Tabs.Trigger value="backtest" className="p-4 text-lg">
            Backtest
          </Tabs.Trigger>
          <Tabs.Trigger value="settings" className="p-4 text-lg">
            Settings
          </Tabs.Trigger>
        </Tabs.List>
        
        <Tabs.Content value="paper" className="mt-6 space-y-6">
          <StrategySettings mode="paper" />
          <TradingBot mode="paper" />
          
          <Card>
            <CardHeader>
              <CardTitle>Paper Trading Dashboard</CardTitle>
              <CardDescription>
                Practice trading with virtual money
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-gray-500">
                Access the full paper trading dashboard with live data, trade execution, and portfolio tracking.
              </p>
              <Button asChild>
                <a href="/dashboard/paper">Go to Paper Trading Dashboard</a>
              </Button>
            </CardContent>
          </Card>
        </Tabs.Content>
        
        <Tabs.Content value="live" className="mt-6 space-y-6">
          <StrategySettings mode="live" />
          <TradingBot mode="live" />
          
          <Card>
            <CardHeader>
              <CardTitle>Live Trading Dashboard</CardTitle>
              <CardDescription>
                Trade with real money - proceed with caution
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-gray-500">
                Access the live trading dashboard with real money trading capabilities.
                <strong className="text-red-600"> Risk warning: Real money trading involves significant risk.</strong>
              </p>
              <Button asChild variant="destructive">
                <a href="/dashboard/live">Go to Live Trading Dashboard</a>
              </Button>
            </CardContent>
          </Card>
        </Tabs.Content>
        
        <Tabs.Content value="backtest" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Backtest Dashboard</CardTitle>
              <CardDescription>
                Test your strategies with historical data
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-gray-500">
                Run comprehensive backtests on historical data to validate your trading strategies before risking real money.
              </p>
              <Button asChild>
                <a href="/dashboard/backtest">Go to Backtest Dashboard</a>
              </Button>
            </CardContent>
          </Card>
        </Tabs.Content>

        <Tabs.Content value="settings" className="mt-6 space-y-6">
          <div className="flex justify-end"><TrainModelButton /></div>
          <ApiKeysForm />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  )
}
