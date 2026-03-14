'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import TopBar from '@/components/layout/TopBar'
import {
  AlertCircle, CheckCircle2, ChevronRight, Clock,
  MessageSquare, TicketCheck, Mail, Search, ArrowUpDown,
  TrendingDown, Users, Briefcase, Filter,
} from 'lucide-react'

interface CustomerRow {
  id: string
  name: string
  plan: string
  subscription_status: string | null
  created_at: string
  last_active_at: string | null
  days_inactive: number
  score: number
  tier: 'healthy' | 'at_risk' | 'critical'
  signals: { label: string; delta: number; note: string }[]
  sms_used_pct: number
  has_active_email: boolean
  onboarding_done: boolean
  tickets_open: number
  affiliate_code: string | null
  salesperson_name: string | null
  salesperson_email: string | null
}

type SortKey = 'risk' | 'inactive' | 'usage' | 'tickets' | 'salesperson' | 'name'
type FilterTier = 'all' | 'critical' | 'at_risk' | 'healthy' | 'unassigned'

const SORT_LABELS: Record<SortKey, string> = {
  risk:        'Attrition Risk',
  inactive:    'Most Inactive',
  usage:       'Low Usage',
  tickets:     'Needs Help',
  salesperson: 'By Salesperson',
  name:        'Name A–Z',
}

function humanizeAgo(d: string | null) {
  if (!d) return 'Never'
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return '1d ago'
  if (days < 30)  return `${days}d ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}yr ago`
}

function TierBadge({ tier }: { tier: 'healthy' | 'at_risk' | 'critical' }) {
  const s = {
    healthy:  'bg-green-100 text-green-700 border-green-200',
    at_risk:  'bg-yellow-100 text-yellow-700 border-yellow-200',
    critical: 'bg-red-100 text-red-700 border-red-200',
  }
  const l = { healthy: 'Healthy', at_risk: 'At Risk', critical: 'Critical' }
  return <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold border ${s[tier]}`}>{l[tier]}</span>
}

function ScoreCircle({ score, tier }: { score: number; tier: string }) {
  const bg = tier === 'healthy'
    ? 'bg-green-100 text-green-700'
    : tier === 'at_risk'
    ? 'bg-yellow-100 text-yellow-700'
    : 'bg-red-100 text-red-700'
  return (
    <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 text-sm font-bold ${bg}`}>
      {score}
    </div>
  )
}

export default function AdminCustomersPage() {
  const [customers, setCustomers] = useState<CustomerRow[]>([])
  const [loading, setLoading]     = useState(true)
  const [sort, setSort]           = useState<SortKey>('risk')
  const [filter, setFilter]       = useState<FilterTier>('all')
  const [search, setSearch]       = useState('')
  const [expanded, setExpanded]   = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/admin/customers?sort=${sort}`)
      .then(r => r.json())
      .then((d: CustomerRow[]) => setCustomers(d ?? []))
      .finally(() => setLoading(false))
  }, [sort])  // re-fetch when sort changes (server-side sort)

  const filtered = useMemo(() => {
    let list = customers
    if (filter === 'critical')   list = list.filter(c => c.tier === 'critical')
    else if (filter === 'at_risk')    list = list.filter(c => c.tier === 'at_risk')
    else if (filter === 'healthy')    list = list.filter(c => c.tier === 'healthy')
    else if (filter === 'unassigned') list = list.filter(c => !c.affiliate_code)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(c =>
        c.name.toLowerCase().includes(q) ||
        (c.salesperson_name ?? '').toLowerCase().includes(q)
      )
    }
    return list
  }, [customers, filter, search])

  const counts = useMemo(() => ({
    total:      customers.length,
    critical:   customers.filter(c => c.tier === 'critical').length,
    at_risk:    customers.filter(c => c.tier === 'at_risk').length,
    healthy:    customers.filter(c => c.tier === 'healthy').length,
    unassigned: customers.filter(c => !c.affiliate_code).length,
    avgScore:   customers.length > 0
      ? Math.round(customers.reduce((s, c) => s + c.score, 0) / customers.length)
      : 0,
  }), [customers])

  return (
    <div>
      <TopBar title="All Customers" />
      <div className="px-4 py-4 lg:px-6 space-y-5">

        {/* KPI strip */}
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
          {[
            { label: 'Total',        value: counts.total,          color: '' },
            { label: 'Critical',     value: counts.critical,       color: counts.critical > 0 ? 'text-red-600' : '' },
            { label: 'At Risk',      value: counts.at_risk,        color: counts.at_risk > 0  ? 'text-yellow-600' : '' },
            { label: 'Healthy',      value: counts.healthy,        color: counts.healthy > 0  ? 'text-green-600' : '' },
            { label: 'Unassigned',   value: counts.unassigned,     color: counts.unassigned > 0 ? 'text-orange-500' : '' },
            { label: 'Avg Score',    value: counts.avgScore,       color: counts.avgScore < 50 ? 'text-red-600' : counts.avgScore >= 65 ? 'text-green-600' : 'text-yellow-600' },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-xl border bg-card p-4">
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* Controls */}
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Tier filter */}
          <div className="flex rounded-lg border bg-card overflow-hidden shrink-0">
            <Filter className="h-3.5 w-3.5 text-muted-foreground self-center ml-2.5" />
            {(['all', 'critical', 'at_risk', 'healthy', 'unassigned'] as const).map(t => (
              <button
                key={t}
                onClick={() => setFilter(t)}
                className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  filter === t ? 'bg-[#0D2B55] text-white' : 'text-muted-foreground hover:bg-accent'
                }`}
              >
                {t === 'all' ? `All (${counts.total})` :
                 t === 'critical' ? `🔴 ${counts.critical}` :
                 t === 'at_risk'  ? `🟡 ${counts.at_risk}` :
                 t === 'healthy'  ? `🟢 ${counts.healthy}` :
                 `No Rep (${counts.unassigned})`}
              </button>
            ))}
          </div>

          {/* Sort */}
          <div className="flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 shrink-0">
            <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
            <select
              value={sort}
              onChange={e => setSort(e.target.value as SortKey)}
              className="text-xs bg-transparent border-none outline-none"
            >
              {(Object.entries(SORT_LABELS) as [SortKey, string][]).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search dealers or salespeople…"
              className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg border bg-card"
            />
          </div>
        </div>

        {/* Table header — desktop */}
        <div className="hidden lg:grid grid-cols-[40px_1fr_100px_100px_80px_80px_80px_80px] gap-3 px-4 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide border-b">
          <span></span>
          <span>Dealer</span>
          <span>Rep</span>
          <span>Last Active</span>
          <span>SMS</span>
          <span>Email</span>
          <span>Tickets</span>
          <span></span>
        </div>

        {/* Customer list */}
        {loading ? (
          <p className="text-sm text-muted-foreground text-center py-8">Loading customers…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No customers match this filter.</p>
        ) : (
          <div className="space-y-1.5">
            {filtered.map(c => (
              <div key={c.id} className="rounded-xl border bg-card overflow-hidden">

                {/* Mobile card / Desktop row */}
                <button
                  onClick={() => setExpanded(e => e === c.id ? null : c.id)}
                  className="w-full text-left"
                >
                  {/* Mobile layout */}
                  <div className="lg:hidden flex items-center gap-3 p-4">
                    <ScoreCircle score={c.score} tier={c.tier} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm truncate">{c.name}</span>
                        <TierBadge tier={c.tier} />
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
                        {c.salesperson_name && (
                          <span className="flex items-center gap-1 text-[10px]">
                            <Briefcase className="h-3 w-3" />{c.salesperson_name}
                          </span>
                        )}
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{humanizeAgo(c.last_active_at)}</span>
                        {c.tickets_open > 0 && (
                          <span className="flex items-center gap-0.5 text-orange-500">
                            <TicketCheck className="h-3 w-3" />{c.tickets_open}
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform shrink-0 ${expanded === c.id ? 'rotate-90' : ''}`} />
                  </div>

                  {/* Desktop row */}
                  <div className="hidden lg:grid grid-cols-[40px_1fr_100px_100px_80px_80px_80px_80px] gap-3 items-center px-4 py-3">
                    <ScoreCircle score={c.score} tier={c.tier} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm truncate">{c.name}</span>
                        <TierBadge tier={c.tier} />
                      </div>
                      <span className="text-[10px] text-muted-foreground uppercase">{c.plan}</span>
                    </div>
                    <span className="text-xs text-muted-foreground truncate">
                      {c.salesperson_name ?? <span className="text-orange-400 italic">Unassigned</span>}
                    </span>
                    <span className={`text-xs ${c.days_inactive > 30 ? 'text-red-500 font-medium' : c.days_inactive > 14 ? 'text-yellow-500' : 'text-muted-foreground'}`}>
                      {humanizeAgo(c.last_active_at)}
                    </span>
                    <div className="flex items-center gap-1">
                      <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${c.sms_used_pct === 0 ? 'bg-red-400' : c.sms_used_pct >= 30 ? 'bg-green-500' : 'bg-yellow-400'}`} style={{ width: `${Math.min(100, c.sms_used_pct)}%` }} />
                      </div>
                      <span className="text-[10px] text-muted-foreground">{c.sms_used_pct}%</span>
                    </div>
                    <span>
                      {c.has_active_email
                        ? <CheckCircle2 className="h-4 w-4 text-green-500" />
                        : <Mail className="h-4 w-4 text-yellow-400" />}
                    </span>
                    <span className={`text-xs font-medium ${c.tickets_open > 0 ? 'text-orange-500' : 'text-muted-foreground'}`}>
                      {c.tickets_open > 0 ? `${c.tickets_open} open` : '—'}
                    </span>
                    <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${expanded === c.id ? 'rotate-90' : ''}`} />
                  </div>
                </button>

                {/* Expanded detail */}
                {expanded === c.id && (
                  <div className="border-t px-4 pb-4 pt-3">
                    {/* Negative signals */}
                    <div className="space-y-1.5 mb-4">
                      {c.signals.filter(s => s.delta < 0).length === 0 ? (
                        <div className="flex items-center gap-2 text-xs text-green-600">
                          <CheckCircle2 className="h-3.5 w-3.5" /> No risk signals — customer looks healthy
                        </div>
                      ) : (
                        c.signals.filter(s => s.delta < 0).map((s, i) => (
                          <div key={i} className="flex items-start gap-2 text-xs">
                            <AlertCircle className="h-3.5 w-3.5 text-red-500 mt-0.5 shrink-0" />
                            <span className="font-medium">{s.label}</span>
                            <span className="text-muted-foreground ml-auto">{s.note}</span>
                          </div>
                        ))
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2 items-center">
                      <Link href={`/admin/orgs/${c.id}`}
                        className="px-3 py-1.5 rounded-lg bg-[#0D2B55] text-white text-xs font-medium hover:bg-[#1a4480] transition-colors">
                        View Dealership
                      </Link>
                      <Link href={`/admin/orgs/${c.id}#notes`}
                        className="px-3 py-1.5 rounded-lg border bg-card text-xs font-medium hover:bg-accent transition-colors">
                        Add Note
                      </Link>
                      {c.tickets_open > 0 && (
                        <Link href={`/admin/tickets?org=${c.id}`}
                          className="px-3 py-1.5 rounded-lg border border-orange-200 bg-orange-50 text-orange-700 text-xs font-medium">
                          {c.tickets_open} Open Ticket{c.tickets_open !== 1 ? 's' : ''}
                        </Link>
                      )}
                      {c.salesperson_name && (
                        <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
                          <Briefcase className="h-3.5 w-3.5" />
                          {c.salesperson_name}
                          {c.affiliate_code && (
                            <Link href={`/admin/sales/${encodeURIComponent(c.affiliate_code)}`}
                              className="text-primary hover:underline ml-1">
                              view portfolio →
                            </Link>
                          )}
                        </span>
                      )}
                      {!c.salesperson_name && (
                        <span className="ml-auto flex items-center gap-1 text-xs text-orange-500">
                          <Users className="h-3.5 w-3.5" /> Unassigned — no salesperson
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Legend */}
        {!loading && filtered.length > 0 && (
          <div className="rounded-xl border bg-card p-4">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Risk Score Guide</p>
            <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-full bg-green-500 inline-block" /> 65–100 Healthy</span>
              <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-full bg-yellow-500 inline-block" /> 35–64 At Risk — outreach in 7 days</span>
              <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-full bg-red-500 inline-block" /> 0–34 Critical — act now</span>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
