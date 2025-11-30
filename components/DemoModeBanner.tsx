'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Info } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'

export default function DemoModeBanner() {
  const [isDemo, setIsDemo] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    const checkAuth = async () => {
      // Check for real session first (not just getUser which might return demo user)
      const { data: { session } } = await supabase.auth.getSession()
      
      if (session && session.user && session.user.id !== '00000000-0000-0000-0000-000000000000') {
        // Real authenticated user - don't show demo banner
        setIsDemo(false)
      } else {
        // No real session - check getUser as fallback
        const { data: { user } } = await supabase.auth.getUser()
        if (user && user.id !== '00000000-0000-0000-0000-000000000000') {
          setIsDemo(false)
        } else {
          setIsDemo(true)
        }
      }
    }

    checkAuth()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && session.user && session.user.id !== '00000000-0000-0000-0000-000000000000') {
        setIsDemo(false)
      } else {
        setIsDemo(true)
      }
    })

    return () => subscription.unsubscribe()
  }, [supabase])

  // Only show banner in demo mode
  if (!isDemo) {
    return null
  }

  return (
    <Alert className="rounded-none border-x-0 border-t-0 bg-gradient-to-r from-blue-600/30 to-cyan-500/30 backdrop-blur-md border-b-blue-400/50 pl-24">
      <Info className="h-4 w-4 text-cyan-400" />
      <AlertDescription className="text-white/90 font-medium">
        🎮 <strong>Demo Mode</strong> - Single user across all devices. All trades and data saved to Supabase.
      </AlertDescription>
    </Alert>
  )
}

