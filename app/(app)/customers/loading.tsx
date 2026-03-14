import { SkeletonRow } from '@/components/ui/SkeletonRow'

export default function CustomersLoading() {
  return (
    <div>
      {/* TopBar skeleton */}
      <div className="h-14 border-b px-4 flex items-center gap-3 animate-pulse">
        <div className="h-4 w-20 bg-muted rounded" />
        <div className="flex-1 h-8 bg-muted rounded-lg" />
        <div className="h-8 w-8 bg-muted rounded" />
      </div>

      {/* List skeleton */}
      <div className="divide-y">
        {Array.from({ length: 8 }).map((_, i) => (
          <SkeletonRow key={i} lines={2} />
        ))}
      </div>
    </div>
  )
}
