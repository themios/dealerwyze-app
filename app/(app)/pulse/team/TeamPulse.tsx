// app/(app)/pulse/team/TeamPulse.tsx
'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { Users, ChevronDown } from 'lucide-react'
import { pulseScoreColor } from '@/lib/pulse/scoreColor'

interface RepScore {
  rep_id: string
  name: string
  overall_score: number | null
  response_count: number
  by_category: { category: string; label: string; score: number }[]
}

function scoreClass(s: number | null): string {
  const c = pulseScoreColor(s)
  return c === 'green' ? 'text-green-600' : c === 'yellow' ? 'text-yellow-600' : 'text-red-600'
}

function ScoreBadge({ score }: { score: number | null }) {
  const color = score === null ? 'bg-muted text-muted-foreground'
    : score >= 4.5 ? 'bg-green-100 text-green-700'
    : score >= 3.5 ? 'bg-yellow-100 text-yellow-700'
    : 'bg-red-100 text-red-600'
  return (
    <span className={cn('text-sm font-bold px-2.5 py-1 rounded-full', color)}>
      {score?.toFixed(1) ?? '--'}
    </span>
  )
}

export default function TeamPulse() {
  const [reps, setReps]         = useState<RepScore[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    fetch('/api/pulse/team-scores?days=90')
      .then(r => r.json())
      .then(d => { setReps(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return <div className="p-8 flex items-center justify-center"><div className="text-sm text-muted-foreground">Loading...</div></div>

  if (reps.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Users className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
        <p className="text-sm">No team scores yet.</p>
        <p className="text-xs mt-1">Scores appear here once surveys are completed.</p>
      </div>
    )
  }

  return (
    <div className="px-4 py-4 space-y-3 max-w-lg mx-auto">
      {reps.map(rep => (
        <div key={rep.rep_id} className="bg-card rounded-xl border overflow-hidden">
          <button
            className="w-full flex items-center justify-between p-4 hover:bg-accent/50 transition-colors"
            onClick={() => setExpanded(e => e === rep.rep_id ? null : rep.rep_id)}
          >
            <div className="text-left">
              <p className="text-sm font-semibold">{rep.name}</p>
              <p className="text-xs text-muted-foreground">{rep.response_count} surveys</p>
            </div>
            <div className="flex items-center gap-2">
              <ScoreBadge score={rep.overall_score} />
              <ChevronDown className={cn(
                'h-4 w-4 text-muted-foreground transition-transform duration-200',
                expanded === rep.rep_id && 'rotate-180'
              )} />
            </div>
          </button>
          {expanded === rep.rep_id && (
            <div className="border-t px-4 py-3 space-y-2">
              {rep.by_category.map(c => (
                <div key={c.category} className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{c.label}</span>
                  <span className={cn('font-semibold', scoreClass(c.score))}>{c.score.toFixed(1)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
