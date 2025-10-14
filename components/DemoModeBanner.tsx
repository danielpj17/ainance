'use client'

import { Info } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'

export default function DemoModeBanner() {
  return (
    <Alert className="rounded-none border-x-0 border-t-0 bg-gradient-to-r from-purple-600/20 to-blue-600/20 border-b-purple-600/50">
      <Info className="h-4 w-4 text-purple-400" />
      <AlertDescription className="text-white/90 font-medium">
        🎮 <strong>Demo Mode</strong> - Single user across all devices. All trades and data saved to Supabase.
      </AlertDescription>
    </Alert>
  )
}

