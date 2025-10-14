'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { Home, BarChart3, Activity, TrendingUp, Settings, Clock, Package } from 'lucide-react'

const navItems = [
  { icon: Home, href: '/dashboard', label: 'Dashboard' },
  { icon: BarChart3, href: '/dashboard/trade', label: 'Trade Terminal' },
  { icon: Activity, href: '/dashboard/paper', label: 'Paper Trading' },
  { icon: TrendingUp, href: '/dashboard/live', label: 'Live Trading' },
  { icon: Package, href: '/dashboard/backtest', label: 'Backtest' },
  { icon: Clock, href: '/dashboard/history', label: 'History' },
  { icon: Settings, href: '/settings', label: 'Settings' },
]

export default function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="fixed left-0 top-0 h-full w-20 bg-[#0f1117]/70 backdrop-blur-xl border-r border-blue-400/20 flex flex-col items-center py-6 z-50">
      {/* Logo */}
      <Link href="/dashboard" className="mb-8">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
          <span className="text-white font-bold text-xl">A</span>
        </div>
      </Link>

      {/* Navigation */}
      <nav className="flex-1 flex flex-col gap-2 w-full px-3">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
          
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`
                relative group flex items-center justify-center w-14 h-14 rounded-xl transition-all
                ${isActive 
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/50' 
                  : 'text-gray-400 hover:text-white hover:bg-blue-500/20'
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

      {/* Settings at bottom */}
      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-600 to-gray-800 flex items-center justify-center cursor-pointer hover:scale-110 transition-transform">
        <Settings className="w-5 h-5 text-white" />
      </div>
    </aside>
  )
}


