// app/(app)/pulse/PulseDashboard.tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { BarChart3 } from 'lucide-react'
import type { Category } from '@/lib/pulse/questions'
import { pulseScoreColor } from '@/lib/pulse/scoreColor'

function ScoreBadge({ score }: { score: number | null }) {
  const c = pulseScoreColor(score)
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
  const [data, setData]         = useState<ScoresData | null>(null)
  const [loading, setLoading]   = useState(true)
  const [days, setDays]         = useState(90)
  const [enabled, setEnabled]   = useState<boolean | null>(null)
  const [toggling, setToggling] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [scoresRes, settingsRes] = await Promise.all([
      fetch(`/api/pulse/scores?days=${days}`),
      fetch('/api/settings/pulse'),
    ])
    if (scoresRes.ok)   setData(await scoresRes.json())
    if (settingsRes.ok) { const s = await settingsRes.json(); setEnabled(!!s.pulse_enabled) }
    setLoading(false)
  }, [days])

  useEffect(() => { load() }, [load])

  async function toggleEnabled() {
    if (enabled === null) return
    setToggling(true)
    const next = !enabled
    setEnabled(next)
    await fetch('/api/settings/pulse', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pulse_enabled: next }),
    })
    setToggling(false)
  }

  if (loading) return <div className="p-8 flex items-center justify-center"><div className="text-sm text-muted-foreground">Loading...</div></div>

  return (
    <div className="px-4 py-4 space-y-5 max-w-2xl mx-auto">
      {/* Enable / disable banner */}
      <div className={cn(
        'flex items-center justify-between px-4 py-3 rounded-xl border',
        enabled ? 'bg-green-50 border-green-200' : 'bg-muted border-border'
      )}>
        <div>
          <p className={cn('text-sm font-semibold', enabled ? 'text-green-700' : 'text-foreground')}>
            Customer Pulse is {enabled ? 'active' : 'disabled'}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {enabled ? 'Surveys will auto-send after sales.' : 'No surveys are being sent.'}
          </p>
        </div>
        <Button
          onClick={toggleEnabled}
          disabled={toggling}
          variant="outline"
          size="sm"
          className={cn(
            'transition-colors',
            enabled
              ? 'border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700'
              : 'bg-green-600 border-green-600 text-white hover:bg-green-700 hover:text-white'
          )}
        >
          {toggling ? '...' : enabled ? 'Disable' : 'Enable'}
        </Button>
      </div>

      {/* Period toggle */}
      <div className="flex gap-2">
        {[30, 90, 180].map(d => (
          <Button
            key={d}
            variant="outline"
            size="sm"
            onClick={() => setDays(d)}
            className={cn(
              'text-xs font-semibold transition-colors',
              days === d
                ? 'bg-primary text-primary-foreground border-primary hover:bg-primary hover:text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent'
            )}
          >
            {d} days
          </Button>
        ))}
      </div>

      {/* Overall score */}
      <div className="bg-card rounded-xl border p-6 text-center">
        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Overall Pulse Score</p>
        <div className={cn(
          'text-5xl font-bold mb-1',
          pulseScoreColor(data?.overall_score ?? null) === 'green'  && 'text-green-600',
          pulseScoreColor(data?.overall_score ?? null) === 'yellow' && 'text-yellow-600',
          pulseScoreColor(data?.overall_score ?? null) === 'red'    && 'text-red-600',
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
          <BarChart3 className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
          <p className="text-sm">No survey responses yet.</p>
          <p className="text-xs mt-1">{enabled ? 'Surveys will appear here once customers respond.' : 'Enable Customer Pulse above to start sending surveys.'}</p>
        </div>
      )}
    </div>
  )
}
