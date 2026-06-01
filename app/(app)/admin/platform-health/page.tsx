'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type SentryIssue = {
  id?: string
  title?: string
  culprit?: string
  count?: string | number
  lastSeen?: string
  last_seen?: string
  level?: string
}

type SentryVolume = unknown

type PlatformHealth = {
  internal: { activeOrgs: number; activeToday: number; openAlerts: number }
  sentry: { configured: boolean; org: string | null; issues: SentryIssue[]; volume: SentryVolume[] }
  ai: { ok: boolean; model: string; error: string | null }
}

function humanizeAgo(dateStr?: string | null) {
  if (!dateStr) return '—'
  const ms = Date.now() - new Date(dateStr).getTime()
  const h = Math.floor(ms / 3600000)
  if (h <= 0) return 'Just now'
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

function severityBadge(level?: string) {
  const l = (level ?? 'error').toLowerCase()
  const cls =
    l === 'error' ? 'bg-red-100 text-red-700' :
    l === 'warning' ? 'bg-amber-100 text-amber-800' :
    'bg-blue-100 text-blue-700'
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{l}</span>
}

function sparkBars(volume: SentryVolume[]) {
  const first = Array.isArray(volume) ? volume[0] : null
  const points: number[] = Array.isArray(first)
    ? (first as unknown[]).map(p => {
      if (!Array.isArray(p)) return 0
      const v = (p as unknown[])[1]
      return typeof v === 'number' ? v : Number(v ?? 0)
    })
    : []
  const max = Math.max(1, ...points)
  const avg = points.length ? points.reduce((a, b) => a + b, 0) / points.length : 0
  const w = 240
  const h = 40
  const barW = points.length ? Math.floor(w / points.length) : 8
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
      {points.slice(0, 24).map((v, i) => {
        const bh = Math.max(1, Math.round((v / max) * h))
        const y = h - bh
        const hot = avg > 0 && v > 2 * avg
        return <rect key={i} x={i * barW} y={y} width={barW - 1} height={bh} rx={1} fill={hot ? '#ef4444' : '#94a3b8'} />
      })}
    </svg>
  )
}

export default function PlatformHealthPage() {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<PlatformHealth | null>(null)

  async function load() {
    setLoading(true)
    const res = await fetch('/api/admin/platform-health', { cache: 'no-store' })
    const json = await res.json() as PlatformHealth
    setData(json)
    setLoading(false)
  }

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const res = await fetch('/api/admin/platform-health', { cache: 'no-store' })
      const json = await res.json() as PlatformHealth
      if (cancelled) return
      setData(json)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [])

  const sentryOrg = data?.sentry.org

  const issues = useMemo(() => (data?.sentry?.issues ?? []).slice(0, 10), [data])

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Platform Health</h1>
          <p className="text-sm text-muted-foreground">Sentry errors, platform alerts, and active org stats.</p>
        </div>
        <Button onClick={load} disabled={loading} variant="outline" size="sm">
          {loading ? 'Refreshing…' : 'Refresh'}
        </Button>
      </div>

      {data && !data.ai?.ok && (
        <div className="animate-pulse rounded-lg border-2 border-red-500 bg-red-50 dark:bg-red-950/40 px-4 py-3 flex items-start gap-3">
          <span className="text-red-600 text-xl leading-none mt-0.5">⚠</span>
          <div>
            <p className="text-sm font-bold text-red-700 dark:text-red-400">AI Model Degraded — Action Required</p>
            <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
              Primary model <code className="font-mono bg-red-100 dark:bg-red-900 px-1 rounded">{data.ai?.model}</code> is unavailable.
              All AI features are falling back to Claude Haiku.
              Update <code className="font-mono bg-red-100 dark:bg-red-900 px-1 rounded">AI_MODEL</code> in <code className="font-mono bg-red-100 dark:bg-red-900 px-1 rounded">lib/ai/client.ts</code>.
            </p>
            {data.ai?.error && (
              <p className="text-xs text-red-500 mt-1 font-mono">{data.ai.error}</p>
            )}
          </div>
        </div>
      )}

      {data && !data.sentry.configured && (
        <Card className="border-yellow-300/40 bg-yellow-50 dark:bg-yellow-950/20">
          <CardHeader><CardTitle className="text-sm">Sentry not configured</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Add `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` to environment variables.
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardHeader><CardTitle className="text-xs text-muted-foreground">Active Orgs</CardTitle></CardHeader><CardContent className="text-2xl font-semibold tabular-nums">{data?.internal.activeOrgs ?? (loading ? '—' : 0)}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-xs text-muted-foreground">Active Today</CardTitle></CardHeader><CardContent className="text-2xl font-semibold tabular-nums">{data?.internal.activeToday ?? (loading ? '—' : 0)}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-xs text-muted-foreground">Open Alerts</CardTitle></CardHeader><CardContent className="text-2xl font-semibold tabular-nums">{data?.internal.openAlerts ?? (loading ? '—' : 0)}</CardContent></Card>
        <Card>
          <CardHeader><CardTitle className="text-xs text-muted-foreground">Sentry Errors (24h)</CardTitle></CardHeader>
          <CardContent className="pt-2">{data ? sparkBars(data.sentry.volume) : <div className="h-10" />}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Sentry — Top open issues</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="grid grid-cols-[1fr,90px,90px] gap-3 text-xs text-muted-foreground">
            <div>Title</div><div className="text-right">Count</div><div>Last seen</div>
          </div>
          <div className="space-y-2">
            {issues.map((it) => {
              const title = String(it.title ?? it.culprit ?? 'Untitled').slice(0, 60)
              const count = Number(it.count ?? 0)
              const lastSeen = it.lastSeen ?? it.last_seen
              const level = it.level
              const issueId = it.id
              const href = sentryOrg && issueId ? `https://sentry.io/organizations/${sentryOrg}/issues/${issueId}/` : 'https://sentry.io'
              return (
                <a key={String(issueId ?? title)} href={href} target="_blank" rel="noreferrer" className="block rounded-md border p-3 hover:bg-muted/30">
                  <div className="grid grid-cols-[1fr,90px,90px] gap-3 items-center">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        {severityBadge(level)}
                        <span className="truncate text-sm font-medium">{title}</span>
                      </div>
                    </div>
                    <div className="text-right tabular-nums text-sm">{count}</div>
                    <div className="text-xs text-muted-foreground">{humanizeAgo(lastSeen)}</div>
                  </div>
                </a>
              )
            })}
            {issues.length === 0 && (
              <div className="text-sm text-muted-foreground">No issues (or Sentry not configured).</div>
            )}
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Link href="https://sentry.io" target="_blank" className="text-sm text-primary underline underline-offset-4">Open Sentry dashboard</Link>
            <Link href="https://app.axiom.co" target="_blank" className="text-sm text-primary underline underline-offset-4">Open Axiom</Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

