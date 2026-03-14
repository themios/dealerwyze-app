import { SkeletonCard } from '@/components/ui/SkeletonRow'

export default function TodayLoading() {
  return (
    <div>
      {/* TopBar skeleton */}
      <div className="h-14 border-b px-4 flex items-center animate-pulse">
        <div className="h-4 w-32 bg-muted rounded" />
      </div>

      {/* KPI strip skeleton */}
      <div className="px-4 pt-4 flex gap-3 overflow-hidden animate-pulse">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex-1 h-16 bg-muted rounded-xl" />
        ))}
      </div>

      {/* Cards skeleton */}
      <div className="px-4 py-4 space-y-3">
        <div className="h-4 w-32 bg-muted rounded animate-pulse" />
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  )
}
