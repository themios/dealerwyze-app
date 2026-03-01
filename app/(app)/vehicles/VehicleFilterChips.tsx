'use client'

import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'

interface Props {
  current: string
  counts: { all: number; available: number; pending: number; sold: number }
  currentSort: string
}

const SORT_OPTIONS = [
  { key: 'newest', label: 'Newest' },
  { key: 'oldest', label: 'Oldest' },
  { key: 'price_desc', label: 'Price ↓' },
  { key: 'price_asc', label: 'Price ↑' },
  { key: 'year_desc', label: 'Year ↓' },
]

export default function VehicleFilterChips({ current, counts, currentSort }: Props) {
  const router = useRouter()

  const filters = [
    { key: 'all', label: `All (${counts.all})` },
    { key: 'available', label: `Available (${counts.available})`, activeClass: 'bg-green-600 text-white border-green-600' },
    { key: 'pending', label: `Pending (${counts.pending})`, activeClass: 'bg-yellow-500 text-white border-yellow-500' },
    { key: 'sold', label: `Sold (${counts.sold})` },
  ]

  function buildUrl(status: string, sort: string) {
    const params = new URLSearchParams()
    if (status !== 'all') params.set('status', status)
    if (sort !== 'newest') params.set('sort', sort)
    const qs = params.toString()
    return qs ? `/vehicles?${qs}` : '/vehicles'
  }

  return (
    <div className="space-y-1.5">
      <div className="flex gap-2 px-4 pt-2 pb-1 overflow-x-auto scrollbar-none">
        {filters.map(f => (
          <button
            key={f.key}
            onClick={() => router.push(buildUrl(f.key, currentSort))}
            className={cn(
              'flex-shrink-0 text-xs font-medium px-3 py-1.5 rounded-full border transition-colors',
              current === f.key
                ? (f.activeClass ?? 'bg-foreground text-background border-foreground')
                : 'bg-background text-muted-foreground border-border hover:text-foreground'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className="flex gap-2 px-4 pb-2 overflow-x-auto scrollbar-none">
        <span className="text-[10px] text-muted-foreground flex-shrink-0 self-center">Sort:</span>
        {SORT_OPTIONS.map(s => (
          <button
            key={s.key}
            onClick={() => router.push(buildUrl(current, s.key))}
            className={cn(
              'flex-shrink-0 text-[10px] font-medium px-2.5 py-1 rounded-full border transition-colors',
              currentSort === s.key
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background text-muted-foreground border-border hover:text-foreground'
            )}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  )
}
