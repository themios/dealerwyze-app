'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import {
  Home, Users, Car, BookUser,
  CreditCard, BarChart2, HeadphonesIcon,
  ShieldCheck, Settings, Printer,
} from 'lucide-react'

interface MeResponse {
  is_platform_admin?: boolean
  role?: string
}

const BASE_NAV = [
  { href: '/today',     label: 'Today',     icon: Home },
  { href: '/customers', label: 'Leads',     icon: Users },
  { href: '/vehicles',  label: 'Inventory', icon: Car },
  { href: '/contacts',  label: 'Contacts',  icon: BookUser },
]

const ROLE_NAV = [
  { href: '/bhph',      label: 'BHPH',      icon: CreditCard,     requiresRole: (r: string) => r !== 'dealer_rep' },
  { href: '/analytics', label: 'Analytics', icon: BarChart2,      requiresRole: (r: string) => ['dealer_admin', 'dealer_manager', 'admin'].includes(r) },
  { href: '/fax',       label: 'Fax',       icon: Printer,        requiresRole: () => true },
  { href: '/support',   label: 'Support',   icon: HeadphonesIcon, requiresRole: () => true },
  { href: '/settings',  label: 'Settings',  icon: Settings,       requiresRole: () => true },
]

const ADMIN_NAV = { href: '/admin', label: 'Admin Panel', icon: ShieldCheck }

export default function DesktopSidebar({ orgName }: { orgName?: string | null }) {
  const pathname = usePathname()
  const [me, setMe] = useState<MeResponse>({})

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then((d: MeResponse) => setMe(d))
      .catch(() => {})
  }, [])

  const role = me.role ?? ''

  const visibleRoleNav = ROLE_NAV.filter(item => item.requiresRole(role))
  const allNav = [
    ...BASE_NAV,
    ...visibleRoleNav,
    ...(me.is_platform_admin ? [ADMIN_NAV] : []),
  ]

  function isActive(href: string) {
    if (href === '/today') return pathname === '/today' || pathname === '/'
    return pathname.startsWith(href)
  }

  return (
    <aside className="hidden lg:flex flex-col w-60 shrink-0 h-dvh bg-[#0D2B55] border-r border-[#1B4A8A] overflow-y-auto">
      {/* Logo / org name */}
      <div className="px-5 py-5 border-b border-[#1B4A8A]">
        <p className="text-[#F07018] font-bold text-lg tracking-tight leading-none">DealerWyze</p>
        {orgName && (
          <p className="text-white/50 text-xs mt-1 truncate">{orgName}</p>
        )}
      </div>

      {/* Nav links */}
      <nav className="flex-1 py-3 px-2 space-y-0.5">
        {allNav.map(({ href, label, icon: Icon }) => {
          const active = isActive(href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                active
                  ? 'bg-white/10 text-[#F07018]'
                  : 'text-white/70 hover:text-white hover:bg-white/5'
              )}
            >
              {active && (
                <span className="absolute left-0 w-1 h-6 bg-[#F07018] rounded-r-full" />
              )}
              <Icon className="h-4.5 w-4.5 shrink-0" />
              {label}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
