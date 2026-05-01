'use client'

import { cn } from '@/lib/utils'

export type TodayFilter =
  | 'hot'
  | 'warm'
  | 'repeat'
  | 'appointment'
  | 'phone'
  | 'silent7'
  | 'no_automation'

const FILTERS: Array<{ key: TodayFilter; label: string }> = [
  { key: 'hot', label: 'Hot' },
  { key: 'warm', label: 'Warm' },
  { key: 'repeat', label: 'Repeat Buyer' },
  { key: 'appointment', label: 'Has Appointment' },
  { key: 'phone', label: 'Phone Only' },
  { key: 'silent7', label: 'Silent 7+ Days' },
  { key: 'no_automation', label: 'No Automation' },
]

interface Props {
  active: TodayFilter[]
  counts: Record<TodayFilter, number>
  onToggle: (filter: TodayFilter) => void
}

export default function TodayFilterChips({ active, counts, onToggle }: Props) {
  return (
    <div className="flex gap-2 overflow-x-auto no-scrollbar py-1">
      {FILTERS.map(({ key, label }) => {
        const isActive = active.includes(key)
        return (
          <button
            key={key}
            type="button"
            onClick={() => onToggle(key)}
            className={cn(
              'shrink-0 rounded-full px-3 py-1.5 text-sm border transition-colors',
              isActive ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted text-muted-foreground border-transparent',
            )}
          >
            {label}
            {counts[key] > 0 && (
              <span className={cn('ml-1 rounded-full px-1.5 py-0.5 text-xs', isActive ? 'bg-primary-foreground/15' : 'bg-background text-foreground')}>
                {counts[key]}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
