'use client'

import { Suspense, useEffect, useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import { createClient } from "@/utils/supabase/client"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"

function DarkModeToggle() {
  const [dark, setDark] = useState(false)
  useEffect(() => {
    if (dark) {
      document.documentElement.classList.add("dark")
    } else {
      document.documentElement.classList.remove("dark")
    }
  }, [dark])
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs">🌞</span>
      <Switch checked={dark} onCheckedChange={setDark} />
      <span className="text-xs">🌙</span>
    </div>
  )
}

function LogoutButton() {
  const router = useRouter()
  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/auth")
  }
  return (
    <Button variant="outline" className="text-white border-white hover:bg-white hover:text-gray-800" onClick={handleLogout}>
      Logout
    </Button>
  )
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  useEffect(() => {
    const checkAuth = async () => {
      if (pathname === "/auth") return
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace("/auth")
      }
    }
    checkAuth()
  }, [router, pathname])
  return <>{children}</>
}

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <nav className="flex flex-col sm:flex-row justify-between items-center p-4 bg-gray-800 text-white gap-2">
        <div className="text-xl font-bold">Ainance</div>
        <div className="flex items-center gap-4">
          <DarkModeToggle />
          <LogoutButton />
        </div>
      </nav>
      <main>
        <Suspense fallback={<div className="p-8 text-center">Loading...</div>}>
          {children}
        </Suspense>
      </main>
    </AuthGuard>
  )
}
