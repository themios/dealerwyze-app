'use client'

import { useEffect, useState, useMemo } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import TopBar from '@/components/layout/TopBar'
import {
  ArrowLeft, Mail, AlertCircle, CheckCircle2, ChevronRight,
  Clock, MessageSquare, TicketCheck, Shield, DollarSign,
  TrendingDown, ArrowUpDown,
} from 'lucide-react'

interface CustomerOrg {
  id: string
  name: string
  plan: string
  subscription_status: string | null
  created_at: string
  last_active_at: string | null
  score: number
  tier: 'healthy' | 'at_risk' | 'critical'
  signals: { label: string; delta: number; note: string }[]
  sms_used_pct: number
  has_active_email: boolean
  onboarding_done: boolean
  tickets_open: number
}

interface CommEvent {
  id: string
  event_type: string
  amount: number
  status: string
  billing_period: string | null
  created_at: string
  org_id: string
}

interface SalespersonDetail {
  code: string
  type: string
  owner_name: string
  owner_email: string | null
  is_active: boolean
  notes: string | null
  commission_first_pct: number
  commission_recurring_pct: number
  commission_pending: number
  commission_paid: number
  created_at: string
}

type SortKey = 'risk' | 'inactive' | 'usage' | 'tickets' | 'name'

function humanizeAgo(d: string | null, nowMs: number) {
  if (!d) return 'Never'
  const days = Math.floor((nowMs - new Date(d).getTime()) / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return '1d ago'
  if (days < 30)  return `${days}d ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}yr ago`
}

function TierBadge({ tier }: { tier: 'healthy' | 'at_risk' | 'critical' }) {
  const s = { healthy: 'bg-green-100 text-green-700 border-green-200', at_risk: 'bg-yellow-100 text-yellow-700 border-yellow-200', critical: 'bg-red-100 text-red-700 border-red-200' }
  const l = { healthy: 'Healthy', at_risk: 'At Risk', critical: 'Critical' }
  return <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold border ${s[tier]}`}>{l[tier]}</span>
}

function ScoreCircle({ score, tier }: { score: number; tier: string }) {
  const bg = tier === 'healthy' ? 'bg-green-100 text-green-700' : tier === 'at_risk' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
  return <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 text-sm font-bold ${bg}`}>{score}</div>
}

export default function SalespersonDetailPage() {
  const [nowMs] = useState(() => Date.now())
  const { id } = useParams<{ id: string }>()
  const [salesperson, setSalesperson]   = useState<SalespersonDetail | null>(null)
  const [customers, setCustomers]       = useState<CustomerOrg[]>([])
  const [commEvents, setCommEvents]     = useState<CommEvent[]>([])
  const [loading, setLoading]           = useState(true)
  const [sort, setSort]                 = useState<SortKey>('risk')
  const [expanded, setExpanded]         = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    fetch(`/api/admin/sales/${encodeURIComponent(id)}`)
      .then(r => r.json())
      .then((d: { salesperson: SalespersonDetail; customers: CustomerOrg[]; commission_events: CommEvent[] }) => {
        setSalesperson(d.salesperson)
        setCustomers(d.customers ?? [])
        setCommEvents(d.commission_events ?? [])
      })
      .finally(() => setLoading(false))
  }, [id])

  const sorted = useMemo(() => {
    const list = [...customers]
    if (sort === 'risk') {
      const order = { critical: 0, at_risk: 1, healthy: 2 }
      list.sort((a, b) => {
        const diff = (order[a.tier] ?? 2) - (order[b.tier] ?? 2)
        return diff !== 0 ? diff : a.score - b.score
      })
    } else if (sort === 'inactive') {
      list.sort((a, b) => {
        const da = a.last_active_at ? (nowMs - new Date(a.last_active_at).getTime()) : Infinity
        const db = b.last_active_at ? (nowMs - new Date(b.last_active_at).getTime()) : Infinity
        return db - da
      })
    } else if (sort === 'usage') {
      list.sort((a, b) => a.sms_used_pct - b.sms_used_pct)
    } else if (sort === 'tickets') {
      list.sort((a, b) => b.tickets_open - a.tickets_open)
    } else if (sort === 'name') {
      list.sort((a, b) => a.name.localeCompare(b.name))
    }
    return list
  }, [customers, nowMs, sort])

  const stats = useMemo(() => ({
    total:    customers.length,
    active:   customers.filter(c => c.subscription_status === 'active').length,
    critical: customers.filter(c => c.tier === 'critical').length,
    at_risk:  customers.filter(c => c.tier === 'at_risk').length,
    healthy:  customers.filter(c => c.tier === 'healthy').length,
    avgScore: customers.length > 0 ? Math.round(customers.reduce((s, c) => s + c.score, 0) / customers.length) : 0,
    noEmail:  customers.filter(c => !c.has_active_email).length,
    noOnboarding: customers.filter(c => !c.onboarding_done).length,
  }), [customers])

  if (loading) return (
    <div><TopBar title="Loading…" /><div className="px-4 py-8 text-center text-sm text-muted-foreground">Loading…</div></div>
  )
  if (!salesperson) return (
    <div><TopBar title="Not Found" /><div className="px-4 py-8 text-center text-sm text-muted-foreground">Salesperson not found.</div></div>
  )

  const SORT_LABELS: Record<SortKey, string> = {
    risk: 'Attrition Risk', inactive: 'Most Inactive', usage: 'Low Usage', tickets: 'Needs Help', name: 'Name A–Z',
  }

  return (
    <div>
      <TopBar title={salesperson.owner_name} />
      <div className="px-4 py-4 lg:px-6 space-y-5 max-w-3xl">

        <Link href="/admin/sales" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to Sales Team
        </Link>

        {/* Profile card */}
        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-start gap-4 mb-4">
            <div className="h-12 w-12 rounded-full bg-[#0D2B55] flex items-center justify-center shrink-0">
              <Shield className="h-6 w-6 text-white/80" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg font-bold">{salesperson.owner_name}</h1>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold border ${
                  salesperson.type === 'advisor'
                    ? 'bg-purple-100 text-purple-700 border-purple-200'
                    : 'bg-blue-100 text-blue-700 border-blue-200'
                }`}>{salesperson.type === 'advisor' ? 'Advisor' : 'Flyer'}</span>
                {!salesperson.is_active && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 border">Inactive</span>}
              </div>
              {salesperson.owner_email && (
                <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-0.5">
                  <Mail className="h-3.5 w-3.5" />{salesperson.owner_email}
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                Code: <span className="font-mono font-semibold">{salesperson.code}</span>
                {' · '}First: {salesperson.commission_first_pct}%
                {salesperson.commission_recurring_pct > 0 && ` · Recurring: ${salesperson.commission_recurring_pct}%`}
              </p>
            </div>
            {salesperson.owner_email && (
              <Link href={`mailto:${salesperson.owner_email}`}
                className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg border bg-card text-xs font-medium hover:bg-accent transition-colors">
                <Mail className="h-3.5 w-3.5" /> Contact
              </Link>
            )}
          </div>

          {/* Commission row */}
          <div className="grid grid-cols-2 gap-3">
            <div className={`rounded-lg p-3 ${salesperson.commission_pending >= 25 ? 'bg-green-50 dark:bg-green-950/20 border border-green-200' : 'bg-muted/40'}`}>
              <div className="flex items-center gap-1 mb-1">
                <DollarSign className="h-3.5 w-3.5 text-green-600" />
                <span className="text-[10px] font-medium uppercase tracking-wide">Pending Commission</span>
              </div>
              <p className={`text-xl font-bold ${salesperson.commission_pending >= 25 ? 'text-green-600' : ''}`}>
                ${salesperson.commission_pending.toFixed(2)}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {salesperson.commission_pending >= 25 ? '✓ Payable — $25 threshold met' : `$${(25 - salesperson.commission_pending).toFixed(2)} until payable`}
              </p>
            </div>
            <div className="rounded-lg bg-muted/40 p-3">
              <div className="flex items-center gap-1 mb-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-[10px] font-medium uppercase tracking-wide">All-Time Paid</span>
              </div>
              <p className="text-xl font-bold">${salesperson.commission_paid.toFixed(2)}</p>
              <p className="text-[10px] text-muted-foreground">lifetime earnings</p>
            </div>
          </div>
        </div>

        {/* Customer stats */}
        <div className="grid grid-cols-3 lg:grid-cols-6 gap-2">
          {[
            { label: 'Total',        value: stats.total,       color: '' },
            { label: 'Active',       value: stats.active,      color: 'text-green-600' },
            { label: 'Critical',     value: stats.critical,    color: stats.critical > 0 ? 'text-red-600' : '' },
            { label: 'At Risk',      value: stats.at_risk,     color: stats.at_risk > 0 ? 'text-yellow-600' : '' },
            { label: 'No Email',     value: stats.noEmail,     color: stats.noEmail > 0 ? 'text-orange-500' : '' },
            { label: 'Avg Score',    value: stats.avgScore,    color: stats.avgScore < 50 ? 'text-red-600' : stats.avgScore >= 65 ? 'text-green-600' : 'text-yellow-600' },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-xl border bg-card p-3 text-center">
              <p className={`text-xl font-bold ${color}`}>{value}</p>
              <p className="text-[10px] text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>

        {/* Customer list */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Customers ({customers.length})
            </p>
            {/* Sort */}
            <div className="flex items-center gap-1">
              <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
              <select
                value={sort}
                onChange={e => setSort(e.target.value as SortKey)}
                className="text-xs border rounded-lg px-2 py-1 bg-card"
              >
                {(Object.entries(SORT_LABELS) as [SortKey, string][]).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
          </div>

          {customers.length === 0 ? (
            <div className="rounded-xl border bg-card p-8 text-center">
              <p className="text-sm text-muted-foreground">No customers attributed to this code yet.</p>
              <p className="text-xs text-muted-foreground mt-1">Dealers sign up using: <span className="font-mono font-medium">?ref={salesperson.code}</span></p>
            </div>
          ) : (
            <div className="space-y-2">
              {sorted.map(org => (
                <div key={org.id} className="rounded-xl border bg-card overflow-hidden">
                  <button
                    onClick={() => setExpanded(e => e === org.id ? null : org.id)}
                    className="w-full text-left"
                  >
                    <div className="flex items-center gap-3 p-4">
                      <ScoreCircle score={org.score} tier={org.tier} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm truncate">{org.name}</span>
                          <TierBadge tier={org.tier} />
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
                          <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{humanizeAgo(org.last_active_at, nowMs)}</span>
                          <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" />{org.sms_used_pct}% SMS</span>
                          {!org.has_active_email && <span className="text-yellow-500 text-[10px]">No email</span>}
                          {org.tickets_open > 0 && (
                            <span className="flex items-center gap-0.5 text-orange-500">
                              <TicketCheck className="h-3 w-3" />{org.tickets_open} ticket{org.tickets_open !== 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                      </div>
                      <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform shrink-0 ${expanded === org.id ? 'rotate-90' : ''}`} />
                    </div>
                  </button>

                  {/* Expanded */}
                  {expanded === org.id && (
                    <div className="border-t px-4 pb-4 pt-3">
                      {/* Negative signals */}
                      <div className="space-y-1.5 mb-4">
                        {org.signals.filter(s => s.delta < 0).map((s, i) => (
                          <div key={i} className="flex items-start gap-2 text-xs">
                            <AlertCircle className="h-3.5 w-3.5 text-red-500 mt-0.5 shrink-0" />
                            <span className="font-medium">{s.label}</span>
                            <span className="text-muted-foreground ml-auto">{s.note}</span>
                          </div>
                        ))}
                        {org.signals.filter(s => s.delta < 0).length === 0 && (
                          <div className="flex items-center gap-2 text-xs text-green-600">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            No risk signals — customer looks healthy
                          </div>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Link href={`/admin/orgs/${org.id}`}
                          className="px-3 py-1.5 rounded-lg bg-[#0D2B55] text-white text-xs font-medium hover:bg-[#1a4480]">
                          View Dealership
                        </Link>
                        <Link href={`/admin/orgs/${org.id}#notes`}
                          className="px-3 py-1.5 rounded-lg border bg-card text-xs font-medium hover:bg-accent">
                          Add Outreach Note
                        </Link>
                        {org.tickets_open > 0 && (
                          <Link href={`/admin/tickets?org=${org.id}`}
                            className="px-3 py-1.5 rounded-lg border border-orange-200 bg-orange-50 text-orange-700 text-xs font-medium">
                            View {org.tickets_open} Ticket{org.tickets_open !== 1 ? 's' : ''}
                          </Link>
                        )}
                        {!org.has_active_email && (
                          <span className="px-3 py-1.5 rounded-lg border border-yellow-200 bg-yellow-50 text-yellow-700 text-xs font-medium">
                            Needs: Email Setup
                          </span>
                        )}
                        {!org.onboarding_done && (
                          <span className="px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 text-xs font-medium">
                            Needs: Onboarding
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Commission events */}
        {commEvents.length > 0 && (
          <section>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Commission History
            </p>
            <div className="rounded-xl border bg-card divide-y">
              {commEvents.map(ev => (
                <div key={ev.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-xs font-medium capitalize">{ev.event_type.replace(/_/g, ' ')}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {ev.billing_period ?? new Date(ev.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-semibold ${ev.status === 'paid' ? 'text-muted-foreground line-through' : 'text-green-600'}`}>
                      ${Number(ev.amount).toFixed(2)}
                    </p>
                    <p className="text-[10px] text-muted-foreground capitalize">{ev.status}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-2 flex justify-end">
              <Link href="/admin/affiliates" className="text-xs text-primary hover:underline">
                Manage payouts →
              </Link>
            </div>
          </section>
        )}

        {/* Attrition guide */}
        {(stats.critical > 0 || stats.at_risk > 0) && (
          <div className="rounded-xl border bg-card p-4">
            <p className="text-xs font-semibold mb-3 flex items-center gap-1.5">
              <TrendingDown className="h-3.5 w-3.5 text-orange-500" />
              Retention Action Guide
            </p>
            <div className="space-y-2 text-xs text-muted-foreground">
              {stats.critical > 0 && <p className="text-red-600 font-medium">• {stats.critical} critical dealer{stats.critical !== 1 ? 's' : ''} — reach out immediately. High churn risk.</p>}
              {stats.at_risk > 0  && <p className="text-yellow-600 font-medium">• {stats.at_risk} at-risk dealer{stats.at_risk !== 1 ? 's' : ''} — schedule a check-in call within 7 days.</p>}
              {stats.noEmail > 0  && <p>• {stats.noEmail} without email integration — walk them through Gmail setup.</p>}
              {stats.noOnboarding > 0 && <p>• {stats.noOnboarding} incomplete onboarding — offer a 15-min setup call.</p>}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
