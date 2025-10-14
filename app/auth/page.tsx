'use client'

export const dynamic = 'force-dynamic'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, Sparkles } from 'lucide-react'

export default function AuthPage() {
  const router = useRouter()

  useEffect(() => {
    // Automatically redirect to dashboard in demo mode
    router.push('/dashboard')
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0f1117] via-purple-900/20 to-[#0f1117] py-12 px-4 sm:px-6 lg:px-8">
      <Card className="w-full max-w-md bg-[#1a1d2e] border-purple-600/30">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center mb-4">
            <Sparkles className="h-8 w-8 text-white" />
          </div>
          <CardTitle className="text-white text-2xl">Welcome to Ainance</CardTitle>
          <CardDescription className="text-gray-400">
            Demo Mode - Auto-loading...
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
            <div className="space-y-2">
              <p className="text-white/90 font-medium">🎮 Running in Demo Mode</p>
              <p className="text-gray-400 text-sm">All trades tracked in Supabase</p>
              <p className="text-gray-500 text-xs">Single user across all devices</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
