'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Search, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { GROUPS, SETTINGS_ITEMS, matchesSearch, resolveGroupTitle, resolveItemTitle, type SettingsItemConfig } from '@/lib/settings/config'
import { useVertical } from '@/hooks/useVertical'
import { canViewSettingsAudience } from '@/lib/settings/access'
import type { UserRole } from '@/types/index'

interface Props {
  role: UserRole
  canManageReconTemplate: boolean
}

export default function SettingsDesktopNav({ role, canManageReconTemplate }: Props) {
  const pathname = usePathname()
  const [query, setQuery] = useState('')
  const { vertical } = useVertical()

  const visibleItems = SETTINGS_ITEMS.filter(item => {
    if (!canManageReconTemplate && item.id === 'recon-template') return false
    if (item.verticalHide?.includes(vertical)) return false
    return canViewSettingsAudience(role, item.audience)
  })

  const filtered = query
    ? visibleItems.filter(item => matchesSearch(item, query))
    : null

  function isActive(item: SettingsItemConfig) {
    return pathname === item.href || pathname.startsWith(item.href + '/')
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Search */}
      <div className="px-3 py-3 border-b border-white/8">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/30 pointer-events-none" />
          <input
            type="text"
            autoComplete="off"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search settings…"
            className="w-full bg-white/5 border border-white/10 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-[#F07018]/60 transition-colors"
          />
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-5">
        {filtered ? (
          /* Search results — flat list */
          filtered.length === 0 ? (
            <p className="px-3 text-xs text-white/30 py-4 text-center">No settings match</p>
          ) : (
            <div className="space-y-0.5">
              {filtered.map(item => (
                <NavItem key={item.id} item={item} active={isActive(item)} vertical={vertical} />
              ))}
            </div>
          )
        ) : (
          /* Grouped list */
          GROUPS.filter(group => visibleItems.some(i => i.group === group.id)).map(group => (
            <div key={group.id}>
              <p className="px-3 mb-1 text-[9px] font-bold tracking-widest text-white/30 uppercase">
                {resolveGroupTitle(group, vertical)}
              </p>
              <div className="space-y-0.5">
                {visibleItems
                  .filter(i => i.group === group.id)
                  .map(item => (
                    <NavItem key={item.id} item={item} active={isActive(item)} vertical={vertical} />
                  ))}
              </div>
            </div>
          ))
        )}
      </nav>
    </div>
  )
}

function NavItem({ item, active, vertical }: { item: SettingsItemConfig; active: boolean; vertical: 'dealer' | 'real_estate' }) {
  return (
    <Link
      href={item.href}
      className={cn(
        'relative flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors group',
        active
          ? 'bg-white/10 text-[#F07018]'
          : 'text-white/60 hover:text-white hover:bg-white/5',
      )}
    >
      {active && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-[#F07018] rounded-r-full" />
      )}
      <item.icon className={cn('h-4 w-4 shrink-0', active ? 'text-[#F07018]' : 'text-white/40 group-hover:text-white/70')} />
      <span className="flex-1 truncate">{resolveItemTitle(item, vertical)}</span>
      {active && <ChevronRight className="h-3 w-3 text-[#F07018]/60 shrink-0" />}
    </Link>
  )
}
