'use client'

import { cn } from '@/lib/utils'

type FilterType = 'all' | 'overdue' | 'today' | 'waiting'

const FILTERS: { key: FilterType; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'today', label: 'Today' },
  { key: 'waiting', label: 'Waiting' },
]

interface TodayFiltersProps {
  active: FilterType
  onChange: (filter: FilterType) => void
  counts: Record<FilterType, number>
}

export default function TodayFilters({ active, onChange, counts }: TodayFiltersProps) {
  return (
    <div className="flex gap-2 px-4 py-2 overflow-x-auto no-scrollbar">
      {FILTERS.map(({ key, label }) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors',
            active === key
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:text-foreground'
          )}
        >
          {label}
          {counts[key] > 0 && (
            <span className={cn(
              'text-xs rounded-full px-1.5 py-0.5 min-w-[20px] text-center',
              active === key ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-background text-foreground'
            )}>
              {counts[key]}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}
