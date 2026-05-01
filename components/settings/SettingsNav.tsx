'use client'

import { cn } from '@/lib/utils'

interface SettingsNavGroup {
  id: string
  title: string
  description: string
  count: number
}

interface SettingsNavProps {
  groups: SettingsNavGroup[]
  selectedGroupId: string
  onSelect: (groupId: string) => void
}

export default function SettingsNav({ groups, selectedGroupId, onSelect }: SettingsNavProps) {
  return (
    <nav className="rounded-2xl border bg-card p-3">
      <div className="mb-3 px-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Groups</p>
      </div>
      <div className="space-y-1">
        {groups.map(group => (
          <button
            key={group.id}
            type="button"
            onClick={() => onSelect(group.id)}
            className={cn(
              'w-full rounded-xl px-3 py-3 text-left transition-colors',
              selectedGroupId === group.id ? 'bg-primary text-primary-foreground' : 'hover:bg-accent',
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">{group.title}</p>
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                  selectedGroupId === group.id ? 'bg-white/15 text-primary-foreground' : 'bg-muted text-muted-foreground',
                )}
              >
                {group.count}
              </span>
            </div>
            <p className={cn('mt-1 text-xs', selectedGroupId === group.id ? 'text-primary-foreground/80' : 'text-muted-foreground')}>
              {group.description}
            </p>
          </button>
        ))}
      </div>
    </nav>
  )
}
