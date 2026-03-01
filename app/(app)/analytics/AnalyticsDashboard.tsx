'use client'

import { useEffect, useState, useCallback } from 'react'
import { Loader2, Download } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

// ── Types ──────────────────────────────────────────────────────────────────

interface AnalyticsData {
  period: { from: string; to: string }
  leads: {
    total: number
    by_source: Record<string, number>
    avg_response_seconds: number | null
  }
  funnel: Array<{ state: string; count: number }>
  sms: { sent: number; replied: number }
  voice: {
    total: number
    avg_duration_seconds: number
    total_seconds: number
    estimated_cost: number
  }
  revenue: { total: number; units_sold: number }
  bhph: { collection_rate_pct: number | null; total_paid: number; total_loan: number }
}

// ── Sub-components ─────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color }: {
  label: string; value: string | number; sub?: string; color?: string
}) {
  return (
    <div className="bg-muted/50 rounded-lg p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color ?? ''}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  )
}

function CssBar({ pct, color = 'bg-primary' }: { pct: number; color?: string }) {
  return (
    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
      <div
        className={`h-full rounded-full transition-all ${color}`}
        style={{ width: `${Math.min(Math.max(pct, 0), 100)}%` }}
      />
    </div>
  )
}

// ── Date range presets ─────────────────────────────────────────────────────

const PRESETS = [
  { label: 'Today', days: 0 },
  { label: '7d',    days: 7 },
  { label: '30d',   days: 30 },
  { label: '90d',   days: 90 },
  { label: 'All',   days: -1 },
] as const

function buildRange(days: number): { from: string; to: string } {
  const to = new Date()
  if (days === -1) return { from: '2020-01-01T00:00:00.000Z', to: to.toISOString() }
  if (days === 0) {
    const from = new Date()
    from.setHours(0, 0, 0, 0)
    return { from: from.toISOString(), to: to.toISOString() }
  }
  return { from: new Date(Date.now() - days * 86400000).toISOString(), to: to.toISOString() }
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

const FUNNEL_LABELS: Record<string, string> = {
  new_lead:              'New Lead',
  contacted:             'Contacted',
  engaged:               'Engaged',
  appointment_set:       'Appt Set',
  appointment_confirmed: 'Appt Confirmed',
  showed:                'Showed',
  sold:                  'Sold',
}

const SOURCE_LABELS: Record<string, string> = {
  cargurus:        'CarGurus',
  cargurus_digest: 'CarGurus Digest',
  autotrader:      'AutoTrader',
  offerup:         'OfferUp',
  facebook:        'Facebook',
  voice:           'Voice',
  manual:          'Manual',
  direct:          'Direct',
}

// ── CSV export ─────────────────────────────────────────────────────────────

function exportCsv(data: AnalyticsData) {
  const replyRate = data.sms.sent > 0
    ? `${Math.round((data.sms.replied / data.sms.sent) * 100)}%`
    : '—'

  const rows: string[][] = [
    ['Section', 'Metric', 'Value'],
    ['Leads', 'Total',              String(data.leads.total)],
    ['Leads', 'Avg Response (sec)', String(data.leads.avg_response_seconds ?? '')],
    ...Object.entries(data.leads.by_source).map(([k, v]) => ['Source', SOURCE_LABELS[k] ?? k, String(v)]),
    ...data.funnel.map(f => ['Funnel', FUNNEL_LABELS[f.state] ?? f.state, String(f.count)]),
    ['SMS', 'Sent',       String(data.sms.sent)],
    ['SMS', 'Replied',    String(data.sms.replied)],
    ['SMS', 'Reply Rate', replyRate],
    ['Voice', 'Total Calls',        String(data.voice.total)],
    ['Voice', 'Avg Duration (sec)', String(data.voice.avg_duration_seconds)],
    ['Voice', 'Est Cost ($)',        String(data.voice.estimated_cost)],
    ['Revenue', 'Units Sold', String(data.revenue.units_sold)],
    ['Revenue', 'Total ($)',  String(data.revenue.total)],
    ['BHPH', 'Collection Rate (%)', String(data.bhph.collection_rate_pct ?? '')],
    ['BHPH', 'Total Paid ($)',       String(data.bhph.total_paid)],
    ['BHPH', 'Total Loan ($)',       String(data.bhph.total_loan)],
  ]
  const csv = rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `apollo-analytics-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  // Issue #8: delay revoke to ensure browser initiates download before URL is invalidated
  setTimeout(() => URL.revokeObjectURL(url), 100)
}

// ── Main component ─────────────────────────────────────────────────────────

export default function AnalyticsDashboard() {
  const [preset, setPreset]   = useState<number>(30)
  const [data, setData]       = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  const load = useCallback((days: number) => {
    setLoading(true)
    setData(null)    // Issue #10: clear stale data immediately to avoid stale flash
    setError(null)
    const { from, to } = buildRange(days)
    fetch(`/api/analytics?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
      .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
      .then((d: AnalyticsData) => { setData(d); setLoading(false) })
      .catch((e: unknown) => { setError(String(e)); setLoading(false) })
  }, [])

  useEffect(() => { load(preset) }, [load, preset])

  const funnelMax = data?.funnel[0]?.count || 1

  return (
    <div className="px-4 py-4 space-y-6 pb-24">

      {/* Date range pills + CSV export */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 no-scrollbar">
        {PRESETS.map(p => (
          <button
            key={p.label}
            onClick={() => setPreset(p.days)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              preset === p.days
                ? 'bg-[#0D2B55] text-white'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            {p.label}
          </button>
        ))}
        {data && (
          <button
            onClick={() => exportCsv(data)}
            className="shrink-0 ml-auto flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold bg-muted text-muted-foreground hover:bg-muted/80"
          >
            <Download className="h-3 w-3" />
            CSV
          </button>
        )}
      </div>

      {loading && (
        <div className="flex justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          Failed to load analytics: {error}
        </div>
      )}

      {data && !loading && (
        <>
          {/* Leads by source */}
          <section>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Leads by Source
            </p>
            {Object.keys(data.leads.by_source).length === 0 ? (
              <p className="text-sm text-muted-foreground">No leads in this period.</p>
            ) : (
              <div className="space-y-2">
                {Object.entries(data.leads.by_source)
                  .sort(([, a], [, b]) => b - a)
                  .map(([src, count]) => (
                    <div key={src} className="rounded-lg border bg-card p-3">
                      <div className="flex justify-between items-center mb-1.5">
                        <span className="text-sm font-medium">{SOURCE_LABELS[src] ?? src}</span>
                        <span className="text-sm font-bold">{count}</span>
                      </div>
                      <CssBar pct={data.leads.total > 0 ? Math.round((count / data.leads.total) * 100) : 0} />
                    </div>
                  ))}
              </div>
            )}
          </section>

          {/* Conversion funnel */}
          <section>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Conversion Funnel
            </p>
            <div className="space-y-2">
              {data.funnel.map(({ state, count }) => (
                <div key={state} className="rounded-lg border bg-card p-3">
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-sm text-muted-foreground">{FUNNEL_LABELS[state] ?? state}</span>
                    <span className="text-sm font-bold">{count}</span>
                  </div>
                  <CssBar
                    pct={funnelMax > 0 ? Math.round((count / funnelMax) * 100) : 0}
                    color={state === 'sold' ? 'bg-green-500' : 'bg-primary'}
                  />
                </div>
              ))}
            </div>
          </section>

          {/* Response time */}
          <section>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Response Time
            </p>
            <div className="grid grid-cols-2 gap-3">
              <StatCard
                label="Avg Response"
                value={data.leads.avg_response_seconds != null
                  ? formatDuration(data.leads.avg_response_seconds)
                  : '—'}
                color={
                  data.leads.avg_response_seconds == null ? '' :
                  data.leads.avg_response_seconds < 300  ? 'text-green-600' :
                  data.leads.avg_response_seconds < 600  ? 'text-yellow-600' :
                  'text-destructive'
                }
              />
              <StatCard label="Leads Tracked" value={data.leads.total} sub="in period" />
            </div>
          </section>

          {/* SMS — Issue #4 + #12: 2-column layout, no misleading "Delivered", add Reply Rate */}
          <section>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">SMS</p>
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="Sent"       value={data.sms.sent} />
              <StatCard label="Replied"    value={data.sms.replied} color="text-primary" />
              <StatCard
                label="Reply Rate"
                value={data.sms.sent > 0
                  ? `${Math.round((data.sms.replied / data.sms.sent) * 100)}%`
                  : '—'}
                color={
                  data.sms.sent === 0 ? '' :
                  (data.sms.replied / data.sms.sent) >= 0.3 ? 'text-green-600' :
                  (data.sms.replied / data.sms.sent) >= 0.1 ? 'text-yellow-600' :
                  'text-muted-foreground'
                }
              />
            </div>
          </section>

          {/* Voice */}
          <section>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Voice Calls</p>
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="Total Calls"   value={data.voice.total} />
              <StatCard
                label="Avg Duration"
                value={data.voice.avg_duration_seconds
                  ? formatDuration(data.voice.avg_duration_seconds)
                  : '—'}
              />
              <StatCard label="Total Minutes" value={Math.round(data.voice.total_seconds / 60)} />
              <StatCard
                label="Est. Cost"
                value={`$${data.voice.estimated_cost.toFixed(2)}`}
                sub="@ $0.01/min"
                color="text-muted-foreground"
              />
            </div>
          </section>

          {/* Revenue */}
          <section>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Revenue</p>
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="Units Sold" value={data.revenue.units_sold} />
              <StatCard label="Revenue" value={formatCurrency(data.revenue.total)} color="text-green-600" />
            </div>
          </section>

          {/* BHPH — Issue #13: collection rate uses loan_amount only (not down_payment) */}
          <section>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              BHPH (All-Time)
            </p>
            <div className="grid grid-cols-2 gap-3">
              <StatCard
                label="Collection Rate"
                value={data.bhph.collection_rate_pct != null
                  ? `${data.bhph.collection_rate_pct}%`
                  : '—'}
                color={
                  data.bhph.collection_rate_pct == null ? '' :
                  data.bhph.collection_rate_pct >= 80   ? 'text-green-600' :
                  data.bhph.collection_rate_pct >= 60   ? 'text-yellow-600' :
                  'text-destructive'
                }
              />
              <StatCard
                label="Total Collected"
                value={formatCurrency(data.bhph.total_paid)}
                color="text-primary"
              />
            </div>
          </section>
        </>
      )}
    </div>
  )
}
