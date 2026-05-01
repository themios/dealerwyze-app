'use client'

import type { TodaySection } from '@/lib/today/queueSort'

interface Props {
  counts: Record<TodaySection, number>
  onJump: (section: TodaySection) => void
}

export default function TodaySummaryStrip({ counts, onJump }: Props) {
  const summary = [
    { key: 'human_now' as const, label: 'need you', value: counts.human_now + counts.replied },
    { key: 'ai_handling' as const, label: 'automated', value: counts.ai_handling },
    { key: 'low_roi' as const, label: 'quiet', value: counts.low_roi + counts.follow_up_later },
  ]

  return (
    <div className="flex gap-2 overflow-x-auto no-scrollbar py-1">
      {summary.map(item => (
        <button
          key={item.key}
          type="button"
          onClick={() => onJump(item.key)}
          className="shrink-0 rounded-full border border-border bg-card px-3 py-1.5 text-sm"
        >
          <span className="font-semibold text-foreground">{item.value}</span>
          <span className="text-muted-foreground"> {item.label}</span>
        </button>
      ))}
    </div>
  )
}
