'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type EventCount = { event: string; count: number }
type AdoptionPayload = { posthog_configured: boolean; event_counts: EventCount[]; period_days: number }

const EVENT_LABELS: Record<string, { label: string; group: string }> = {
  sms_sent: { label: 'SMS Sent', group: 'Messaging' },
  email_sent: { label: 'Email Sent', group: 'Messaging' },
  customer_viewed: { label: 'Customer Viewed', group: 'Customers' },
  appointment_scheduled: { label: 'Appointment Scheduled', group: 'Customers' },
  calendar_viewed: { label: 'Calendar Viewed', group: 'Calendar' },
  vehicle_sold: { label: 'Vehicle Sold', group: 'Vehicles' },
  receipt_scanned: { label: 'Receipt Scanned', group: 'Receipts' },
  ai_brief_generated: { label: 'AI Brief Generated', group: 'AI' },
  ai_brief_viewed: { label: 'AI Brief Viewed', group: 'AI' },
}

function pct(n: number, max: number) {
  if (max <= 0) return 0
  return Math.round((n / max) * 100)
}

function barColor(rank: number, total: number) {
  if (rank <= 2) return 'bg-green-500'
  if (rank >= Math.floor(total * 0.75)) return 'bg-amber-500'
  return 'bg-blue-500'
}

export default function FeatureAdoptionPage() {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<AdoptionPayload | null>(null)

  async function load({ setBusy }: { setBusy: boolean }) {
    if (setBusy) setLoading(true)
    const res = await fetch('/api/admin/feature-adoption', { cache: 'no-store' })
    const json = await res.json() as AdoptionPayload
    setData(json)
    setLoading(false)
  }

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const res = await fetch('/api/admin/feature-adoption', { cache: 'no-store' })
      const json = await res.json() as AdoptionPayload
      if (cancelled) return
      setData(json)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [])

  const rows = useMemo(() => {
    const counts = (data?.event_counts ?? [])
      .filter(r => r.count > 0)
      .sort((a, b) => b.count - a.count)
    const max = counts[0]?.count ?? 0
    return { counts, max }
  }, [data])

  const grouped = useMemo(() => {
    const out = new Map<string, EventCount[]>()
    for (const r of rows.counts) {
      const meta = EVENT_LABELS[r.event]
      const group = meta?.group ?? 'Other'
      if (!out.has(group)) out.set(group, [])
      out.get(group)!.push(r)
    }
    return Array.from(out.entries())
  }, [rows.counts])

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Feature Adoption</h1>
          <p className="text-sm text-muted-foreground">Last {data?.period_days ?? 30} days (relative usage).</p>
        </div>
        <Button onClick={() => { void load({ setBusy: true }) }} disabled={loading} variant="outline" size="sm">
          {loading ? 'Refreshing…' : 'Refresh'}
        </Button>
      </div>

      {data && !data.posthog_configured && (
        <Card className="border-yellow-300/40 bg-yellow-50 dark:bg-yellow-950/20">
          <CardHeader><CardTitle className="text-sm">PostHog not configured</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Add `POSTHOG_PERSONAL_API_KEY` and `POSTHOG_PROJECT_ID` to server env vars.
          </CardContent>
        </Card>
      )}

      {grouped.map(([group, items]) => (
        <Card key={group}>
          <CardHeader>
            <CardTitle className="text-sm">{group}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {items.map((r, idx) => {
              const label = EVENT_LABELS[r.event]?.label ?? r.event
              const p = pct(r.count, rows.max)
              const color = barColor(idx, items.length)
              return (
                <div key={r.event} className="grid grid-cols-[160px,70px,1fr,50px] gap-3 items-center">
                  <div className="text-sm font-medium truncate">{label}</div>
                  <div className="text-sm tabular-nums text-right">{r.count}</div>
                  <div className="h-2 rounded bg-muted overflow-hidden">
                    <div className={`h-full ${color}`} style={{ width: `${p}%` }} />
                  </div>
                  <div className="text-xs text-muted-foreground tabular-nums text-right">{p}%</div>
                </div>
              )
            })}
            {items.length === 0 && <div className="text-sm text-muted-foreground">No events.</div>}
          </CardContent>
        </Card>
      ))}

      <div className="pt-1">
        <Link href="https://us.posthog.com" target="_blank" className="text-sm text-primary underline underline-offset-4">
          Open PostHog dashboard
        </Link>
      </div>
    </div>
  )
}

