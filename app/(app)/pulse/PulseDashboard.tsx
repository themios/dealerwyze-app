// app/(app)/pulse/PulseDashboard.tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import type { Category } from '@/lib/pulse/questions'

function scoreColor(s: number | null): 'green' | 'yellow' | 'red' {
  if (s === null) return 'yellow'
  if (s >= 4.5) return 'green'
  if (s >= 3.5) return 'yellow'
  return 'red'
}

function ScoreBadge({ score }: { score: number | null }) {
  const c = scoreColor(score)
  return (
    <span className={cn(
      'text-sm font-bold px-2 py-0.5 rounded-full',
      c === 'green'  && 'bg-green-100 text-green-700',
      c === 'yellow' && 'bg-yellow-100 text-yellow-700',
      c === 'red'    && 'bg-red-100 text-red-600',
    )}>
      {score?.toFixed(1) ?? '--'}
    </span>
  )
}

interface CategoryRow { category: Category; label: string; score: number; count: number }
interface RecentItem  { id: string; overall_score: number | null; completed_at: string; customer: { id: string; name: string } | null; trigger_type: string }
interface ScoresData  { overall_score: number | null; response_count: number; by_category: CategoryRow[]; recent: RecentItem[] }

export default function PulseDashboard() {
  const [data, setData]       = useState<ScoresData | null>(null)
  const [loading, setLoading] = useState(true)
  const [days, setDays]       = useState(90)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/pulse/scores?days=${days}`)
    if (res.ok) setData(await res.json())
    setLoading(false)
  }, [days])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="p-8 text-center text-sm text-muted-foreground">Loading...</div>

  return (
    <div className="px-4 py-4 space-y-5 max-w-2xl mx-auto">
      {/* Period toggle */}
      <div className="flex gap-2">
        {[30, 90, 180].map(d => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors',
              days === d
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border text-muted-foreground hover:bg-accent'
            )}
          >
            {d} days
          </button>
        ))}
      </div>

      {/* Overall score */}
      <div className="bg-card rounded-xl border p-6 text-center">
        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Overall Pulse Score</p>
        <div className={cn(
          'text-5xl font-bold mb-1',
          scoreColor(data?.overall_score ?? null) === 'green'  && 'text-green-600',
          scoreColor(data?.overall_score ?? null) === 'yellow' && 'text-yellow-600',
          scoreColor(data?.overall_score ?? null) === 'red'    && 'text-red-600',
        )}>
          {data?.overall_score?.toFixed(1) ?? '--'}
        </div>
        <p className="text-xs text-muted-foreground">
          {data?.response_count ?? 0} responses in the last {days} days
        </p>
      </div>

      {/* By category */}
      {(data?.by_category?.length ?? 0) > 0 && (
        <div className="bg-card rounded-xl border overflow-hidden">
          <p className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b">By Category</p>
          {data!.by_category.map((row, i) => (
            <div key={row.category} className={cn('flex items-center justify-between px-4 py-3', i > 0 && 'border-t')}>
              <div>
                <p className="text-sm font-medium">{row.label}</p>
                <p className="text-xs text-muted-foreground">{row.count} responses</p>
              </div>
              <ScoreBadge score={row.score} />
            </div>
          ))}
        </div>
      )}

      {/* Recent responses */}
      {(data?.recent?.length ?? 0) > 0 && (
        <div className="bg-card rounded-xl border overflow-hidden">
          <p className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b">Recent Responses</p>
          {data!.recent.map((r, i) => (
            <div key={r.id} className={cn('flex items-center justify-between px-4 py-3', i > 0 && 'border-t')}>
              <div>
                <p className="text-sm font-medium">{r.customer?.name ?? 'Unknown'}</p>
                <p className="text-xs text-muted-foreground capitalize">
                  {r.trigger_type.replace('_', '-')} &middot; {new Date(r.completed_at).toLocaleDateString()}
                </p>
              </div>
              <ScoreBadge score={r.overall_score} />
            </div>
          ))}
        </div>
      )}

      {(!data || data.response_count === 0) && (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-3xl mb-3">📊</p>
          <p className="text-sm">No survey responses yet.</p>
          <p className="text-xs mt-1">Enable Customer Pulse in Settings, then send your first survey.</p>
        </div>
      )}
    </div>
  )
}
