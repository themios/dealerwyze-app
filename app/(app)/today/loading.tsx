import { SkeletonCard } from '@/components/ui/SkeletonRow'

export default function TodayLoading() {
  return (
    <div>
      {/* TopBar skeleton — matches actual bg-[#0D2B55] header */}
      <div className="sticky top-0 z-10 h-12 bg-[#0D2B55] shadow-md px-3 flex items-center justify-between animate-pulse">
        <div className="h-4 w-16 bg-white/20 rounded" />
        <div className="flex gap-2">
          <div className="h-7 w-7 bg-white/20 rounded" />
          <div className="h-7 w-7 bg-white/20 rounded" />
        </div>
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
