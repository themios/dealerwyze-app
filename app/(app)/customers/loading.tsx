import { SkeletonRow } from '@/components/ui/SkeletonRow'

export default function CustomersLoading() {
  return (
    <div>
      {/* TopBar skeleton — matches actual bg-[#0D2B55] header */}
      <div className="sticky top-0 z-10 h-12 bg-[#0D2B55] shadow-md px-3 flex items-center gap-3 animate-pulse">
        <div className="h-4 w-20 bg-white/20 rounded" />
        <div className="flex-1 h-7 bg-white/20 rounded-lg" />
        <div className="h-7 w-7 bg-white/20 rounded" />
      </div>

      {/* List skeleton */}
      <div className="divide-y">
        {Array.from({ length: 8 }).map((_, i) => (
          <SkeletonRow key={i} lines={2} delay={i * 60} />
        ))}
      </div>
    </div>
  )
}
