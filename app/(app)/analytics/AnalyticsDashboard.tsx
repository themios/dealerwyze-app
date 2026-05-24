'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, Download, Sparkles, Send } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import ReportsClient from './ReportsClient'

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

// ── Brand palette ──────────────────────────────────────────────────────────

const COLORS = ['#F07018', '#F5A623', '#3D9926', '#1B4A8A', '#FF5436', '#8B5CF6', '#0EA5E9']

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
  if (days === -1) {
    return { from: new Date(Date.now() - 365 * 86400000).toISOString(), to: to.toISOString() }
  }
  if (days === 0) {
    const from = new Date(); from.setHours(0, 0, 0, 0)
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

// ── Visual components ──────────────────────────────────────────────────────

/** Single-value ring gauge — percentage filled */
function RingGauge({
  pct, value, label, color, size = 120, strokeWidth = 10,
}: {
  pct: number; value: string; label: string; color: string; size?: number; strokeWidth?: number
}) {
  const r = (size - strokeWidth * 2) / 2
  const circ = 2 * Math.PI * r
  const filled = Math.min(Math.max(pct, 0), 100) / 100 * circ
  const cx = size / 2
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={cx} cy={cx} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={strokeWidth} />
          <circle
            cx={cx} cy={cx} r={r} fill="none"
            stroke={color} strokeWidth={strokeWidth}
            strokeDasharray={`${filled} ${circ - filled}`}
            strokeLinecap="round"
            style={{ transition: 'stroke-dasharray 0.8s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-black leading-none" style={{ fontSize: size * 0.2, fontFamily: "'Barlow Semi Condensed', sans-serif", color }}>
            {value}
          </span>
          <span className="text-[10px] text-muted-foreground mt-0.5">{label}</span>
        </div>
      </div>
    </div>
  )
}

/** Multi-segment donut — for leads by source */
function DonutChart({ segments, total }: {
  segments: Array<{ label: string; value: number; color: string }>
  total: number
}) {
  const r = 52, strokeWidth = 16, cx = 60
  const circ = 2 * Math.PI * r
  const gap = total > 1 ? 3 : 0

  // Pre-compute offsets so we don't mutate variables inside JSX
  const arcs = segments.map((seg) => (seg.value / total) * circ)
  const offsets = arcs.reduce<number[]>((acc, arc, i) => {
    acc.push(i === 0 ? 0 : acc[i - 1] - arcs[i - 1])
    return acc
  }, [])

  return (
    <div className="flex flex-col sm:flex-row gap-6 items-center">
      <div className="relative flex-shrink-0" style={{ width: 120, height: 120 }}>
        <svg width="120" height="120" className="-rotate-90">
          <circle cx={cx} cy={cx} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={strokeWidth} />
          {segments.map((seg, i) => {
            const arc = arcs[i] - gap
            if (arc <= 0) return null
            return (
              <circle
                key={i}
                cx={cx} cy={cx} r={r} fill="none"
                stroke={seg.color} strokeWidth={strokeWidth}
                strokeDasharray={`${arc} ${circ - arc}`}
                strokeDashoffset={offsets[i]}
                strokeLinecap="butt"
              />
            )
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-black leading-none" style={{ fontFamily: "'Barlow Semi Condensed', sans-serif" }}>{total}</span>
          <span className="text-[10px] text-muted-foreground">leads</span>
        </div>
      </div>

      <div className="flex flex-col gap-1.5 min-w-0">
        {segments.map((seg) => (
          <div key={seg.label} className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: seg.color }} />
            <span className="text-xs text-muted-foreground truncate">{seg.label}</span>
            <span className="text-xs font-semibold ml-auto pl-3">{seg.value}</span>
            <span className="text-[10px] text-muted-foreground w-8 text-right">
              {Math.round((seg.value / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Concentric rings — for conversion funnel */
function ConcentricFunnel({ funnel }: { funnel: Array<{ state: string; count: number }> }) {
  const stages = funnel.slice(0, 6)
  const total = stages[0]?.count || 1
  const size = 160
  const cx = 80
  const outerR = 70
  const ringGap = 11
  const strokeWidth = 8

  const stageColors = ['#F07018', '#F5A623', '#3D9926', '#1B4A8A', '#8B5CF6', '#10B981']

  return (
    <div className="flex flex-col sm:flex-row gap-6 items-center">
      <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          {stages.map((stage, i) => {
            const r = outerR - i * ringGap
            if (r <= 0) return null
            const circ = 2 * Math.PI * r
            const pct = stage.count / total
            const filled = pct * circ
            return (
              <g key={stage.state}>
                <circle cx={cx} cy={cx} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={strokeWidth} />
                <circle
                  cx={cx} cy={cx} r={r} fill="none"
                  stroke={stageColors[i]} strokeWidth={strokeWidth}
                  strokeDasharray={`${filled} ${circ - filled}`}
                  strokeLinecap="round"
                  style={{ transition: 'stroke-dasharray 0.8s ease' }}
                />
              </g>
            )
          })}
        </svg>
        {/* Center: sold count */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {(() => {
            const sold = funnel.find(f => f.state === 'sold')
            return sold ? (
              <>
                <span className="text-xl font-black leading-none text-green-500" style={{ fontFamily: "'Barlow Semi Condensed', sans-serif" }}>{sold.count}</span>
                <span className="text-[10px] text-muted-foreground">sold</span>
              </>
            ) : null
          })()}
        </div>
      </div>

      <div className="flex flex-col gap-1.5 min-w-0">
        {stages.map((stage, i) => {
          const pct = total > 0 ? Math.round((stage.count / total) * 100) : 0
          return (
            <div key={stage.state} className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: stageColors[i] }} />
              <span className="text-xs text-muted-foreground">{FUNNEL_LABELS[stage.state] ?? stage.state}</span>
              <span className="text-xs font-semibold ml-auto pl-3">{stage.count}</span>
              <span className="text-[10px] text-muted-foreground w-8 text-right">{pct}%</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Improved stat card */
function StatCard({ label, value, sub, color }: {
  label: string; value: string | number; sub?: string; color?: string
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">{label}</p>
      <p className="text-2xl font-black leading-none" style={{ fontFamily: "'Barlow Semi Condensed', sans-serif", color: color ?? 'inherit' }}>
        {value}
      </p>
      {sub && <p className="text-[10px] text-muted-foreground mt-1">{sub}</p>}
    </div>
  )
}

/** Section heading */
function SectionHead({ title }: { title: string }) {
  return (
    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">{title}</p>
  )
}

// ── Ask Box ────────────────────────────────────────────────────────────────

const SUGGESTIONS = [
  'Which leads have gone cold this week?',
  'What is my best lead source right now?',
  'How many appointments are set?',
  'What should I focus on today?',
]

const ASK_STORAGE_KEY = `dw_ask_remaining_${new Date().toDateString()}`

function AskBox() {
  const [question, setQuestion]   = useState('')
  const [answer, setAnswer]       = useState('')
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [remaining, setRemaining] = useState(10)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    fetch('/api/ask')
      .then(r => r.ok ? r.json() : null)
      .then((data: { remaining: number | null } | null) => {
        if (data?.remaining === 999) {
          persistRemaining(999)
        } else {
          const stored = localStorage.getItem(ASK_STORAGE_KEY)
          if (stored !== null) setRemaining(Number(stored))
        }
      })
      .catch(() => {
        const stored = localStorage.getItem(ASK_STORAGE_KEY)
        if (stored !== null) setRemaining(Number(stored))
      })
  }, [])

  function persistRemaining(n: number) {
    setRemaining(n)
    localStorage.setItem(ASK_STORAGE_KEY, String(n))
  }

  async function submit(q: string) {
    const trimmed = q.trim()
    if (!trimmed || loading) return
    setLoading(true)
    setAnswer('')
    setError(null)

    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: trimmed }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Request failed.' }))
        setError(data.error ?? 'Request failed.')
        return
      }

      const reader = res.body?.getReader()
      if (!reader) { setError('No response.'); return }

      const decoder = new TextDecoder()
      let full = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        full += decoder.decode(value, { stream: true })
        // Strip the trailing __REMAINING__ token before displaying
        const display = full.replace(/\n\n__REMAINING__:\d+$/, '')
        setAnswer(display)
      }

      const match = full.match(/__REMAINING__:(\d+)$/)
      if (match) persistRemaining(Number(match[1]))
    } catch {
      setError('Could not reach the server.')
    } finally {
      setLoading(false)
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit(question)
    }
  }

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="h-3.5 w-3.5 text-[#F07018]" />
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Ask your data</p>
        <span className="ml-auto text-[10px] text-muted-foreground">
          {remaining >= 999 ? 'Unlimited' : `${remaining} question${remaining !== 1 ? 's' : ''} left today`}
        </span>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        {/* Suggestions */}
        {!answer && !loading && (
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map(s => (
              <button
                key={s}
                onClick={() => { setQuestion(s); submit(s) }}
                className="px-2.5 py-1 rounded-full text-xs bg-muted text-muted-foreground hover:bg-muted/70 transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Input row */}
        <div className="flex gap-2 items-end">
          <textarea
            ref={textareaRef}
            rows={1}
            value={question}
            onChange={e => setQuestion(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Ask anything about your leads, pipeline, or activity…"
            className="flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-[#F07018] min-h-[38px] max-h-[120px]"
          />
          <button
            onClick={() => submit(question)}
            disabled={loading || !question.trim()}
            className="flex-shrink-0 rounded-lg bg-[#F07018] text-white px-3 py-2 disabled:opacity-40 hover:bg-[#d9631a] transition-colors"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>

        {/* Answer */}
        {(answer || error) && (
          <div className={`rounded-lg p-3 text-sm whitespace-pre-wrap leading-relaxed ${
            error
              ? 'bg-destructive/10 text-destructive border border-destructive/20'
              : 'bg-muted/40 text-foreground'
          }`}>
            {error ?? answer}
          </div>
        )}

        {loading && !answer && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            Analyzing your data…
          </div>
        )}
      </div>
    </section>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export default function AnalyticsDashboard() {
  const [activeTab, setActiveTab] = useState<'overview' | 'performance'>('overview')
  const [preset, setPreset]   = useState<number>(30)
  const [data, setData]       = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const { from, to } = buildRange(preset)

    fetch(`/api/analytics?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
      .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
      .then((d: AnalyticsData) => { if (!cancelled) { setData(d); setLoading(false) } })
      .catch((e: unknown) => { if (!cancelled) { setError(String(e)); setLoading(false) } })

    return () => { cancelled = true }
  }, [preset])

  const smsReplyPct  = data && data.sms.sent > 0 ? Math.round((data.sms.replied / data.sms.sent) * 100) : 0
  const smsColor     = smsReplyPct >= 30 ? '#3D9926' : smsReplyPct >= 10 ? '#F5A623' : '#FF5436'

  const bhphPct      = data?.bhph.collection_rate_pct ?? 0
  const bhphColor    = bhphPct >= 80 ? '#3D9926' : bhphPct >= 60 ? '#F5A623' : '#FF5436'

  const responseColor = data?.leads.avg_response_seconds == null ? '#8A8070'
    : data.leads.avg_response_seconds < 300  ? '#3D9926'
    : data.leads.avg_response_seconds < 600  ? '#F5A623'
    : '#FF5436'

  const sourceSegments = data
    ? Object.entries(data.leads.by_source)
        .sort(([, a], [, b]) => b - a)
        .map(([src, count], i) => ({
          label: SOURCE_LABELS[src] ?? src,
          value: count,
          color: COLORS[i % COLORS.length],
        }))
    : []

  return (
    <div className="pb-24 lg:pb-6">

      {/* Tab switcher */}
      <div className="flex gap-1 border-b px-4">
        {(['overview', 'performance'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors capitalize ${
              activeTab === tab
                ? 'border-[#F07018] text-[#F07018]'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab === 'overview' ? 'Overview' : 'Performance'}
          </button>
        ))}
      </div>

      {activeTab === 'performance' && <ReportsClient />}

      {activeTab === 'overview' && (
        <div className="px-4 py-4 space-y-8 lg:px-6">

          {/* Ask box — always visible at top */}
          <AskBox />

          {/* Date range pills + CSV */}
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 lg:mx-0 lg:px-0 no-scrollbar">
            {PRESETS.map(p => (
              <button
                key={p.label}
                onClick={() => { setLoading(true); setData(null); setError(null); setPreset(p.days) }}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                  preset === p.days
                    ? 'bg-[#F07018] text-white'
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
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              Failed to load analytics: {error}
            </div>
          )}

          {data && !loading && (
            <>
              {/* ── KPI headline row ─────────────────────────────────── */}
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatCard label="Total Leads"   value={data.leads.total} sub="in period" />
                <StatCard
                  label="Avg Response"
                  value={data.leads.avg_response_seconds != null ? formatDuration(data.leads.avg_response_seconds) : '—'}
                  color={responseColor}
                />
                <StatCard
                  label="Revenue"
                  value={formatCurrency(data.revenue.total)}
                  sub={`${data.revenue.units_sold} unit${data.revenue.units_sold !== 1 ? 's' : ''} sold`}
                  color="#3D9926"
                />
                <StatCard
                  label="BHPH Collection"
                  value={data.bhph.collection_rate_pct != null ? `${data.bhph.collection_rate_pct}%` : '—'}
                  sub={`${formatCurrency(data.bhph.total_paid)} collected`}
                  color={bhphColor}
                />
              </div>

              {/* ── Main 2-col grid ───────────────────────────────────── */}
              <div className="lg:grid lg:grid-cols-2 lg:gap-8 space-y-8 lg:space-y-0">

                {/* Left: Sources donut + Response ring */}
                <div className="space-y-8">
                  <section>
                    <SectionHead title="Leads by Source" />
                    {sourceSegments.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No leads in this period.</p>
                    ) : (
                      <div className="rounded-xl border border-border bg-card p-5">
                        <DonutChart segments={sourceSegments} total={data.leads.total} />
                      </div>
                    )}
                  </section>

                  {/* SMS */}
                  <section>
                    <SectionHead title="SMS" />
                    <div className="rounded-xl border border-border bg-card p-5">
                      <div className="flex items-center gap-8">
                        <RingGauge
                          pct={smsReplyPct}
                          value={`${smsReplyPct}%`}
                          label="reply rate"
                          color={smsColor}
                          size={110}
                          strokeWidth={10}
                        />
                        <div className="flex flex-col gap-3 flex-1">
                          <div>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Sent</p>
                            <p className="text-2xl font-black leading-none" style={{ fontFamily: "'Barlow Semi Condensed', sans-serif" }}>{data.sms.sent}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Replied</p>
                            <p className="text-2xl font-black leading-none" style={{ fontFamily: "'Barlow Semi Condensed', sans-serif", color: smsColor }}>{data.sms.replied}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </section>
                </div>

                {/* Right: Concentric funnel + Voice */}
                <div className="space-y-8">
                  <section>
                    <SectionHead title="Conversion Funnel" />
                    {data.funnel.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No funnel data in this period.</p>
                    ) : (
                      <div className="rounded-xl border border-border bg-card p-5">
                        <ConcentricFunnel funnel={data.funnel} />
                      </div>
                    )}
                  </section>

                  {/* Voice */}
                  <section>
                    <SectionHead title="Voice Calls" />
                    <div className="grid grid-cols-2 gap-3">
                      <StatCard label="Total Calls"   value={data.voice.total} />
                      <StatCard
                        label="Avg Duration"
                        value={data.voice.avg_duration_seconds ? formatDuration(data.voice.avg_duration_seconds) : '—'}
                      />
                      <StatCard label="Total Minutes" value={Math.round(data.voice.total_seconds / 60)} />
                      <StatCard
                        label="Est. Cost"
                        value={`$${data.voice.estimated_cost.toFixed(2)}`}
                        sub="@ $0.01/min"
                        color="var(--muted-foreground)"
                      />
                    </div>
                  </section>
                </div>
              </div>

              {/* ── BHPH ring — full width ────────────────────────────── */}
              {data.bhph.collection_rate_pct != null && (
                <section>
                  <SectionHead title="BHPH Portfolio" />
                  <div className="rounded-xl border border-border bg-card p-5">
                    <div className="flex items-center gap-10">
                      <RingGauge
                        pct={data.bhph.collection_rate_pct}
                        value={`${data.bhph.collection_rate_pct}%`}
                        label="collected"
                        color={bhphColor}
                        size={130}
                        strokeWidth={12}
                      />
                      <div className="flex flex-col gap-4">
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Total Collected</p>
                          <p className="text-2xl font-black leading-none" style={{ fontFamily: "'Barlow Semi Condensed', sans-serif", color: bhphColor }}>
                            {formatCurrency(data.bhph.total_paid)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Total Loan Book</p>
                          <p className="text-2xl font-black leading-none" style={{ fontFamily: "'Barlow Semi Condensed', sans-serif" }}>
                            {formatCurrency(data.bhph.total_loan)}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
