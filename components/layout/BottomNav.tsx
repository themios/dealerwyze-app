'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import { Home, Users, Car, CreditCard, ShieldCheck, GitBranch } from 'lucide-react'
import { cn } from '@/lib/utils'

function TodayBadge() {
  const [count, setCount] = useState(0)
  useEffect(() => {
    fetch('/api/tasks/count')
      .then(r => r.json())
      .then((d: { count?: number }) => setCount(d.count ?? 0))
      .catch(() => {})
  }, [])
  if (!count) return null
  return (
    <span className="absolute -top-0.5 right-0 min-w-[16px] h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
      {count > 9 ? '9+' : count}
    </span>
  )
}

const baseItems = [
  { href: '/today',     label: 'Today',     icon: Home },
  { href: '/customers', label: 'Leads',     icon: Users },
  { href: '/pipeline',  label: 'Pipeline',  icon: GitBranch },
  { href: '/bhph',      label: 'BHPH',      icon: CreditCard },
  { href: '/vehicles',  label: 'Inventory', icon: Car },
]

const adminItem = { href: '/admin', label: 'Admin', icon: ShieldCheck }

export default function BottomNav() {
  const pathname = usePathname()
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then((d: { role?: string }) => setIsAdmin(d.role === 'admin'))
      .catch(() => {})
  }, [])

  const navItems = isAdmin ? [...baseItems, adminItem] : baseItems

  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md border-t border-[#1B4A8A] bg-[#0D2B55]">
      <div className="flex items-center justify-around h-16">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'relative flex flex-col items-center gap-0.5 px-1 py-2 text-[10px] font-medium transition-colors',
                active ? 'text-[#F07018]' : 'text-white/60 hover:text-white/90'
              )}
            >
              {active && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-[#F07018] rounded-full" />
              )}
              {href === '/today' && <TodayBadge />}
              <Icon className="h-5 w-5" />
              {label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
