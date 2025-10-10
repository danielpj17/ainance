'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import ApiKeysForm from '@/components/ApiKeysForm'
import StrategySettings from '@/components/StrategySettings'
import TrainModelButton from '@/components/TrainModelButton'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Settings, Key, TrendingUp, Brain } from 'lucide-react'

export default function SettingsPage() {
  return (
    <div className="min-h-screen bg-[#0f1117] text-white pl-20">
      <div className="container mx-auto px-6 py-8 max-w-6xl">
        <div className="mb-8">
          <h1 className="text-4xl font-bold flex items-center gap-3 mb-2">
            <Settings className="h-8 w-8 text-purple-500" />
            Settings
          </h1>
          <p className="text-gray-400">
            Configure your API keys and trading strategy parameters
          </p>
        </div>

        <Tabs defaultValue="api-keys" className="space-y-6">
          <TabsList className="bg-[#1a1d2e] border border-gray-800">
            <TabsTrigger value="api-keys" className="flex items-center gap-2">
              <Key className="h-4 w-4" />
              API Keys
            </TabsTrigger>
            <TabsTrigger value="strategy" className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Strategy Settings
            </TabsTrigger>
            <TabsTrigger value="model" className="flex items-center gap-2">
              <Brain className="h-4 w-4" />
              AI Model
            </TabsTrigger>
          </TabsList>

          <TabsContent value="api-keys" className="space-y-6">
            <ApiKeysForm />
          </TabsContent>

          <TabsContent value="strategy" className="space-y-6">
            <StrategySettings mode="paper" />
          </TabsContent>

          <TabsContent value="model" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Brain className="h-5 w-5 text-purple-500" />
                  Random Forest Trading Model
                </CardTitle>
                <CardDescription>
                  Train the AI model that generates trading signals
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                  <p className="text-sm text-blue-900 dark:text-blue-100">
                    <strong>Note:</strong> Make sure you've created a 'models' bucket in your Supabase Storage before training.
                  </p>
                </div>
                
                <div className="space-y-2">
                  <h4 className="font-medium">Model Features:</h4>
                  <ul className="text-sm text-gray-600 dark:text-gray-400 list-disc list-inside space-y-1">
                    <li>RSI (Relative Strength Index)</li>
                    <li>MACD (Moving Average Convergence Divergence)</li>
                    <li>Bollinger Band Width</li>
                    <li>Volume Ratio</li>
                    <li>News Sentiment Score</li>
                    <li>EMA Trend</li>
                  </ul>
                </div>

                <div className="pt-4">
                  <TrainModelButton />
                </div>

                <div className="text-xs text-gray-500 pt-2">
                  The model will be trained on synthetic data and uploaded to Supabase Storage. 
                  Once trained, the trading bot will automatically use it to generate signals.
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

