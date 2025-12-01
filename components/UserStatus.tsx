'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Badge } from '@/components/ui/badge'
import { Sparkles, User } from 'lucide-react'

// Helper function to get user initials from name or email
function getInitials(name: string | null, email: string | null): string {
  // Try to use the full name first (first letter of first name + first letter of last name)
  if (name) {
    const nameParts = name.trim().split(/\s+/)
    if (nameParts.length >= 2) {
      return (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase()
    }
    if (nameParts.length === 1 && nameParts[0].length >= 1) {
      return nameParts[0][0].toUpperCase()
    }
  }
  // Fallback to email
  if (email) {
    const parts = email.split('@')[0].split(/[._-]/)
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase()
    }
    return email.substring(0, 2).toUpperCase()
  }
  return 'U'
}

export default function UserStatus() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [userName, setUserName] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    const checkAuth = async () => {
      // Check for real session first (not just getUser which might return demo user)
      const { data: { session } } = await supabase.auth.getSession()
      
      if (session && session.user && session.user.id !== '00000000-0000-0000-0000-000000000000') {
        // Real authenticated user with valid session
        setIsAuthenticated(true)
        setUserEmail(session.user.email || null)
        setUserName(session.user.user_metadata?.full_name || session.user.user_metadata?.name || null)
      } else {
        // No real session - check getUser as fallback
        const { data: { user } } = await supabase.auth.getUser()
        if (user && user.id !== '00000000-0000-0000-0000-000000000000') {
          setIsAuthenticated(true)
          setUserEmail(user.email || null)
          setUserName(user.user_metadata?.full_name || user.user_metadata?.name || null)
        } else {
          setIsAuthenticated(false)
          setUserEmail(null)
          setUserName(null)
        }
      }
    }

    checkAuth()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event: any, session: any) => {
      // Check session directly from the callback
      if (session && session.user && session.user.id !== '00000000-0000-0000-0000-000000000000') {
        setIsAuthenticated(true)
        setUserEmail(session.user.email || null)
        setUserName(session.user.user_metadata?.full_name || session.user.user_metadata?.name || null)
      } else {
        setIsAuthenticated(false)
        setUserEmail(null)
        setUserName(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [supabase])

  if (isAuthenticated) {
    return (
      <Badge variant="outline" className="bg-green-500/20 text-green-400 border-green-500/50">
        <User className="mr-1 h-3 w-3" />
        {getInitials(userName, userEmail)}
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

