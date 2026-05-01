'use client'

interface Props {
  selectedCount: number
  onAction: (action: 'park' | 'trust_sequence' | 'archive') => void
  onClear: () => void
}

export default function TodayBulkBar({ selectedCount, onAction, onClear }: Props) {
  if (selectedCount <= 0) return null

  return (
    <div className="fixed bottom-[72px] left-4 right-4 z-40 rounded-2xl border bg-card px-4 py-3 shadow-xl">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{selectedCount} selected</span>
        <button type="button" onClick={() => onAction('park')} className="rounded-full bg-muted px-3 py-1.5 text-sm">Park All</button>
        <button type="button" onClick={() => onAction('trust_sequence')} className="rounded-full bg-muted px-3 py-1.5 text-sm">Trust Sequence</button>
        <button type="button" onClick={() => onAction('archive')} className="rounded-full bg-destructive px-3 py-1.5 text-sm text-destructive-foreground">Archive All</button>
        <button type="button" onClick={onClear} className="ml-auto text-sm text-muted-foreground">Clear</button>
      </div>
    </div>
  )
}
