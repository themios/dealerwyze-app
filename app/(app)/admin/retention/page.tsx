'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import TopBar from '@/components/layout/TopBar'
import {
  TrendingDown, TrendingUp, AlertCircle, CheckCircle2,
  Clock, Mail, MessageSquare, TicketCheck, ChevronRight, Search,
  PhoneCall, UserX,
} from 'lucide-react'
import type { AttritionTier } from '@/lib/admin/attrition'

interface RetentionOrg {
  id: string
  name: string
  plan: string
  subscription_status: string | null
  created_at: string
  last_active_at: string | null
  score: number
  tier: AttritionTier
  signals: { label: string; delta: number; note: string }[]
  sms_used_pct: number
  has_active_email: boolean
  onboarding_done: boolean
  tickets_open: number
}

function humanizeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Never'
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return '1d ago'
  if (days < 30)  return `${days}d ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}yr ago`
}

function daysSince(dateStr: string | null): number {
  if (!dateStr) return 9999
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
}

function daysSinceSignup(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
}

function TierBadge({ tier }: { tier: AttritionTier }) {
  const styles: Record<AttritionTier, string> = {
    healthy:  'bg-green-100 text-green-700 border-green-200',
    at_risk:  'bg-yellow-100 text-yellow-700 border-yellow-200',
    critical: 'bg-red-100 text-red-700 border-red-200',
  }
  const labels: Record<AttritionTier, string> = { healthy: 'Healthy', at_risk: 'At Risk', critical: 'Critical' }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${styles[tier]}`}>
      {labels[tier]}
    </span>
  )
}

function ScoreBar({ score, tier }: { score: number; tier: AttritionTier }) {
  const color = tier === 'healthy' ? 'bg-green-500' : tier === 'at_risk' ? 'bg-yellow-500' : 'bg-red-500'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs tabular-nums w-6 text-right font-medium">{score}</span>
    </div>
  )
}

function SignalList({ signals }: { signals: { label: string; delta: number; note: string }[] }) {
  const negative = signals.filter(s => s.delta < 0)
  const positive = signals.filter(s => s.delta > 0)
  return (
    <div className="mt-3 space-y-1.5">
      {negative.map((s, i) => (
        <div key={i} className="flex items-start gap-2 text-xs">
          <AlertCircle className="h-3.5 w-3.5 text-red-500 mt-0.5 shrink-0" />
          <span className="text-foreground font-medium">{s.label}</span>
          <span className="text-muted-foreground ml-auto shrink-0">{s.note}</span>
        </div>
      ))}
      {positive.slice(0, 2).map((s, i) => (
        <div key={i} className="flex items-start gap-2 text-xs">
          <CheckCircle2 className="h-3.5 w-3.5 text-green-500 mt-0.5 shrink-0" />
          <span className="text-muted-foreground">{s.label}</span>
        </div>
      ))}
    </div>
  )
}

type FilterTier = 'all' | AttritionTier | 'never_used' | 'dormant'

export default function RetentionPage() {
  const [orgs, setOrgs]         = useState<RetentionOrg[]>([])
  const [loading, setLoading]   = useState(true)
  const [filter, setFilter]     = useState<FilterTier>('all')
  const [search, setSearch]     = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/retention')
      .then(r => r.json())
      .then((d: RetentionOrg[]) => setOrgs(d))
      .finally(() => setLoading(false))
  }, [])

  const neverUsed = useMemo(() =>
    orgs.filter(o => !o.last_active_at && o.subscription_status !== 'canceled'),
  [orgs])

  const dormant = useMemo(() =>
    orgs.filter(o => o.last_active_at && daysSince(o.last_active_at) >= 30 && o.subscription_status !== 'canceled'),
  [orgs])

  const filtered = useMemo(() => {
    let list = orgs
    if (filter === 'never_used') list = neverUsed
    else if (filter === 'dormant') list = dormant
    else if (filter !== 'all') list = list.filter(o => o.tier === filter)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(o => o.name.toLowerCase().includes(q))
    }
    return list
  }, [orgs, filter, search, neverUsed, dormant])

  const counts = useMemo(() => ({
    critical:   orgs.filter(o => o.tier === 'critical').length,
    at_risk:    orgs.filter(o => o.tier === 'at_risk').length,
    healthy:    orgs.filter(o => o.tier === 'healthy').length,
    never_used: neverUsed.length,
    dormant:    dormant.length,
  }), [orgs, neverUsed, dormant])

  const avgScore = orgs.length > 0
    ? Math.round(orgs.reduce((s, o) => s + o.score, 0) / orgs.length)
    : 0

  if (loading) {
    return (
      <div>
        <TopBar title="Retention" />
        <div className="px-4 py-8 text-center text-sm text-muted-foreground">Loading retention data…</div>
      </div>
    )
  }

  return (
    <div>
      <TopBar title="Retention" />
      <div className="px-4 py-4 lg:px-6 space-y-5">

        {/* Summary cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-xl border bg-card p-4">
            <p className="text-2xl font-bold">{avgScore}</p>
            <p className="text-xs font-medium mt-0.5">Avg Health Score</p>
            <p className="text-[10px] text-muted-foreground">out of 100</p>
          </div>
          <div className={`rounded-xl border p-4 ${counts.critical > 0 ? 'bg-red-50 border-red-200' : 'bg-card'}`}>
            <p className="text-2xl font-bold text-red-600">{counts.critical}</p>
            <p className="text-xs font-medium mt-0.5">Critical</p>
            <p className="text-[10px] text-muted-foreground">immediate action</p>
          </div>
          <div className={`rounded-xl border p-4 ${counts.at_risk > 0 ? 'bg-yellow-50 border-yellow-200' : 'bg-card'}`}>
            <p className="text-2xl font-bold text-yellow-600">{counts.at_risk}</p>
            <p className="text-xs font-medium mt-0.5">At Risk</p>
            <p className="text-[10px] text-muted-foreground">watch closely</p>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <p className="text-2xl font-bold text-green-600">{counts.healthy}</p>
            <p className="text-xs font-medium mt-0.5">Healthy</p>
            <p className="text-[10px] text-muted-foreground">engaged &amp; active</p>
          </div>
        </div>

        {/* Outreach callout — only if action needed */}
        {(counts.never_used > 0 || counts.dormant > 0) && (
          <div className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <PhoneCall className="h-4 w-4 text-orange-600 shrink-0" />
              <p className="text-sm font-medium text-orange-800">
                {counts.never_used > 0 && `${counts.never_used} dealer${counts.never_used !== 1 ? 's have' : ' has'} never logged in`}
                {counts.never_used > 0 && counts.dormant > 0 && ' · '}
                {counts.dormant > 0 && `${counts.dormant} dormant 30+ days`}
              </p>
            </div>
            <div className="flex gap-2 text-xs">
              {counts.never_used > 0 && (
                <button
                  onClick={() => setFilter('never_used')}
                  className="px-3 py-1.5 rounded-lg bg-orange-600 text-white font-medium hover:bg-orange-700 transition-colors"
                >
                  View never used ({counts.never_used})
                </button>
              )}
              {counts.dormant > 0 && (
                <button
                  onClick={() => setFilter('dormant')}
                  className="px-3 py-1.5 rounded-lg border border-orange-400 text-orange-700 font-medium hover:bg-orange-100 transition-colors"
                >
                  View dormant ({counts.dormant})
                </button>
              )}
            </div>
          </div>
        )}

        {/* Filters + search */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex rounded-lg border bg-card overflow-hidden flex-wrap">
            {([
              ['all',        `All (${orgs.length})`],
              ['critical',   `Critical (${counts.critical})`],
              ['at_risk',    `At Risk (${counts.at_risk})`],
              ['healthy',    `Healthy (${counts.healthy})`],
              ['never_used', `Never Used (${counts.never_used})`],
              ['dormant',    `Dormant 30d+ (${counts.dormant})`],
            ] as const).map(([t, label]) => (
              <button
                key={t}
                onClick={() => setFilter(t)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  filter === t
                    ? 'bg-[#0D2B55] text-white'
                    : 'text-muted-foreground hover:bg-accent'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search dealerships…"
              className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg border bg-card"
            />
          </div>
        </div>

        {/* Org list */}
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No dealers match this filter.</p>
        ) : (
          <div className="space-y-2">
            {filtered.map(org => {
              const signupDays  = daysSinceSignup(org.created_at)
              const neverLogged = !org.last_active_at
              const inactiveDays = daysSince(org.last_active_at)

              return (
                <div key={org.id} className={`rounded-xl border bg-card overflow-hidden ${
                  neverLogged ? 'border-orange-200' : ''
                }`}>
                  <button
                    onClick={() => setExpanded(e => e === org.id ? null : org.id)}
                    className="w-full text-left"
                  >
                    <div className="flex items-center gap-3 p-4">
                      {/* Score circle */}
                      <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 text-sm font-bold ${
                        org.tier === 'healthy'  ? 'bg-green-100 text-green-700' :
                        org.tier === 'at_risk'  ? 'bg-yellow-100 text-yellow-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {neverLogged ? <UserX className="h-5 w-5" /> : org.score}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Link
                            href={`/admin/orgs/${org.id}`}
                            onClick={e => e.stopPropagation()}
                            className="font-semibold text-sm hover:text-primary truncate"
                          >
                            {org.name}
                          </Link>
                          <TierBadge tier={org.tier} />
                          {neverLogged && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium border border-orange-200">
                              Never logged in
                            </span>
                          )}
                        </div>
                        <ScoreBar score={org.score} tier={org.tier} />
                      </div>

                      <div className="flex items-center gap-3 ml-2 shrink-0 text-xs text-muted-foreground">
                        <span className="hidden sm:flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {neverLogged ? (
                            <span className="text-orange-600 font-medium">
                              {signupDays}d since signup
                            </span>
                          ) : inactiveDays >= 30 ? (
                            <span className="text-red-600 font-medium">{humanizeAgo(org.last_active_at)}</span>
                          ) : (
                            humanizeAgo(org.last_active_at)
                          )}
                        </span>
                        {!org.has_active_email && (
                          <span title="No email integration">
                            <Mail className="h-3.5 w-3.5 text-yellow-500" />
                          </span>
                        )}
                        {org.tickets_open > 0 && (
                          <span className="flex items-center gap-0.5 text-orange-500">
                            <TicketCheck className="h-3.5 w-3.5" />
                            {org.tickets_open}
                          </span>
                        )}
                        {org.sms_used_pct > 0 && (
                          <span className="flex items-center gap-0.5">
                            <MessageSquare className="h-3 w-3" />
                            {org.sms_used_pct}%
                          </span>
                        )}
                        <ChevronRight className={`h-4 w-4 transition-transform ${expanded === org.id ? 'rotate-90' : ''}`} />
                      </div>
                    </div>
                  </button>

                  {/* Expanded signals */}
                  {expanded === org.id && (
                    <div className="border-t px-4 pb-4 pt-3">
                      <SignalList signals={org.signals} />
                      {signupDays >= 7 && neverLogged && (
                        <p className="mt-2 text-xs text-orange-600 flex items-center gap-1">
                          <AlertCircle className="h-3 w-3 shrink-0" />
                          Signed up {signupDays} days ago but has never logged in — high churn risk.
                          Reach out to complete onboarding.
                        </p>
                      )}
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Link
                          href={`/admin/orgs/${org.id}`}
                          className="px-3 py-1.5 rounded-lg bg-[#0D2B55] text-white text-xs font-medium hover:bg-[#1a4480] transition-colors"
                        >
                          View Dealer
                        </Link>
                        {org.tickets_open > 0 && (
                          <Link
                            href={`/admin/tickets?org=${org.id}`}
                            className="px-3 py-1.5 rounded-lg border bg-card text-xs font-medium hover:bg-accent transition-colors"
                          >
                            {org.tickets_open} Open Ticket{org.tickets_open !== 1 ? 's' : ''}
                          </Link>
                        )}
                        <Link
                          href={`/admin/orgs/${org.id}#notes`}
                          className="px-3 py-1.5 rounded-lg border bg-card text-xs font-medium hover:bg-accent transition-colors"
                        >
                          Add Outreach Note
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Legend */}
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Score Guide</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="flex items-start gap-2">
              <TrendingUp className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold text-green-700">65–100: Healthy</p>
                <p className="text-muted-foreground">Active, paying, using core features. Low churn risk.</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold text-yellow-700">35–64: At Risk</p>
                <p className="text-muted-foreground">Low engagement signals. Outreach recommended within 7 days.</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <TrendingDown className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold text-red-700">0–34: Critical</p>
                <p className="text-muted-foreground">Dormant or never used. Likely to churn without intervention.</p>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
