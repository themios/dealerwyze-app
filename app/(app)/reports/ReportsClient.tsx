'use client'

import { useState, useCallback, useRef } from 'react'
import { LEAD_STATE_CONFIG } from '@/lib/leads/states'
import { ChevronRight, ChevronLeft, Sparkles, Download, RefreshCw } from 'lucide-react'
import { formatPhone } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

interface OverviewStats {
  period: { from: string; to: string }
  totals: {
    activities: number; inbound: number; outbound: number
    autoresponder: number; manualOutbound: number
    uniqueLeads: number; responded: number; newCustomers: number
  }
  responseRate: number
  avgResponseTimeSeconds: number | null
  byType: Record<string, number>
  bySource: Record<string, number>
  byStage: Record<string, number>
  callOutcomes: Record<string, number>
  hotLeads: number
  repSummary: Record<string, { name: string; outbound: number; inbound: number }>
}

interface RepStats {
  id: string; name: string; role: string
  outbound: number; inbound: number; autoresponder: number
  calls: number; sms: number; emails: number; notes: number
  answered: number; noAnswer: number; leftVm: number
  uniqueCustomers: number; assignedTotal: number
  avgResponseTimeSeconds: number | null
}

interface VehicleStats {
  id: string; year: number; make: string; model: string; trim?: string
  stock_no: string; price?: number; status: string
  inquiries: number; uniqueCustomers: number; outbound: number
}

interface CustomerActivity {
  customer: {
    id: string; name: string; primary_phone: string; email?: string
    lead_source?: string; thread_state?: string; lead_rating?: string
    response_time_seconds?: number; first_response_at?: string; created_at: string
  }
  activities: Array<{
    id: string; type: string; direction?: string | null; outcome?: string | null
    body?: string; created_at: string; created_by?: string | null
    customer_sequence_id?: string | null
  }>
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const PERIODS = [
  { label: '7d',  days: 7  },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
]

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86400000).toISOString().split('T')[0]
}

function today(): string {
  return new Date().toISOString().split('T')[0]
}

function fmtTime(s: number | null | undefined): string {
  if (!s) return '—'
  if (s < 60) return `${Math.round(s)}s`
  if (s < 3600) return `${Math.round(s / 60)}m`
  return `${(s / 3600).toFixed(1)}h`
}

function fmtPct(r: number): string { return `${(r * 100).toFixed(0)}%` }

function timeAgo(iso: string): string {
  const diff  = Date.now() - new Date(iso).getTime()
  const mins  = Math.floor(diff / 60000)
  const hours = Math.floor(mins / 60)
  const days  = Math.floor(hours / 24)
  if (mins < 1)   return 'just now'
  if (mins < 60)  return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7)   return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function responseRateColor(rate: number): string {
  if (rate >= 0.8) return 'text-green-600'
  if (rate >= 0.5) return 'text-yellow-600'
  return 'text-red-600'
}

function responseTimeColor(s: number | null | undefined): string {
  if (!s) return 'text-muted-foreground'
  if (s < 900)   return 'text-green-600'   // <15 min
  if (s < 3600)  return 'text-yellow-600'  // <1 hr
  return 'text-red-600'
}

function activityTypeLabel(type: string): string {
  const map: Record<string, string> = {
    call: 'Call', sms: 'SMS', email: 'Email', note: 'Note', task: 'Task',
    appointment: 'Appt', web_lead: 'Web Lead', email_followup: 'Email Follow-up',
    sms_followup: 'SMS Follow-up',
  }
  return map[type] ?? type
}

function directionBadge(direction?: string | null, isAuto?: boolean): React.ReactNode {
  if (isAuto) return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">Auto</span>
  if (direction === 'inbound')  return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">In</span>
  if (direction === 'outbound') return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">Out</span>
  return null
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="bg-card border rounded-xl p-3 flex flex-col gap-0.5">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${color ?? ''}`}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  )
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 border-l-2 border-[#F07018] pl-2">{children}</h2>
}

// ── AI Brief panel ────────────────────────────────────────────────────────────

function AiBriefPanel({ stats, reps, period }: {
  stats: OverviewStats
  reps: RepStats[]
  period: { from: string; to: string }
}) {
  const [brief, setBrief]   = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState('')
  const abortRef = useRef<AbortController | null>(null)

  async function generate() {
    if (loading) return
    setLoading(true)
    setBrief('')
    setError('')
    abortRef.current?.abort()
    abortRef.current = new AbortController()

    try {
      const res = await fetch('/api/reports/ai-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stats, reps, period }),
        signal: abortRef.current.signal,
      })
      if (!res.ok) { setError('AI unavailable — try again.'); return }

      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      if (!reader) return
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        setBrief(prev => prev + decoder.decode(value))
      }
    } catch {
      if (!abortRef.current?.signal.aborted) setError('Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="border rounded-xl bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b bg-gradient-to-r from-[#0D2B55]/5 to-transparent">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[#F07018]" />
          <span className="text-sm font-semibold">AI Performance Brief</span>
        </div>
        <button
          onClick={generate}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-[#0D2B55] text-white hover:bg-[#1B4A8A] disabled:opacity-50 transition-colors"
        >
          {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          {brief ? 'Regenerate' : 'Generate Insights'}
        </button>
      </div>

      {error && <p className="px-4 py-3 text-sm text-red-600">{error}</p>}

      {!brief && !loading && !error && (
        <p className="px-4 py-6 text-sm text-muted-foreground text-center">
          Click &quot;Generate Insights&quot; to get an AI-powered performance analysis with specific recommendations.
        </p>
      )}

      {(brief || loading) && (
        <div className="px-4 py-4 prose prose-sm max-w-none text-sm leading-relaxed whitespace-pre-wrap">
          {brief}
          {loading && <span className="inline-block w-1.5 h-4 bg-[#F07018] ml-0.5 animate-pulse rounded-sm" />}
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

type DrillView =
  | { type: 'overview' }
  | { type: 'rep'; repId: string }
  | { type: 'vehicle'; vehicleId: string }
  | { type: 'customer'; customerId: string; backLabel: string }

export default function ReportsClient() {
  const [activePeriod, setActivePeriod] = useState(1) // 30d default
  const [from, setFrom] = useState(daysAgo(30))
  const [to,   setTo]   = useState(today())
  const [customFrom, setCustomFrom] = useState('')
  const [customTo,   setCustomTo]   = useState('')
  const [isCustom,   setIsCustom]   = useState(false)
  const [activeTab,  setActiveTab]  = useState<'overview' | 'reps' | 'vehicles'>('overview')
  const [drillView,  setDrillView]  = useState<DrillView>({ type: 'overview' })

  const [overview,     setOverview]     = useState<OverviewStats | null>(null)
  const [reps,         setReps]         = useState<RepStats[] | null>(null)
  const [vehicles,     setVehicles]     = useState<VehicleStats[] | null>(null)
  const [customerData, setCustomerData] = useState<CustomerActivity | null>(null)
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState('')

  async function doFetch(section: string, f: string, t: string, params: Record<string, string> = {}) {
    setLoading(true)
    setError('')
    try {
      const qp = new URLSearchParams({ section, from: f, to: t, ...params })
      const res = await fetch(`/api/reports?${qp}`)
      if (!res.ok) { setError('Failed to load data'); return null }
      return await res.json()
    } catch {
      setError('Network error')
      return null
    } finally {
      setLoading(false)
    }
  }

  // Convenience wrapper using current state dates
  const fetchData = useCallback(
    (section: string, params: Record<string, string> = {}) => doFetch(section, from, to, params),
    [from, to] // eslint-disable-line react-hooks/exhaustive-deps
  )

  async function loadTabWithDates(tab: typeof activeTab, f: string, t: string) {
    setActiveTab(tab)
    setDrillView({ type: 'overview' })
    if (tab === 'overview') {
      const data = await doFetch('overview', f, t)
      if (data) setOverview(data)
    }
    if (tab === 'reps') {
      const data = await doFetch('reps', f, t)
      if (data) setReps(data.reps)
    }
    if (tab === 'vehicles') {
      const data = await doFetch('vehicles', f, t)
      if (data) setVehicles(data.vehicles)
    }
  }

  function selectPeriod(idx: number) {
    setActivePeriod(idx)
    setIsCustom(false)
    const days = PERIODS[idx].days
    const f = daysAgo(days)
    const t = today()
    setFrom(f)
    setTo(t)
    setOverview(null)
    setReps(null)
    setVehicles(null)
    loadTabWithDates(activeTab, f, t)
  }

  function applyCustom() {
    if (!customFrom || !customTo) return
    setIsCustom(true)
    setActivePeriod(-1)
    setFrom(customFrom)
    setTo(customTo)
    setOverview(null)
    setReps(null)
    setVehicles(null)
    loadTabWithDates(activeTab, customFrom, customTo)
  }

  async function loadTab(tab: typeof activeTab) {
    setActiveTab(tab)
    setDrillView({ type: 'overview' })
    if (tab === 'overview' && !overview) {
      const data = await fetchData('overview')
      if (data) setOverview(data)
    }
    if (tab === 'reps' && !reps) {
      const data = await fetchData('reps')
      if (data) setReps(data.reps)
    }
    if (tab === 'vehicles' && !vehicles) {
      const data = await fetchData('vehicles')
      if (data) setVehicles(data.vehicles)
    }
  }

  async function drillToCustomer(customerId: string, backLabel: string) {
    setDrillView({ type: 'customer', customerId, backLabel })
    const data = await fetchData('customer', { id: customerId })
    if (data) setCustomerData(data)
  }

  // Auto-load overview on first render
  const initialized = useRef(false)
  if (!initialized.current) {
    initialized.current = true
    setTimeout(() => loadTab('overview'), 0)
  }

  function exportCsv(rows: Record<string, unknown>[], filename: string) {
    if (!rows.length) return
    const keys = Object.keys(rows[0])
    const csv  = [keys.join(','), ...rows.map(r => keys.map(k => JSON.stringify(r[k] ?? '')).join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
  }

  // ── Customer drill-down ────────────────────────────────────────────────────

  if (drillView.type === 'customer') {
    const cd = customerData
    return (
      <div className="px-4 py-4 space-y-4">
        <button
          onClick={() => setDrillView({ type: 'overview' })}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" /> {drillView.backLabel}
        </button>
        {loading && <p className="text-sm text-muted-foreground">Loading...</p>}
        {cd && (
          <>
            <div className="bg-card border rounded-xl p-4 space-y-1">
              <p className="font-semibold text-base">{cd.customer.name}</p>
              {cd.customer.primary_phone && <p className="text-sm text-muted-foreground">{formatPhone(cd.customer.primary_phone)}</p>}
              {cd.customer.email && <p className="text-sm text-muted-foreground">{cd.customer.email}</p>}
              <div className="flex flex-wrap gap-2 pt-1">
                {cd.customer.lead_source && (
                  <span className="text-[10px] bg-muted px-2 py-0.5 rounded-full">{cd.customer.lead_source}</span>
                )}
                {cd.customer.thread_state && (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${LEAD_STATE_CONFIG[cd.customer.thread_state as keyof typeof LEAD_STATE_CONFIG]?.color ?? 'bg-muted'}`}>
                    {LEAD_STATE_CONFIG[cd.customer.thread_state as keyof typeof LEAD_STATE_CONFIG]?.label ?? cd.customer.thread_state}
                  </span>
                )}
                {cd.customer.lead_rating === 'hot' && (
                  <span className="text-[10px] bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">Hot Lead</span>
                )}
                {cd.customer.response_time_seconds && (
                  <span className="text-[10px] bg-muted px-2 py-0.5 rounded-full">
                    First response: {fmtTime(cd.customer.response_time_seconds)}
                  </span>
                )}
              </div>
            </div>

            <SectionTitle>Activity Thread ({cd.activities.length})</SectionTitle>
            <div className="space-y-2">
              {cd.activities.map(a => (
                <div key={a.id} className="border rounded-lg p-3 bg-card space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium">{activityTypeLabel(a.type)}</span>
                    {directionBadge(a.direction, !!a.customer_sequence_id)}
                    {a.outcome && a.outcome !== 'pending' && (
                      <span className="text-[10px] text-muted-foreground">{a.outcome.replace('_', ' ')}</span>
                    )}
                    <span className="text-[10px] text-muted-foreground ml-auto">{timeAgo(a.created_at)}</span>
                  </div>
                  {a.body && (
                    <p className="text-xs text-muted-foreground line-clamp-4 whitespace-pre-line">{a.body}</p>
                  )}
                </div>
              ))}
              {cd.activities.length === 0 && (
                <p className="text-sm text-muted-foreground">No activities recorded.</p>
              )}
            </div>
          </>
        )}
      </div>
    )
  }

  // ── Main view ──────────────────────────────────────────────────────────────

  return (
    <div className="px-4 py-4 space-y-5">

      {/* Date range controls */}
      <div className="flex flex-wrap items-center gap-2">
        {PERIODS.map((p, i) => (
          <button
            key={p.label}
            onClick={() => selectPeriod(i)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              activePeriod === i && !isCustom
                ? 'bg-[#0D2B55] text-white'
                : 'bg-muted text-muted-foreground hover:bg-accent'
            }`}
          >
            {p.label}
          </button>
        ))}
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={customFrom}
            onChange={e => setCustomFrom(e.target.value)}
            className="h-8 px-2 text-xs border rounded-lg bg-background"
          />
          <span className="text-xs text-muted-foreground">to</span>
          <input
            type="date"
            value={customTo}
            onChange={e => setCustomTo(e.target.value)}
            className="h-8 px-2 text-xs border rounded-lg bg-background"
          />
          <button
            onClick={applyCustom}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              isCustom ? 'bg-[#0D2B55] text-white' : 'bg-muted text-muted-foreground hover:bg-accent'
            }`}
          >
            Apply
          </button>
        </div>
      </div>

      {/* Section tabs */}
      <div className="flex gap-1 border-b">
        {(['overview', 'reps', 'vehicles'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => loadTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors capitalize ${
              activeTab === tab
                ? 'border-[#F07018] text-[#F07018]'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab === 'reps' ? 'By Rep' : tab === 'vehicles' ? 'By Vehicle' : 'Overview'}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {loading && <p className="text-sm text-muted-foreground animate-pulse">Loading...</p>}

      {/* ── Overview tab ───────────────────────────────────────────────────── */}
      {activeTab === 'overview' && overview && (
        <div className="space-y-6">

          {/* Key metrics */}
          <div>
            <SectionTitle>Key Metrics</SectionTitle>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatCard
                label="Response Rate"
                value={fmtPct(overview.responseRate)}
                sub="target: >80%"
                color={responseRateColor(overview.responseRate)}
              />
              <StatCard
                label="Avg Response Time"
                value={fmtTime(overview.avgResponseTimeSeconds)}
                sub="target: <15 min"
                color={responseTimeColor(overview.avgResponseTimeSeconds)}
              />
              <StatCard label="Inbound Leads" value={overview.totals.inbound} sub={`${overview.totals.uniqueLeads} unique customers`} />
              <StatCard label="Outbound Contacts" value={overview.totals.outbound} sub={`${overview.totals.manualOutbound} manual · ${overview.totals.autoresponder} auto`} />
              <StatCard label="New Customers" value={overview.totals.newCustomers} />
              <StatCard label="Hot Leads" value={overview.hotLeads} color={overview.hotLeads > 0 ? 'text-orange-500' : undefined} />
              <StatCard label="Responded" value={overview.totals.responded} sub={`of ${overview.totals.uniqueLeads} leads`} />
              <StatCard label="Total Activities" value={overview.totals.activities} />
            </div>
          </div>

          {/* Activity breakdown */}
          <div>
            <SectionTitle>Activity by Type</SectionTitle>
            <div className="border rounded-xl overflow-hidden bg-card">
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-muted/40">
                  <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Type</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">Count</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">Share</th>
                </tr></thead>
                <tbody>
                  {Object.entries(overview.byType)
                    .sort((a, b) => b[1] - a[1])
                    .map(([type, count]) => (
                      <tr key={type} className="border-b last:border-0">
                        <td className="px-4 py-2.5">{activityTypeLabel(type)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-medium">{count}</td>
                        <td className="px-4 py-2.5 text-right text-muted-foreground">
                          {fmtPct(count / overview.totals.activities)}
                        </td>
                      </tr>
                    ))
                  }
                </tbody>
              </table>
            </div>
          </div>

          {/* Call outcomes */}
          {Object.keys(overview.callOutcomes).length > 0 && (
            <div>
              <SectionTitle>Call Outcomes</SectionTitle>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {Object.entries(overview.callOutcomes).map(([outcome, count]) => (
                  <StatCard
                    key={outcome}
                    label={outcome.replace(/_/g, ' ')}
                    value={count}
                    color={outcome === 'answered' ? 'text-green-600' : outcome === 'no_answer' ? 'text-red-500' : undefined}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Lead sources */}
          {Object.keys(overview.bySource).length > 0 && (
            <div>
              <SectionTitle>Lead Sources</SectionTitle>
              <div className="border rounded-xl overflow-hidden bg-card">
                <table className="w-full text-sm">
                  <thead><tr className="border-b bg-muted/40">
                    <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Source</th>
                    <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">Leads</th>
                    <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">Share</th>
                  </tr></thead>
                  <tbody>
                    {Object.entries(overview.bySource)
                      .sort((a, b) => b[1] - a[1])
                      .map(([source, count]) => {
                        const total = Object.values(overview.bySource).reduce((a, b) => a + b, 0)
                        return (
                          <tr key={source} className="border-b last:border-0">
                            <td className="px-4 py-2.5">{source}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums font-medium">{count}</td>
                            <td className="px-4 py-2.5 text-right text-muted-foreground">{fmtPct(count / total)}</td>
                          </tr>
                        )
                      })
                    }
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Pipeline funnel */}
          <div>
            <SectionTitle>Pipeline (All Time)</SectionTitle>
            <div className="border rounded-xl overflow-hidden bg-card">
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-muted/40">
                  <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Stage</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">Customers</th>
                </tr></thead>
                <tbody>
                  {Object.entries(overview.byStage)
                    .sort((a, b) => b[1] - a[1])
                    .map(([stage, count]) => {
                      const cfg = LEAD_STATE_CONFIG[stage as keyof typeof LEAD_STATE_CONFIG]
                      return (
                        <tr key={stage} className="border-b last:border-0">
                          <td className="px-4 py-2.5">
                            {cfg
                              ? <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${cfg.color}`}>{cfg.label}</span>
                              : stage
                            }
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums font-medium">{count}</td>
                        </tr>
                      )
                    })
                  }
                </tbody>
              </table>
            </div>
          </div>

          {/* AI Brief */}
          <AiBriefPanel stats={overview} reps={reps ?? []} period={{ from, to }} />
        </div>
      )}

      {/* ── Reps tab ────────────────────────────────────────────────────────── */}
      {activeTab === 'reps' && reps && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <SectionTitle>Rep Performance</SectionTitle>
            <button
              onClick={() => exportCsv(reps as unknown as Record<string, unknown>[], `reps-${from}-${to}.csv`)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <Download className="h-3.5 w-3.5" /> CSV
            </button>
          </div>

          {/* Desktop table */}
          <div className="border rounded-xl overflow-x-auto bg-card hidden md:block">
            <table className="w-full text-sm whitespace-nowrap">
              <thead><tr className="border-b bg-muted/40">
                {['Rep', 'Assigned', 'Outbound', 'Calls', 'Answered', 'Voicemail', 'SMS', 'Email', 'Avg Response', 'Auto'].map(h => (
                  <th key={h} className="px-3 py-2 text-xs font-medium text-muted-foreground text-right first:text-left">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {reps.sort((a, b) => b.outbound - a.outbound).map(rep => (
                  <tr key={rep.id} className="border-b last:border-0 hover:bg-accent/40 transition-colors">
                    <td className="px-3 py-2.5 font-medium">{rep.name}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{rep.assignedTotal}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{rep.outbound}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{rep.calls}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-green-600">{rep.answered}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-yellow-600">{rep.leftVm}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{rep.sms}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{rep.emails}</td>
                    <td className={`px-3 py-2.5 text-right tabular-nums ${responseTimeColor(rep.avgResponseTimeSeconds)}`}>
                      {fmtTime(rep.avgResponseTimeSeconds)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-purple-600">{rep.autoresponder}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {reps.sort((a, b) => b.outbound - a.outbound).map(rep => (
              <div key={rep.id} className="border rounded-xl p-4 bg-card space-y-3">
                <p className="font-semibold">{rep.name}</p>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div><p className="text-muted-foreground">Outbound</p><p className="font-semibold">{rep.outbound}</p></div>
                  <div><p className="text-muted-foreground">Calls</p><p className="font-semibold">{rep.calls}</p></div>
                  <div><p className="text-muted-foreground">Avg Response</p><p className={`font-semibold ${responseTimeColor(rep.avgResponseTimeSeconds)}`}>{fmtTime(rep.avgResponseTimeSeconds)}</p></div>
                  <div><p className="text-muted-foreground">Answered</p><p className="font-semibold text-green-600">{rep.answered}</p></div>
                  <div><p className="text-muted-foreground">SMS</p><p className="font-semibold">{rep.sms}</p></div>
                  <div><p className="text-muted-foreground">Auto</p><p className="font-semibold text-purple-600">{rep.autoresponder}</p></div>
                </div>
              </div>
            ))}
          </div>

          {/* AI Brief (reps context) */}
          {overview && (
            <AiBriefPanel stats={overview} reps={reps} period={{ from, to }} />
          )}
        </div>
      )}

      {/* ── Vehicles tab ─────────────────────────────────────────────────────── */}
      {activeTab === 'vehicles' && vehicles && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <SectionTitle>Vehicle Activity</SectionTitle>
            <button
              onClick={() => exportCsv(vehicles as unknown as Record<string, unknown>[], `vehicles-${from}-${to}.csv`)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <Download className="h-3.5 w-3.5" /> CSV
            </button>
          </div>

          <div className="border rounded-xl overflow-x-auto bg-card">
            <table className="w-full text-sm whitespace-nowrap">
              <thead><tr className="border-b bg-muted/40">
                <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Vehicle</th>
                <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Stock</th>
                <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Price</th>
                <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Inquiries</th>
                <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Customers</th>
                <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Outbound</th>
                <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Status</th>
              </tr></thead>
              <tbody>
                {vehicles.map(v => (
                  <tr key={v.id} className="border-b last:border-0 hover:bg-accent/40 transition-colors cursor-pointer"
                    onClick={() => drillToCustomer(v.id, `${v.year} ${v.make} ${v.model}`)}>
                    <td className="px-3 py-2.5 font-medium">
                      <span className="flex items-center gap-1">
                        {v.year} {v.make} {v.model}{v.trim ? ` ${v.trim}` : ''}
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right text-muted-foreground">{v.stock_no}</td>
                    <td className="px-3 py-2.5 text-right">{v.price ? `$${v.price.toLocaleString()}` : '—'}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{v.inquiries}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{v.uniqueCustomers}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{v.outbound}</td>
                    <td className="px-3 py-2.5 text-right">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                        v.status === 'sold'    ? 'bg-green-100 text-green-700' :
                        v.status === 'available' ? 'bg-blue-100 text-blue-700' :
                        'bg-muted text-muted-foreground'
                      }`}>{v.status}</span>
                    </td>
                  </tr>
                ))}
                {vehicles.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-6 text-center text-sm text-muted-foreground">No vehicle activity in this period</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
