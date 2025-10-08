'use client'

import * as Tabs from '@radix-ui/react-tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function DashboardPage() {
  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Trading Dashboard</h1>
      
      <Tabs.Root defaultValue="paper" className="w-full">
        <Tabs.List className="grid w-full grid-cols-2 mb-6">
          <Tabs.Trigger value="paper" className="p-4 text-lg">
            Paper Trading
          </Tabs.Trigger>
          <Tabs.Trigger value="live" className="p-4 text-lg">
            Live Trading
          </Tabs.Trigger>
        </Tabs.List>
        
        <Tabs.Content value="paper" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Paper Trading</CardTitle>
              <CardDescription>
                Practice trading with virtual money
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-gray-500">
                Paper trading content will be implemented here...
              </p>
            </CardContent>
          </Card>
        </Tabs.Content>
        
        <Tabs.Content value="live" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Live Trading</CardTitle>
              <CardDescription>
                Trade with real money (coming soon)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-gray-500">
                Live trading content will be implemented here...
              </p>
            </CardContent>
          </Card>
        </Tabs.Content>
      </Tabs.Root>
    </div>
  )
}
