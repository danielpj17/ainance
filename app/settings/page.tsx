'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import ApiKeysForm from '@/components/ApiKeysForm'
import StrategySettings from '@/components/StrategySettings'
import { Settings, Key, TrendingUp } from 'lucide-react'

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
          </TabsList>

          <TabsContent value="api-keys" className="space-y-6">
            <ApiKeysForm />
          </TabsContent>

          <TabsContent value="strategy" className="space-y-6">
            <StrategySettings mode="paper" />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

