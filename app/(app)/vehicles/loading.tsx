import { SkeletonRow } from '@/components/ui/SkeletonRow'

export default function VehiclesLoading() {
  return (
    <div>
      {/* TopBar skeleton — matches actual bg-[#0D2B55] header */}
      <div className="sticky top-0 z-10 h-12 bg-[#0D2B55] shadow-md px-3 flex items-center gap-3 animate-pulse">
        <div className="h-4 w-24 bg-white/20 rounded" />
        <div className="flex-1 h-7 bg-white/20 rounded-lg" />
        <div className="h-7 w-7 bg-white/20 rounded" />
      </div>

      {/* Filter chips skeleton */}
      <div className="px-4 py-2 flex gap-2 animate-pulse">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-7 w-20 bg-muted rounded-full" />
        ))}
      </div>

      {/* List skeleton */}
      <div className="divide-y">
        {Array.from({ length: 8 }).map((_, i) => (
          <SkeletonRow key={i} lines={3} delay={i * 60} />
        ))}
      </div>
    </div>
  )
}
