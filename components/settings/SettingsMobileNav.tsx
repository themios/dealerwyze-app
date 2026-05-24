'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Settings, Search, ChevronRight, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { GROUPS, SETTINGS_ITEMS, matchesSearch, getGroupForPath, resolveGroupTitle, resolveItemTitle, type GroupId } from '@/lib/settings/config'
import { useVertical } from '@/hooks/useVertical'
import { canViewSettingsAudience } from '@/lib/settings/access'
import type { UserRole } from '@/types/index'

interface Props {
  role: UserRole
  canManageReconTemplate: boolean
}

export default function SettingsMobileNav({ role, canManageReconTemplate }: Props) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const { vertical } = useVertical()

  const currentGroup = getGroupForPath(pathname)
  const currentGroupConfig = GROUPS.find(g => g.id === currentGroup)
  const currentGroupLabel = currentGroupConfig ? resolveGroupTitle(currentGroupConfig, vertical) : 'Settings'

  const [activeGroup, setActiveGroup] = useState<GroupId>(currentGroup ?? 'business')

  // Listen for events from BottomNav
  useEffect(() => {
    const openNav = () => { setOpen(true); setQuery(''); setActiveGroup(currentGroup ?? 'business') }
    const openSearch = () => {
      setOpen(true)
      setQuery('')
      setActiveGroup(currentGroup ?? 'business')
      setTimeout(() => searchRef.current?.focus(), 100)
    }
    window.addEventListener('settings:open-nav', openNav)
    window.addEventListener('settings:open-search', openSearch)
    return () => {
      window.removeEventListener('settings:open-nav', openNav)
      window.removeEventListener('settings:open-search', openSearch)
    }
  }, [currentGroup])

  // Swipe-to-dismiss
  const sheetRef = useRef<HTMLDivElement>(null)
  const dragStart = useRef<number | null>(null)

  function onPointerDown(e: React.PointerEvent) {
    dragStart.current = e.clientY
  }
  function onPointerMove(e: React.PointerEvent) {
    if (dragStart.current === null || !sheetRef.current) return
    const delta = e.clientY - dragStart.current
    if (delta > 0) {
      sheetRef.current.style.transform = `translateY(${delta}px)`
    }
  }
  function onPointerUp(e: React.PointerEvent) {
    if (dragStart.current === null || !sheetRef.current) return
    const delta = e.clientY - dragStart.current
    sheetRef.current.style.transform = ''
    if (delta > 80) setOpen(false)
    dragStart.current = null
  }

  function close() {
    setOpen(false)
    setQuery('')
  }

  const visibleItems = SETTINGS_ITEMS.filter(item => {
    if (!canManageReconTemplate && item.id === 'recon-template') return false
    if (item.verticalHide?.includes(vertical)) return false
    return canViewSettingsAudience(role, item.audience)
  })

  const displayItems = query
    ? visibleItems.filter(item => matchesSearch(item, query))
    : visibleItems.filter(item => item.group === activeGroup)

  const onSettingsRoute = pathname.startsWith('/settings')

  return (
    <>
      {/* Floating trigger pill — only visible on settings routes */}
      {onSettingsRoute && (
        <button
          onClick={() => { setOpen(true); setActiveGroup(currentGroup ?? 'business') }}
          className="lg:hidden fixed bottom-[4.5rem] right-4 z-30 flex items-center gap-2 px-3 py-2 rounded-full bg-[#0D1F33] border border-white/15 shadow-lg text-white/80 hover:text-white hover:border-[#F07018]/40 transition-colors"
        >
          <Settings className="h-3.5 w-3.5 text-[#F07018]" />
          <span className="text-xs font-medium">{currentGroupLabel}</span>
        </button>
      )}

      {/* Backdrop */}
      <div
        onClick={close}
        className={cn(
          'lg:hidden fixed inset-0 bg-black/50 z-40 transition-opacity duration-200',
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
        )}
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        className={cn(
          'lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#0D1F33] rounded-t-2xl border-t border-white/10',
          'flex flex-col transition-transform duration-250 ease-out',
          open ? 'translate-y-0' : 'translate-y-full',
        )}
        style={{ height: '60vh' }}
      >
        {/* Drag handle */}
        <div
          className="flex justify-center pt-3 pb-1 cursor-grab active:cursor-grabbing touch-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          <div className="w-10 h-1 bg-white/20 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center gap-2 px-4 pb-3 pt-1">
          <p className="text-white font-semibold text-sm">Settings</p>
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/30 pointer-events-none" />
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search…"
              className="w-full bg-white/5 border border-white/10 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-[#F07018]/50 transition-colors"
            />
          </div>
          <button onClick={close} className="p-1 text-white/40 hover:text-white transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Group tabs — hidden when searching */}
        {!query && (
          <div className="flex gap-2 px-4 pb-3 overflow-x-auto no-scrollbar">
            {GROUPS.filter(g => visibleItems.some(i => i.group === g.id)).map(group => (
              <button
                key={group.id}
                onClick={() => setActiveGroup(group.id)}
                className={cn(
                  'shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
                  activeGroup === group.id
                    ? 'bg-[#F07018] text-white'
                    : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white',
                )}
              >
                {resolveGroupTitle(group, vertical)}
              </button>
            ))}
          </div>
        )}

        {/* Items */}
        <div className="flex-1 overflow-y-auto px-3 pb-6 space-y-0.5">
          {displayItems.length === 0 ? (
            <p className="text-center text-xs text-white/30 py-8">No settings match</p>
          ) : (
            displayItems.map(item => {
              const active = pathname === item.href || pathname.startsWith(item.href + '/')
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  onClick={close}
                  className={cn(
                    'flex items-center gap-3 px-3 py-3 rounded-xl transition-colors',
                    active ? 'bg-white/10 text-[#F07018]' : 'text-white/70 hover:bg-white/5 hover:text-white',
                  )}
                >
                  <item.icon className={cn('h-4 w-4 shrink-0', active ? 'text-[#F07018]' : 'text-white/40')} />
                  <p className="text-sm font-medium flex-1">{resolveItemTitle(item, vertical)}</p>
                  <ChevronRight className={cn('h-4 w-4 shrink-0', active ? 'text-[#F07018]/60' : 'text-white/20')} />
                </Link>
              )
            })
          )}
        </div>
      </div>
    </>
  )
}
