'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import {
  Home, Users, Car, BookUser, MoreHorizontal,
  LayoutDashboard, Building2, Bell, TicketCheck, ShieldCheck,
} from 'lucide-react'
import { cn } from '@/lib/utils'

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
  { href: '/today',     label: 'Today',     icon: Home },
  { href: '/customers', label: 'Leads',     icon: Users },
  { href: '/vehicles',  label: 'Inventory', icon: Car },
  { href: '/contacts',  label: 'Contacts',  icon: BookUser },
  { href: '/more',      label: 'More',      icon: MoreHorizontal },
]

const ADMIN_BOTTOM_NAV = [
  { href: '/admin',         label: 'Dashboard', icon: LayoutDashboard, badge: null },
  { href: '/admin/orgs',    label: 'Dealers',   icon: Building2,       badge: null },
  { href: '/admin/alerts',  label: 'Alerts',    icon: Bell,            badge: 'alerts' as const },
  { href: '/admin/tickets', label: 'Tickets',   icon: TicketCheck,     badge: 'tickets' as const },
  { href: '/today',         label: 'Exit',      icon: ShieldCheck,     badge: null },
]

export default function BottomNav() {
  const pathname = usePathname()
  const isAdminArea = pathname.startsWith('/admin')

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
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-[#F07018] rounded-full" />
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
    <nav className="lg:hidden fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md border-t border-[#1B4A8A] bg-[#0D2B55]">
      <div className="flex items-center justify-around h-16">
        {DEALER_NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = href === '/more'
            ? ['/more', '/bhph', '/analytics', '/reports', '/admin', '/support', '/fax'].some(p => pathname.startsWith(p))
            : pathname.startsWith(href)
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
              {href === '/today' && <TodayBadge />}
              {href === '/more' && <AdminTicketsBadge />}
              <Icon className="h-5 w-5" />
              {label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
