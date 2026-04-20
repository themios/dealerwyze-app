export default function DashboardLoading() {
  return (
    <div className="min-h-dvh animate-pulse">
      {/* TopBar */}
      <div className="sticky top-0 z-10 h-12 bg-background shadow-sm px-3 flex items-center justify-between border-b border-border">
        <div className="h-4 w-24 bg-muted rounded" />
        <div className="h-7 w-7 bg-muted rounded" />
      </div>

      <div className="space-y-5 pb-10">
        {/* Greeting */}
        <div className="px-4 pt-4 space-y-1.5">
          <div className="h-4 w-40 bg-muted rounded" />
          <div className="h-3 w-28 bg-muted rounded" />
        </div>

        {/* Score tile */}
        <div className="mx-4 h-20 rounded-xl bg-muted border border-border" />

        {/* Urgency strip */}
        <div className="mx-4 h-10 rounded-xl bg-muted border border-border" />

        {/* Streak + wins */}
        <div className="px-4 flex gap-3">
          <div className="flex-1 h-14 rounded-xl bg-muted border border-border" />
          <div className="flex-1 h-14 rounded-xl bg-muted border border-border" />
        </div>

        {/* Goal bars */}
        <div className="px-4 space-y-2">
          <div className="h-3 w-full bg-muted rounded" />
          <div className="h-3 w-3/4 bg-muted rounded" />
        </div>

        {/* 2-col stat tiles */}
        <div className="px-4 grid grid-cols-2 gap-3">
          <div className="h-28 rounded-xl bg-muted border border-border" />
          <div className="h-28 rounded-xl bg-muted border border-border" />
        </div>

        {/* Inventory */}
        <div className="mx-4 h-24 rounded-xl bg-muted border border-border" />

        {/* Brief */}
        <div className="mx-4 h-14 rounded-xl bg-muted border border-border" />

        {/* Quick actions */}
        <div className="px-4 grid grid-cols-3 gap-2">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-muted border border-border" />
          ))}
        </div>
      </div>
    </div>
  )
}
