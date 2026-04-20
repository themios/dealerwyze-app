'use client'

export function SkeletonRow({ lines = 2, delay = 0 }: { lines?: 1 | 2 | 3; delay?: number }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 animate-pulse" style={{ animationDelay: `${delay}ms` }}>
      <div className="h-9 w-9 rounded-full bg-muted flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-3.5 bg-muted rounded w-2/3" />
        {lines >= 2 && <div className="h-3 bg-muted rounded w-1/2" />}
        {lines >= 3 && <div className="h-3 bg-muted rounded w-1/3" />}
      </div>
    </div>
  )
}

export function SkeletonCard({ delay = 0 }: { delay?: number }) {
  return (
    <div className="rounded-lg border p-4 space-y-3 animate-pulse" style={{ animationDelay: `${delay}ms` }}>
      <div className="flex items-start gap-3">
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-muted rounded w-3/4" />
          <div className="h-3 bg-muted rounded w-1/2" />
        </div>
        <div className="h-5 w-12 bg-muted rounded-full" />
      </div>
      <div className="flex gap-2">
        <div className="h-9 flex-1 bg-muted rounded" />
        <div className="h-9 flex-1 bg-muted rounded" />
        <div className="h-9 w-12 bg-muted rounded" />
      </div>
    </div>
  )
}
