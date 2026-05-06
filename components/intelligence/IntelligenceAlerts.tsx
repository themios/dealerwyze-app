'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { X, Lightbulb, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Rec {
  id: string
  type: string
  priority: 'critical' | 'high' | 'medium' | 'low'
  title: string
  body: string
  entity_type: string | null
  entity_id: string | null
}

const PRIORITY_STYLES: Record<string, string> = {
  critical: 'border-red-200/80 bg-red-50/60 dark:border-red-900/50 dark:bg-red-950/20',
  high:     'border-orange-200/80 bg-orange-50/60 dark:border-orange-900/50 dark:bg-orange-950/20',
  medium:   'border-amber-200/80 bg-amber-50/60 dark:border-amber-900/50 dark:bg-amber-950/20',
  low:      'border-blue-200/80 bg-blue-50/40 dark:border-blue-900/50 dark:bg-blue-950/20',
}

const LABEL_STYLES: Record<string, string> = {
  critical: 'text-red-800 dark:text-red-200',
  high:     'text-orange-800 dark:text-orange-200',
  medium:   'text-amber-800 dark:text-amber-200',
  low:      'text-blue-800 dark:text-blue-200',
}

export function IntelligenceAlerts() {
  const [recs, setRecs] = useState<Rec[]>([])
  const [open, setOpen] = useState(true)

  useEffect(() => {
    fetch('/api/intelligence/recommendations', { credentials: 'same-origin' })
      .then(r => r.ok ? r.json() : { recommendations: [] })
      .then(d => setRecs((d.recommendations ?? []).slice(0, 3)))
      .catch(() => {})
  }, [])

  async function dismiss(id: string) {
    setRecs(prev => prev.filter(r => r.id !== id))
    await fetch(`/api/intelligence/recommendations/${id}/dismiss`, {
      method: 'POST',
      credentials: 'same-origin',
    })
  }

  async function actedOn(id: string) {
    setRecs(prev => prev.filter(r => r.id !== id))
    await fetch(`/api/intelligence/recommendations/${id}/acted`, {
      method: 'POST',
      credentials: 'same-origin',
    })
  }

  if (recs.length === 0) return null

  return (
    <section className="space-y-2 rounded-xl border border-blue-200/80 bg-blue-50/40 p-3 dark:border-blue-900/50 dark:bg-blue-950/20">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Lightbulb className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-800 dark:text-blue-200">
            Intelligence Alerts
          </p>
          <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-900/60 dark:text-blue-300">
            {recs.length}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="text-blue-500 hover:text-blue-700 dark:text-blue-400"
          aria-label={open ? 'Collapse alerts' : 'Expand alerts'}
        >
          {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
      </div>

      {open && (
        <ul className="space-y-2">
          {recs.map(rec => (
            <li
              key={rec.id}
              className={cn(
                'relative rounded-lg border p-3 text-sm',
                PRIORITY_STYLES[rec.priority] ?? PRIORITY_STYLES.medium,
              )}
            >
              <button
                type="button"
                onClick={() => dismiss(rec.id)}
                className="absolute right-2 top-2 opacity-40 hover:opacity-80 transition-opacity"
                aria-label="Dismiss"
              >
                <X className="h-3 w-3" />
              </button>
              <p className={cn('pr-5 text-xs font-semibold', LABEL_STYLES[rec.priority])}>
                {rec.title}
              </p>
              <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{rec.body}</p>
              <Button
                size="sm"
                variant="outline"
                className="mt-2 h-6 text-[11px]"
                onClick={() => actedOn(rec.id)}
              >
                Mark as acted on
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
