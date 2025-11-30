'use client'

import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Home, Activity, TrendingUp, Settings, Brain, ListTree, LogOut, FileText } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import UserStatus from '@/components/UserStatus'

const navItems = [
  { icon: Home, href: '/dashboard', label: 'Dashboard' },
  { icon: Activity, href: '/dashboard/paper', label: 'Paper Trading' },
  { icon: TrendingUp, href: '/dashboard/live', label: 'Live Trading' },
  { icon: FileText, href: '/dashboard/trade-logs', label: 'Trade Logs' },
  { icon: ListTree, href: '/dashboard/watchlist', label: 'Watchlist' },
  { icon: Brain, href: '/test-ml', label: 'ML Testing' },
  { icon: Settings, href: '/settings', label: 'Settings' },
]

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()

  const handleLogout = async () => {
    const supabase = createClient()
    // Sign out real session if exists
    await supabase.auth.signOut()
    // Redirect to auth page
    router.push('/auth')
  }

  return (
    <aside className="fixed left-0 top-0 h-full w-20 bg-[#0f1117]/70 backdrop-blur-xl border-r border-blue-300/30 flex flex-col items-center py-6 z-50">
      {/* Logo */}
      <Link href="/dashboard" className="mb-4">
        <div className="w-12 h-12 rounded-xl border-2 border-blue-400 flex items-center justify-center shadow-lg shadow-blue-400/40 bg-transparent">
          <span className="text-blue-400 font-bold text-xl">A</span>
        </div>
      </Link>

      {/* User Status */}
      <div className="mb-6 px-2">
        <UserStatus />
      </div>

      {/* Navigation */}
      <nav className="flex-1 flex flex-col gap-2 w-full px-3">
        {navItems.map((item) => {
          const Icon = item.icon
          // For /dashboard, only match exactly or /dashboard/ (but not /dashboard/paper)
          // For other routes, use the normal startsWith logic
          const isActive = item.href === '/dashboard' 
            ? (pathname === '/dashboard' || pathname === '/dashboard/')
            : (pathname === item.href || pathname.startsWith(item.href + '/'))
          
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`
                relative group flex items-center justify-center w-14 h-14 rounded-xl transition-all
                ${isActive 
                  ? 'bg-blue-400 text-white shadow-lg shadow-blue-400/50' 
                  : 'text-gray-300 hover:text-white hover:bg-blue-400/30'
                }
              `}
              title={item.label}
            >
              <Icon className="w-6 h-6" />
              
              {/* Tooltip */}
              <div className="absolute left-full ml-4 px-3 py-2 bg-gray-900 text-white text-sm rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-xl">
                {item.label}
                <div className="absolute right-full top-1/2 -translate-y-1/2 border-8 border-transparent border-r-gray-900"></div>
              </div>
            </Link>
          )
        })}
      </nav>

      {/* Logout at bottom */}
      <button
        onClick={handleLogout}
        className="w-14 h-14 rounded-xl bg-gradient-to-br from-red-600 to-red-800 flex items-center justify-center cursor-pointer hover:scale-110 transition-transform group"
        title="Logout"
      >
        <LogOut className="w-5 h-5 text-white" />
        
        {/* Tooltip */}
        <div className="absolute left-full ml-4 px-3 py-2 bg-gray-900 text-white text-sm rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-xl">
          Logout
          <div className="absolute right-full top-1/2 -translate-y-1/2 border-8 border-transparent border-r-gray-900"></div>
        </div>
      </button>
    </aside>
  )
}


