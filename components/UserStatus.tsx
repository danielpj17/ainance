'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Badge } from '@/components/ui/badge'
import { Sparkles, User } from 'lucide-react'

export default function UserStatus() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user && user.id !== '00000000-0000-0000-0000-000000000000') {
        setIsAuthenticated(true)
        setUserEmail(user.email || null)
      } else {
        setIsAuthenticated(false)
        setUserEmail(null)
      }
    }

    checkAuth()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      checkAuth()
    })

    return () => subscription.unsubscribe()
  }, [supabase])

  if (isAuthenticated) {
    return (
      <Badge variant="outline" className="bg-green-500/20 text-green-400 border-green-500/50">
        <User className="mr-1 h-3 w-3" />
        {userEmail || 'Signed In'}
      </Badge>
    )
  }

  return (
    <Badge variant="outline" className="bg-blue-500/20 text-blue-400 border-blue-500/50">
      <Sparkles className="mr-1 h-3 w-3" />
      Demo Mode
    </Badge>
  )
}

