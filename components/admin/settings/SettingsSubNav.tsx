'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const SETTINGS_NAV_ITEMS: Array<{ label: string; href: string; danger?: boolean }> = [
  { label: 'General', href: '/admin/settings/general' },
  { label: 'SM Connector', href: '/admin/settings/social' },
  { label: 'Content Pipeline', href: '/admin/settings/content' },
  { label: 'Integrations', href: '/admin/settings/integrations' },
  { label: 'Feature Flags', href: '/admin/settings/features' },
  { label: 'Notifications', href: '/admin/settings/notifications' },
  { label: 'Billing & Quotas', href: '/admin/settings/billing' },
  { label: 'Compliance', href: '/admin/settings/compliance' },
  { label: 'Team', href: '/admin/settings/team' },
  { label: 'Danger Zone', href: '/admin/settings/danger', danger: true },
] as const

export default function SettingsSubNav() {
  const pathname = usePathname()

  return (
    <aside className="w-52 shrink-0 border-r border-[#1B4A8A]/30 bg-[#0a1628] h-full overflow-y-auto py-3 px-2">
      <p className="text-[9px] font-bold tracking-widest text-white/30 uppercase px-3 mb-2">
        PLATFORM SETTINGS
      </p>
      <nav className="space-y-0.5">
        {SETTINGS_NAV_ITEMS.map(item => {
          const isActive = pathname === item.href
          if (item.danger) {
            return (
              <Link
                key={item.href}
                href={item.href}
                className="relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-red-400/70 hover:text-red-300"
              >
                {item.label}
              </Link>
            )
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-[#1B4A8A]/60 text-white'
                  : 'text-white/60 hover:text-white/80 hover:bg-white/5'
              )}
            >
              {isActive ? (
                <span className="absolute left-0 w-1 h-6 bg-[#F07018] rounded-r-full" />
              ) : null}
              {item.label}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
