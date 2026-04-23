// app/(app)/pulse/team/TeamPulse.tsx
'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'

interface RepScore {
  rep_id: string
  name: string
  overall_score: number | null
  response_count: number
  by_category: { category: string; label: string; score: number }[]
}

function scoreColor(s: number | null) {
  if (s === null) return 'text-muted-foreground'
  if (s >= 4.5) return 'text-green-600'
  if (s >= 3.5) return 'text-yellow-600'
  return 'text-red-600'
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

  if (loading) return <div className="p-8 text-center text-sm text-muted-foreground">Loading...</div>

  if (reps.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="text-3xl mb-3">👥</p>
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
            <span className={cn('text-2xl font-bold', scoreColor(rep.overall_score))}>
              {rep.overall_score?.toFixed(1) ?? '--'}
            </span>
          </button>
          {expanded === rep.rep_id && (
            <div className="border-t px-4 py-3 space-y-2">
              {rep.by_category.map(c => (
                <div key={c.category} className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{c.label}</span>
                  <span className={cn('font-semibold', scoreColor(c.score))}>{c.score.toFixed(1)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
