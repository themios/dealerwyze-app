'use client'

import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp, RefreshCw, TrendingUp, AlertTriangle, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

type Status = 'good' | 'warn' | 'bad' | 'neutral'

interface ReportJson {
  headline: string
  bullets: string[]
  key_lever: string
  scorecards: Array<{ label: string; value: string; delta: string; status: Status }>
  top_actions: Array<{ rank: number; action: string; minutes: number }>
  performance_insight: string
  sales_insight: string
  bhph_insight: string
  lead_insight: string
  inventory_insight: string
  discipline_insight: string
  alerts: Array<{ severity: 'warn' | 'critical'; message: string }>
}

interface BriefingResponse {
  report_json: ReportJson
  generated_at: string
  tokens_used: number
  cached: boolean
}

function statusColor(s: Status) {
  if (s === 'good') return 'text-green-600 dark:text-green-400'
  if (s === 'warn') return 'text-amber-500'
  if (s === 'bad') return 'text-red-500'
  return 'text-foreground'
}

function statusBg(s: Status) {
  if (s === 'good') return 'bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800'
  if (s === 'warn') return 'bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800'
  if (s === 'bad') return 'bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800'
  return 'bg-muted/30 border-border'
}

export default function DealerBrief() {
  const [data, setData] = useState<BriefingResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [regenerating, setRegenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/intelligence/briefing')
      if (!res.ok) throw new Error(await res.text())
      setData(await res.json())
    } catch (e) {
      setError(String(e))
    }
    setLoading(false)
  }

  async function regenerate() {
    setRegenerating(true)
    setError(null)
    try {
      const res = await fetch('/api/intelligence/briefing', { method: 'POST' })
      if (!res.ok) throw new Error(await res.text())
      setData(await res.json())
    } catch (e) {
      setError(String(e))
    }
    setRegenerating(false)
  }

  useEffect(() => { load() }, [])

  if (loading) {
    return (
      <div className="mx-4 mb-3 rounded-xl border bg-card p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          Generating your dealer brief…
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-4 mb-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
        <p className="text-sm text-destructive font-medium">Brief unavailable</p>
        <p className="text-xs text-muted-foreground mt-1 break-all line-clamp-3">{error}</p>
        <Button size="sm" variant="outline" className="mt-2" onClick={load}>Retry</Button>
      </div>
    )
  }

  if (!data?.report_json) return null
  const r = data.report_json
  const timeStr = new Date(data.generated_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

  const insights = [
    { label: 'Sales', text: r.sales_insight },
    { label: 'BHPH', text: r.bhph_insight },
    { label: 'Performance', text: r.performance_insight },
    { label: 'Leads', text: r.lead_insight },
    { label: 'Inventory', text: r.inventory_insight },
    { label: 'Discipline', text: r.discipline_insight },
    { label: 'SMS', text: (r as unknown as Record<string, string>).twilio_insight },
  ].filter(x => x.text)

  return (
    <div className="mx-4 mb-3 rounded-xl border bg-card overflow-hidden">
      {/* Header — always visible */}
      <button
        className="w-full flex items-start justify-between p-4 text-left"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex-1 min-w-0 pr-2">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="h-4 w-4 text-primary flex-shrink-0" />
            <span className="text-xs font-semibold text-primary uppercase tracking-wide">Dealer Brief</span>
            <span className="text-xs text-muted-foreground" suppressHydrationWarning>· {timeStr}</span>
          </div>
          <p className="text-sm font-semibold leading-snug">{r.headline}</p>
        </div>
        {expanded
          ? <ChevronUp className="h-4 w-4 text-muted-foreground mt-1 flex-shrink-0" />
          : <ChevronDown className="h-4 w-4 text-muted-foreground mt-1 flex-shrink-0" />}
      </button>

      {expanded && (
        <div className="border-t divide-y">

          {/* Summary bullets + key lever */}
          <div className="px-4 py-3 space-y-1.5">
            {r.bullets?.map((b, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <span className="text-muted-foreground mt-0.5 flex-shrink-0">·</span>
                <span>{b}</span>
              </div>
            ))}
            {r.key_lever && (
              <div className="mt-2 pt-2 border-t text-sm font-medium text-primary">
                → {r.key_lever}
              </div>
            )}
          </div>

          {/* Scorecards — 2 column grid */}
          {r.scorecards?.length > 0 && (
            <div className="px-4 py-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Scorecards</p>
              <div className="grid grid-cols-2 gap-2">
                {r.scorecards.map((sc, i) => (
                  <div key={i} className={`rounded-lg border p-2.5 ${statusBg(sc.status)}`}>
                    <p className="text-xs text-muted-foreground leading-tight">{sc.label}</p>
                    <p className={`text-xl font-bold mt-0.5 ${statusColor(sc.status)}`}>{sc.value}</p>
                    {sc.delta && sc.delta !== '—' && (
                      <p className="text-xs text-muted-foreground">{sc.delta}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Alerts */}
          {r.alerts?.filter(a => a.severity === 'critical' || a.severity === 'warn').length > 0 && (
            <div className="px-4 py-3 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Alerts</p>
              {r.alerts.filter(a => a.severity === 'critical' || a.severity === 'warn').map((a, i) => (
                <div key={i} className="flex items-start gap-2">
                  {a.severity === 'critical'
                    ? <XCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
                    : <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />}
                  <p className="text-sm">{a.message}</p>
                </div>
              ))}
            </div>
          )}

          {/* Top Actions */}
          {r.top_actions?.length > 0 && (
            <div className="px-4 py-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Top Actions Today</p>
              <div className="space-y-2.5">
                {r.top_actions.map((a, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <div className="flex-shrink-0 w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                      {a.rank}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">{a.action}</p>
                      <p className="text-xs text-muted-foreground">{a.minutes} min</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Analysis — all 6 insights */}
          {insights.length > 0 && (
            <div className="px-4 py-3 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Analysis</p>
              {insights.map(({ label, text }) => (
                <div key={label} className="text-sm">
                  <span className="font-medium text-muted-foreground">{label}: </span>{text}
                </div>
              ))}
            </div>
          )}

          {/* Footer */}
          <div className="px-4 py-2.5 flex items-center justify-between bg-muted/20">
            <p className="text-xs text-muted-foreground">
              {data.cached ? 'Cached' : 'Generated'} · {data.tokens_used?.toLocaleString()} tokens
            </p>
            <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={regenerate} disabled={regenerating}>
              <RefreshCw className={`h-3 w-3 ${regenerating ? 'animate-spin' : ''}`} />
              {regenerating ? 'Generating…' : 'Regenerate'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
