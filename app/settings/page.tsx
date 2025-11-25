'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import ApiKeysForm from '@/components/ApiKeysForm'
import StrategySettings from '@/components/StrategySettings'
import TrainModelButton from '@/components/TrainModelButton'
import ModelStatus from '@/components/ModelStatus'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Settings, Key, TrendingUp, Brain } from 'lucide-react'

// Ensure this page is rendered dynamically, not statically
export const dynamic = 'force-dynamic'

export default function SettingsPage() {
  return (
    <div className="min-h-screen text-white pl-20">
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
          <TabsList className="glass-card">
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
            <Card className="glass-card">
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
                <div className="bg-yellow-50 dark:bg-yellow-950 border-2 border-yellow-400 dark:border-yellow-600 rounded-lg p-4">
                  <p className="text-sm text-yellow-900 dark:text-yellow-100 font-semibold mb-2">
                    ⚠️ Important: This button does NOT train a real ML model
                  </p>
                  <p className="text-sm text-yellow-800 dark:text-yellow-200">
                    The "Re-Train Model" button below only updates metadata. It does <strong>not</strong> train a real machine learning model. 
                    The app currently uses <strong>rule-based predictions</strong> (simple if/else logic), not ML predictions.
                  </p>
                </div>

                <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-4">
                  <p className="text-sm text-green-900 dark:text-green-100 font-semibold mb-2">
                    ✅ For Real ML Training (Required):
                  </p>
                  <ol className="text-sm text-green-800 dark:text-green-200 list-decimal list-inside space-y-2">
                    <li>Install Python dependencies: <code className="bg-gray-800 px-1 rounded">pip install -r python-functions/requirements.txt</code></li>
                    <li>Set environment variables: <code className="bg-gray-800 px-1 rounded">SUPABASE_URL</code> and <code className="bg-gray-800 px-1 rounded">SUPABASE_SERVICE_ROLE_KEY</code></li>
                    <li>Run the training script: <code className="bg-gray-800 px-1 rounded">python python-functions/model/train_with_real_data.py</code></li>
                    <li>This will fetch 5 years of real historical data from Alpaca, train a Random Forest model, and upload the <code className="bg-gray-800 px-1 rounded">.pkl</code> file to Supabase Storage</li>
                    <li>Once uploaded, the app will automatically use the trained model for predictions</li>
                  </ol>
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

                <div className="pt-4 border-t border-gray-700">
                  <ModelStatus />
                </div>

                <div className="pt-4 border-t border-gray-700">
                  <p className="text-xs text-gray-500 mb-2">Metadata Update Only (Not Real Training):</p>
                  <TrainModelButton />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

