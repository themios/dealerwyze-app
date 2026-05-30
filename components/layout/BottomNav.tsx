'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import {
  LayoutDashboard, Home, Users, Car, CalendarDays,
  ShieldCheck,
  Activity, BarChart3, ArchiveRestore,
  ArrowLeft, Settings, Search,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useVertical } from '@/hooks/useVertical'

function AdminTicketsBadge() {
  const [count, setCount] = useState(0)
  useEffect(() => {
    fetch('/api/admin/tickets/count')
      .then(r => r.ok ? r.json() : null)
      .then((d: { open?: number } | null) => setCount(d?.open ?? 0))
      .catch(() => {})
  }, [])
  if (!count) return null
  return (
    <span className="absolute -top-0.5 right-0 min-w-[16px] h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
      {count > 9 ? '9+' : count}
    </span>
  )
}

function useUrgentCount(): number {
  const [count, setCount] = useState(0)
  useEffect(() => {
    fetch('/api/dashboard/stats')
      .then(r => r.ok ? r.json() : null)
      .then((d: { today?: { urgent_leads?: number; appt_requests?: number } } | null) => {
        setCount((d?.today?.urgent_leads ?? 0) + (d?.today?.appt_requests ?? 0))
      })
      .catch(() => {})
  }, [])
  return count
}

function AlertsBadgeMobile() {
  const [count, setCount] = useState(0)
  useEffect(() => {
    fetch('/api/admin/alerts?count=1')
      .then(r => r.ok ? r.json() : null)
      .then((d: { unresolved?: number } | null) => setCount(d?.unresolved ?? 0))
      .catch(() => {})
  }, [])
  if (!count) return null
  return (
    <span className="absolute -top-0.5 right-0 min-w-[16px] h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
      {count > 9 ? '9+' : count}
    </span>
  )
}

const DEALER_NAV_ITEMS = [
  { href: '/today',     label: 'Today',     icon: Home,            urgent: false, center: false },
  { href: '/customers', label: 'Leads',     icon: Users,           urgent: false, center: false },
  { href: '/dashboard', label: 'Home',      icon: LayoutDashboard, urgent: true,  center: true  },
  { href: '/vehicles',  label: 'Inventory', icon: Car,             urgent: false, center: false },
  { href: '/calendar',  label: 'Calendar',  icon: CalendarDays,    urgent: false, center: false },
]

const ADMIN_BOTTOM_NAV = [
  { href: '/admin',         label: 'Dashboard', icon: LayoutDashboard, badge: null },
  { href: '/admin/platform-health', label: 'Health',   icon: Activity,    badge: null },
  { href: '/admin/feature-adoption', label: 'Adoption', icon: BarChart3,   badge: null },
  { href: '/admin/data-recovery',   label: 'Recovery', icon: ArchiveRestore, badge: null },
  { href: '/today',         label: 'Exit',      icon: ShieldCheck,     badge: null },
]

export default function BottomNav() {
  const pathname = usePathname()
  const isSettings = pathname.startsWith('/settings')
  const isAdminArea = pathname.startsWith('/admin')
  const urgentCount = useUrgentCount()
  const { features } = useVertical()
  const dealerNavItems = DEALER_NAV_ITEMS.filter(item => {
    if (item.href === '/bhph') return features.bhph
    if (item.href === '/fax') return features.fax
    return true
  })

  if (isSettings) {
    return (
      <nav className="lg:hidden fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md border-t border-white/8 bg-[#0D1F33]">
        <div className="flex items-center h-16">
          <Link
            href="/today"
            className="flex flex-col items-center gap-0.5 flex-1 py-2 text-[10px] font-medium text-white/50 hover:text-white/80 transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
            Exit
          </Link>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('settings:open-nav'))}
            className="flex flex-col items-center gap-0.5 flex-1 py-2 text-[10px] font-medium text-[#F07018]"
          >
            <Settings className="h-5 w-5" />
            Navigate
          </button>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('settings:open-search'))}
            className="flex flex-col items-center gap-0.5 flex-1 py-2 text-[10px] font-medium text-white/50 hover:text-white/80 transition-colors"
          >
            <Search className="h-5 w-5" />
            Search
          </button>
        </div>
      </nav>
    )
  }

  if (isAdminArea) {
    return (
      <nav className="lg:hidden fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md border-t border-[#1B4A8A] bg-[#0D2B55]">
        <div className="flex items-center justify-around h-16">
          {ADMIN_BOTTOM_NAV.map(({ href, label, icon: Icon, badge }) => {
            const active = href === '/admin'
              ? pathname === '/admin'
              : href !== '/today' && pathname.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                aria-label={label}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex flex-col items-center gap-0.5 px-1 py-2 text-[10px] font-medium transition-colors',
                  active ? 'text-[#F07018]' : 'text-white/60 hover:text-white/90'
                )}
              >
                {active && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-1 bg-[#F07018] rounded-full" />
                )}
                {badge === 'alerts'  && <AlertsBadgeMobile />}
                {badge === 'tickets' && <AdminTicketsBadge />}
                <Icon className="h-5 w-5" />
                {label}
              </Link>
            )
          })}
        </div>
      </nav>
    )
  }

  return (
    <nav className="lg:hidden fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md border-t border-[#1B4A8A] bg-[#0D2B55] overflow-visible"
      style={{
        paddingBottom: 'max(0, env(safe-area-inset-bottom))',
      }}>
      <div className="flex items-center justify-around h-16 relative">
        {dealerNavItems.map(({ href, label, icon: Icon, urgent, center }) => {
          const active = href === '/dashboard'
            ? pathname === '/dashboard' || pathname === '/'
            : href === '/today'
              ? pathname === '/today'
              : pathname.startsWith(href)
          if (center) {
            return (
              <Link
                key={href}
                href={href}
                aria-label={label}
                aria-current={active ? 'page' : undefined}
                className="relative flex flex-col items-center justify-start flex-1 pt-2 pb-1"
              >
                {/* Inner container with negative margin to float above nav */}
                <div className="relative -mt-6">
                  <span className={cn(
                    'flex items-center justify-center w-14 h-14 rounded-full shadow-lg transition-colors',
                    active ? 'bg-[#F07018]' : 'bg-[#F07018]/90 hover:bg-[#F07018]'
                  )}>
                    {urgent && urgentCount > 0 && (
                      <span className="absolute top-0 right-0 min-w-[16px] h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none animate-pulse">
                        {urgentCount > 9 ? '9+' : urgentCount}
                      </span>
                    )}
                    <Icon className="h-6 w-6 text-white" />
                  </span>
                </div>
                <span className="text-[10px] font-medium text-[#F07018] mt-1">{label}</span>
              </Link>
            )
          }
          return (
            <Link
              key={href}
              href={href}
              aria-label={label}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative flex flex-col items-center gap-0.5 px-1 py-2 text-[10px] font-medium transition-colors',
                active ? 'text-[#F07018]' : 'text-white/60 hover:text-white/90'
              )}
            >
              {active && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-[#F07018] rounded-full" />
              )}
              <Icon className="h-5 w-5" />
              {label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
