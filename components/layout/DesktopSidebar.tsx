'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import {
  Home, Users, Car, BookUser,
  CreditCard, BarChart2, HeadphonesIcon,
  ShieldCheck, Settings, Printer, Globe,
  LayoutDashboard, Bell, Building2, TrendingDown,
  LineChart, GitBranch, UserCog, TicketCheck, ScrollText,
  LogOut, Briefcase, Contact, Heart, Inbox,
  Activity, BarChart3, DatabaseBackup, ArchiveRestore,
  Clapperboard,
} from 'lucide-react'

interface MeResponse {
  is_platform_admin?: boolean
  role?: string
  platform_role?: string | null
  platform_permissions?: string[]
}

// ── Dealer nav ────────────────────────────────────────────────────────────────

function WebLeadsBadge() {
  const [count, setCount] = useState(0)
  useEffect(() => {
    fetch('/api/leads/web/count')
      .then(r => r.ok ? r.json() : null)
      .then((d: { count?: number } | null) => setCount(d?.count ?? 0))
      .catch(() => {})
  }, [])
  if (!count) return null
  return (
    <span className="ml-auto min-w-[18px] h-[18px] bg-green-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 leading-none">
      {count > 99 ? '99+' : count}
    </span>
  )
}

function AdminPanelBadge() {
  const [count, setCount] = useState(0)
  useEffect(() => {
    fetch('/api/admin/badges')
      .then(r => r.ok ? r.json() : null)
      .then((d: { alerts?: number; tickets?: number; new_orgs?: number } | null) => {
        setCount((d?.alerts ?? 0) + (d?.tickets ?? 0) + (d?.new_orgs ?? 0))
      })
      .catch(() => {})
  }, [])
  if (!count) return null
  return (
    <span className="ml-auto min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 leading-none">
      {count > 99 ? '99+' : count}
    </span>
  )
}

const BASE_NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/today',     label: 'Today',     icon: Home },
  { href: '/customers', label: 'Leads',     icon: Users },
  { href: '/leads/web', label: 'Web Leads', icon: Inbox,           badge: 'webleads' as const },
  { href: '/vehicles',  label: 'Inventory', icon: Car },
  { href: '/contacts',  label: 'Contacts',  icon: BookUser },
]

const ROLE_NAV = [
  { href: '/bhph',      label: 'BHPH',      icon: CreditCard,     requiresRole: (r: string) => r !== 'dealer_rep' },
  { href: '/admin/security-audit', label: 'Security Audit', icon: ShieldCheck, requiresRole: (r: string) => ['dealer_admin', 'dealer_manager', 'admin'].includes(r) },
  { href: '/analytics', label: 'Analytics', icon: BarChart2,      requiresRole: (r: string) => ['dealer_admin', 'dealer_manager', 'admin'].includes(r) },
  { href: '/pulse',     label: 'Pulse',     icon: Heart,          requiresRole: (r: string) => ['dealer_admin', 'dealer_manager', 'admin'].includes(r) },
  { href: '/fax',               label: 'Fax',      icon: Printer,        requiresRole: () => true },
  { href: '/support',           label: 'Support',  icon: HeadphonesIcon, requiresRole: () => true },
  { href: '/settings/website',  label: 'Website',  icon: Globe,          requiresRole: (r: string) => r === 'dealer_admin' || r === 'admin' },
  { href: '/settings',          label: 'Settings', icon: Settings,       requiresRole: () => true },
]

const ADMIN_NAV = { href: '/admin', label: 'Admin Panel', icon: ShieldCheck }

// ── Admin nav ─────────────────────────────────────────────────────────────────

interface AdminNavItem {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  badge?: 'alerts' | 'retention' | 'tickets' | 'new_orgs'
  area?: string
}

const ADMIN_NAV_GROUPS: { section: string; items: AdminNavItem[] }[] = [
  {
    section: 'OVERVIEW',
    items: [
      { href: '/admin',          label: 'Dashboard',   icon: LayoutDashboard },
      { href: '/admin/alerts',   label: 'Alerts',      icon: Bell,           badge: 'alerts',    area: 'alerts' },
    ],
  },
  {
    section: 'DEALERS',
    items: [
      { href: '/admin/customers',  label: 'All Customers', icon: Contact,     area: 'dealers' },
      { href: '/admin/orgs',       label: 'Dealerships',   icon: Building2,   badge: 'new_orgs', area: 'dealers' },
      { href: '/admin/retention',  label: 'Retention',     icon: TrendingDown, badge: 'retention', area: 'retention' },
    ],
  },
  {
    section: 'SALES TEAM',
    items: [
      { href: '/admin/sales',      label: 'Sales Team',    icon: Briefcase,   area: 'sales' },
    ],
  },
  {
    section: 'REVENUE',
    items: [
      { href: '/admin/analytics',  label: 'Analytics',    icon: LineChart,    area: 'analytics' },
      { href: '/admin/affiliates', label: 'Affiliates',   icon: GitBranch,    area: 'affiliates' },
    ],
  },
  {
    section: 'PLATFORM',
    items: [
      { href: '/admin/platform-health',  label: 'Platform Health',  icon: Activity,       area: 'alerts' },
      { href: '/admin/feature-adoption', label: 'Feature Adoption', icon: BarChart3,      area: 'analytics' },
      { href: '/admin/data-recovery',    label: 'Data Recovery',    icon: ArchiveRestore, area: 'dealers' },
      { href: '/admin/backup-status',    label: 'Backup Status',    icon: DatabaseBackup, area: 'staff' },
      { href: '/admin/staff',      label: 'Platform Team', icon: UserCog,     area: 'staff' },
      { href: '/admin/tickets',    label: 'Tickets',       icon: TicketCheck, badge: 'tickets', area: 'tickets' },
      { href: '/admin/audit-log',  label: 'Audit Log',     icon: ScrollText },
      { href: '/marketing/content', label: 'Content',      icon: Clapperboard },
    ],
  },
]

const ROLE_DEFAULT_AREAS: Record<string, string[]> = {
  platform_admin:          [],
  platform_staff_manager:  ['dealers', 'retention', 'staff', 'tickets', 'alerts'],
  platform_sales_manager:  ['dealers', 'retention', 'sales', 'analytics', 'affiliates', 'commissions'],
  platform_staff:          ['tickets', 'dealers'],
}

const ROLE_LABEL: Record<string, string> = {
  platform_admin:          'Admin',
  platform_staff_manager:  'Staff Manager',
  platform_sales_manager:  'Sales Manager',
  platform_staff:          'Support Staff',
}

// Single fetch for all admin sidebar badge counts
interface AdminBadgeCounts {
  alerts: number
  tickets: number
  retention: number
  new_orgs: number
}

function useAdminBadges(): AdminBadgeCounts {
  const [counts, setCounts] = useState<AdminBadgeCounts>({ alerts: 0, tickets: 0, retention: 0, new_orgs: 0 })
  useEffect(() => {
    Promise.all([
      fetch('/api/admin/badges').then(r => r.ok ? r.json() : null),
      fetch('/api/admin/retention?count=1').then(r => r.ok ? r.json() : null),
    ]).then(([badges, retention]: [{ alerts?: number; tickets?: number; new_orgs?: number } | null, { at_risk?: number } | null]) => {
      setCounts({
        alerts: badges?.alerts ?? 0,
        tickets: badges?.tickets ?? 0,
        retention: retention?.at_risk ?? 0,
        new_orgs: badges?.new_orgs ?? 0,
      })
    }).catch(() => {})
  }, [])
  return counts
}

function BadgeCount({ count, color }: { count: number; color: string }) {
  if (!count) return null
  return (
    <span className={`ml-auto min-w-[18px] h-[18px] ${color} text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 leading-none`}>
      {count > 99 ? '99+' : count}
    </span>
  )
}

function AdminSidebar({ platformRole, platformPermissions, isSuperAdmin }: {
  platformRole?: string | null
  platformPermissions?: string[]
  isSuperAdmin: boolean
}) {
  const pathname = usePathname()
  const badges = useAdminBadges()

  const allowedAreas: Set<string> = isSuperAdmin
    ? new Set(['*'])
    : platformRole === 'platform_admin'
      ? new Set(platformPermissions ?? [])
      : new Set(ROLE_DEFAULT_AREAS[platformRole ?? ''] ?? [])

  const canSee = (area?: string) => {
    if (isSuperAdmin) return true
    if (!area) return isSuperAdmin
    return allowedAreas.has(area)
  }

  const roleLabel = isSuperAdmin
    ? 'Super Admin'
    : ROLE_LABEL[platformRole ?? ''] ?? 'Admin'

  function isActive(href: string) {
    if (href === '/admin') return pathname === '/admin'
    return pathname.startsWith(href)
  }

  return (
    <aside className="hidden lg:flex flex-col w-60 shrink-0 h-dvh bg-[#0D2B55] border-r border-[#1B4A8A] overflow-y-auto">
      {/* Logo */}
      <div className="px-4 py-4 border-b border-[#1B4A8A]">
        <Image src="/logo.png" alt="DealerWyze" width={160} height={107} priority style={{ height: 'auto' }} className="object-contain rounded-sm" />
        <p className="text-white/40 text-[10px] mt-1.5 font-semibold uppercase tracking-widest">{roleLabel}</p>
      </div>

      {/* Admin nav groups */}
      <nav className="flex-1 py-3 px-2 space-y-4 overflow-y-auto">
        {ADMIN_NAV_GROUPS.map(({ section, items }) => {
          const visibleItems = items.filter(item => canSee(item.area))
          if (!visibleItems.length) return null
          return (
            <div key={section}>
              <p className="px-3 mb-1 text-[9px] font-bold tracking-widest text-white/30 uppercase">{section}</p>
              <div className="space-y-0.5">
                {visibleItems.map(({ href, label, icon: Icon, badge }) => {
                  const active = isActive(href)
                  return (
                    <Link
                      key={href}
                      href={href}
                      className={cn(
                        'relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                        active
                          ? 'bg-white/10 text-[#F07018]'
                          : 'text-white/70 hover:text-white hover:bg-white/5'
                      )}
                    >
                      {active && (
                        <span className="absolute left-0 w-1 h-6 bg-[#F07018] rounded-r-full" />
                      )}
                      <Icon className="h-4 w-4 shrink-0" />
                      {label}
                      {badge === 'alerts'    && <BadgeCount count={badges.alerts}    color="bg-red-500" />}
                      {badge === 'retention' && <BadgeCount count={badges.retention} color="bg-orange-500" />}
                      {badge === 'tickets'   && <BadgeCount count={badges.tickets}   color="bg-blue-500" />}
                      {badge === 'new_orgs'  && <BadgeCount count={badges.new_orgs}  color="bg-green-500" />}
                    </Link>
                  )
                })}
              </div>
            </div>
          )
        })}
      </nav>

      {/* Exit admin */}
      <div className="px-2 py-3 border-t border-[#1B4A8A]">
        <Link
          href="/today"
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-white/50 hover:text-white hover:bg-white/5 transition-colors"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          Exit Admin
        </Link>
      </div>
    </aside>
  )
}

// ── Dealer sidebar ────────────────────────────────────────────────────────────

interface DealerNavItem {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  badge?: string
}

function DealerSidebar({ orgName, role, isPlatformAdmin }: { orgName?: string | null; role: string; isPlatformAdmin: boolean }) {
  const pathname = usePathname()

  const visibleRoleNav = ROLE_NAV.filter(item => item.requiresRole(role))
  const allNav: DealerNavItem[] = [
    ...BASE_NAV,
    ...visibleRoleNav,
    ...(isPlatformAdmin ? [ADMIN_NAV] : []),
  ]

  function isActive(href: string) {
    if (href === '/dashboard') return pathname === '/dashboard' || pathname === '/'
    if (href === '/today') return pathname === '/today'
    if (href === '/admin') return pathname === '/admin'
    return pathname.startsWith(href)
  }

  return (
    <aside className="hidden lg:flex flex-col w-60 shrink-0 h-dvh bg-[#0D2B55] border-r border-[#1B4A8A] overflow-y-auto">
      {/* Logo / org name */}
      <div className="px-4 py-4 border-b border-[#1B4A8A]">
        <Image src="/logo.png" alt="DealerWyze" width={160} height={107} priority style={{ height: 'auto' }} className="object-contain rounded-sm" />
        {orgName && (
          <p className="text-white/50 text-xs mt-2 truncate">{orgName}</p>
        )}
      </div>

      {/* Nav links */}
      <nav className="flex-1 py-3 px-2 space-y-0.5">
        {allNav.map(({ href, label, icon: Icon, badge }) => {
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
              {badge === 'webleads' && <WebLeadsBadge />}
              {href === '/admin' && isPlatformAdmin && <AdminPanelBadge />}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}

// ── Root export ───────────────────────────────────────────────────────────────

export default function DesktopSidebar({ orgName }: { orgName?: string | null }) {
  const pathname = usePathname()
  const [me, setMe] = useState<MeResponse>({})

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then((d: MeResponse) => setMe(d))
      .catch(() => {})
  }, [])

  const isAdminArea = pathname.startsWith('/admin')

  if (isAdminArea && me.is_platform_admin) {
    const isSuperAdmin = !me.platform_role
    return (
      <AdminSidebar
        platformRole={me.platform_role}
        platformPermissions={me.platform_permissions}
        isSuperAdmin={isSuperAdmin}
      />
    )
  }

  return (
    <DealerSidebar
      orgName={orgName}
      role={me.role ?? ''}
      isPlatformAdmin={me.is_platform_admin ?? false}
    />
  )
}
