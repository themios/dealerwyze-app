// components/today/PulseScoreWidget.tsx
'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'

interface AnonFeedback {
  overall_score: number | null
  completed_at: string
  by_category: { category: string; label: string; score: number }[]
}

interface Props {
  pulseScore: number | null
}

function scoreColor(s: number | null) {
  if (s === null) return 'text-muted-foreground bg-muted border-border'
  if (s >= 4.5) return 'text-green-600 bg-green-50 border-green-200'
  if (s >= 3.5) return 'text-yellow-600 bg-yellow-50 border-yellow-200'
  return 'text-red-600 bg-red-50 border-red-200'
}

export default function PulseScoreWidget({ pulseScore }: Props) {
  const [open, setOpen]         = useState(false)
  const [loading, setLoading]   = useState(false)
  const [feedback, setFeedback] = useState<AnonFeedback[]>([])

  async function handleOpen() {
    setOpen(true)
    if (feedback.length > 0) return
    setLoading(true)
    const res = await fetch('/api/pulse/rep-feedback')
    if (res.ok) setFeedback(await res.json())
    setLoading(false)
  }

  return (
    <>
      <button
        onClick={handleOpen}
        className={cn(
          'flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-semibold transition-colors hover:opacity-80',
          scoreColor(pulseScore)
        )}
      >
        <span>My Pulse</span>
        <span className="text-lg font-bold">{pulseScore !== null ? pulseScore.toFixed(1) : '--'}</span>
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="h-[70vh]">
          <SheetHeader className="mb-2">
            <SheetTitle>My Feedback - Last 90 Days</SheetTitle>
          </SheetHeader>
          <p className="text-xs text-muted-foreground mb-4">
            Customer names are never shown. All feedback here is anonymous.
          </p>
          {loading && <p className="text-sm text-muted-foreground">Loading...</p>}
          {!loading && feedback.length === 0 && (
            <p className="text-sm text-muted-foreground">No completed surveys yet.</p>
          )}
          <div className="space-y-3 overflow-y-auto max-h-[calc(70vh-120px)] pb-4">
            {feedback.map((f, i) => (
              <div key={i} className="bg-card rounded-xl border p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs text-muted-foreground">{new Date(f.completed_at).toLocaleDateString()}</p>
                  <span className={cn(
                    'text-sm font-bold px-2 py-0.5 rounded-full',
                    (f.overall_score ?? 0) >= 4.5 ? 'bg-green-100 text-green-700'
                    : (f.overall_score ?? 0) >= 3.5 ? 'bg-yellow-100 text-yellow-700'
                    : 'bg-red-100 text-red-600'
                  )}>
                    {f.overall_score?.toFixed(1) ?? '--'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-1">
                  {f.by_category.map(c => (
                    <div key={c.category} className="flex justify-between text-xs">
                      <span className="text-muted-foreground">{c.label}</span>
                      <span className="font-medium">{c.score.toFixed(1)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
