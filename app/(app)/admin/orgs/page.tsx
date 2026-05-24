'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import TopBar from '@/components/layout/TopBar'
import { cn } from '@/lib/utils'
import { Search, Filter, ChevronRight, UserCheck, Check, Mail, Phone, Globe } from 'lucide-react'
import { useVertical } from '@/hooks/useVertical'

interface OrgRow {
  id: string
  name: string
  vertical: string | null
  plan: string
  subscription_status: string | null
  trial_ends_at: string | null
  current_period_end: string | null
  created_at: string
  approved_at: string | null
  suspended_at: string | null
  stripe_customer_id: string | null
  business_phone: string | null
  signup_email: string | null
  dealer_website_url: string | null
  sms_used_pct: number
  last_active_at: string | null
  has_active_email: boolean
  onboarding_done: boolean
  health_score: number
  assigned_staff_id: string | null
  assigned_staff_name: string | null
}

interface StaffOption {
  id: string
  display_name: string
}

type FilterStatus = 'all' | 'active' | 'trialing' | 'past_due' | 'suspended' | 'unassigned'
type VerticalFilter = 'all' | 'dealer' | 'real_estate'

function VerticalBadge({ vertical }: { vertical: string | null }) {
  const isRe = vertical === 'real_estate'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
      isRe ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-700'
    }`}>
      {isRe ? 'RealtyWyze' : 'DealerWyze'}
    </span>
  )
}

function StatusBadge({ status }: { status: string | null }) {
  const s = status ?? 'unknown'
  const styles: Record<string, string> = {
    active:   'bg-green-100 text-green-700',
    trialing: 'bg-blue-100 text-blue-700',
    past_due: 'bg-red-100 text-red-700',
    canceled: 'bg-gray-100 text-gray-500',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${styles[s] ?? 'bg-gray-100 text-gray-500'}`}>
      {s.replace('_', ' ')}
    </span>
  )
}

function HealthDot({ score }: { score: number }) {
  const color = score >= 70 ? 'bg-green-500' : score >= 40 ? 'bg-yellow-500' : 'bg-red-500'
  return <span className={`inline-block h-2 w-2 rounded-full ${color} shrink-0`} title={`Health: ${score}`} />
}

function humanizeAgo(d: string | null, nowMs: number) {
  if (!d) return 'Never'
  const days = Math.floor((nowMs - new Date(d).getTime()) / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return '1d ago'
  if (days < 30)  return `${days}d ago`
  return `${Math.floor(days / 30)}mo ago`
}

type EngagementTier = 'hot' | 'active' | 'onboarding' | 'slowing' | 'at_risk' | 'dormant'

interface TierMeta {
  tier: EngagementTier
  label: string
  dot: string          // tailwind bg color
  badge: string        // badge classes
  row: string          // row bg tint
  borderLeft: string   // left accent
}

const TIER_META: Record<EngagementTier, TierMeta> = {
  hot:        { tier: 'hot',        label: 'Hot',        dot: 'bg-emerald-500', badge: 'bg-emerald-100 text-emerald-700 border-emerald-200',  row: 'bg-emerald-50/40',  borderLeft: 'border-l-2 border-l-emerald-500' },
  active:     { tier: 'active',     label: 'Active',     dot: 'bg-green-400',   badge: 'bg-green-100 text-green-700 border-green-200',         row: '',                  borderLeft: 'border-l-2 border-l-green-400' },
  onboarding: { tier: 'onboarding', label: 'New',        dot: 'bg-blue-400',    badge: 'bg-blue-100 text-blue-700 border-blue-200',            row: 'bg-blue-50/30',     borderLeft: 'border-l-2 border-l-blue-400' },
  slowing:    { tier: 'slowing',    label: 'Slowing',    dot: 'bg-yellow-500',  badge: 'bg-yellow-100 text-yellow-700 border-yellow-200',      row: 'bg-yellow-50/30',   borderLeft: 'border-l-2 border-l-yellow-400' },
  at_risk:    { tier: 'at_risk',    label: 'At Risk',    dot: 'bg-orange-500',  badge: 'bg-orange-100 text-orange-700 border-orange-200',      row: 'bg-orange-50/30',   borderLeft: 'border-l-2 border-l-orange-500' },
  dormant:    { tier: 'dormant',    label: 'Dormant',    dot: 'bg-red-400',     badge: 'bg-red-100 text-red-600 border-red-200',               row: 'bg-red-50/20',      borderLeft: 'border-l-2 border-l-red-400' },
}

function getEngagementTier(org: OrgRow, nowMs: number): TierMeta {
  const daysSinceSignup = Math.floor((nowMs - new Date(org.created_at).getTime()) / 86400000)
  const daysSinceActive = org.last_active_at
    ? Math.floor((nowMs - new Date(org.last_active_at).getTime()) / 86400000)
    : null

  // New dealers (≤ 7 days) who haven't had meaningful activity yet → Onboarding
  if (daysSinceSignup <= 7 && (daysSinceActive === null || daysSinceActive >= daysSinceSignup)) {
    return TIER_META.onboarding
  }

  // Active today or yesterday → Hot
  if (daysSinceActive !== null && daysSinceActive <= 1) return TIER_META.hot

  // Active within the week → Active
  if (daysSinceActive !== null && daysSinceActive <= 7) return TIER_META.active

  // Active 8–21 days ago → Slowing
  if (daysSinceActive !== null && daysSinceActive <= 21) return TIER_META.slowing

  // Active 22–60 days ago OR signed up > 14 days with no activity → At Risk
  if (daysSinceActive !== null && daysSinceActive <= 60) return TIER_META.at_risk
  if (daysSinceActive === null && daysSinceSignup > 14)  return TIER_META.at_risk

  // Signed up ≤ 14 days, no activity yet → still Onboarding
  if (daysSinceActive === null && daysSinceSignup <= 14) return TIER_META.onboarding

  // Active > 60 days ago or never active after 60+ days → Dormant
  return TIER_META.dormant
}

function EngagementBadge({ tier }: { tier: TierMeta }) {
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-semibold ${tier.badge}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${tier.dot}`} />
      {tier.label}
    </span>
  )
}

function formatDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function AdminOrgsPage() {
  const [nowMs] = useState(() => Date.now())
  const { vertical } = useVertical()
  const isRE = vertical === 'real_estate'
  const orgNoun = isRE ? 'agency' : 'dealership'
  const orgNounPlural = isRE ? 'agencies' : 'dealerships'
  const defaultVerticalFilter: VerticalFilter = vertical === 'real_estate' ? 'real_estate' : 'dealer'
  const [orgs, setOrgs]         = useState<OrgRow[]>([])
  const [staff, setStaff]       = useState<StaffOption[]>([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [filter, setFilter]     = useState<FilterStatus>('all')
  const [verticalFilter, setVerticalFilter] = useState<VerticalFilter>(defaultVerticalFilter)

  // Assignment mode
  const [selecting, setSelecting]     = useState(false)
  const [selected, setSelected]       = useState<Set<string>>(new Set())
  const [assignStaffId, setAssignStaffId] = useState('')
  const [assigning, setAssigning]     = useState(false)
  const [assignMsg, setAssignMsg]     = useState('')

  function loadData() {
    setLoading(true)
    Promise.all([
      fetch('/api/admin/orgs').then(async r => { const j = await r.json(); if (!r.ok) console.error('[admin/orgs] HTTP', r.status, j); return j }).catch(() => []),
      fetch('/api/admin/staff').then(r => r.json()).catch(() => []),
    ]).then(([orgsData, staffData]) => {
      setOrgs(Array.isArray(orgsData) ? orgsData : [])
      setStaff(Array.isArray(staffData) ? staffData : [])
      if (!Array.isArray(orgsData)) console.error('Admin orgs API error:', orgsData)
    }).finally(() => setLoading(false))
  }

  useEffect(() => {
    let cancelled = false

    Promise.all([
      fetch('/api/admin/orgs').then(async r => {
        const j = await r.json()
        if (!r.ok) console.error('[admin/orgs] HTTP', r.status, j)
        return j
      }).catch(() => []),
      fetch('/api/admin/staff').then(r => r.json()).catch(() => []),
    ]).then(([orgsData, staffData]) => {
      if (cancelled) return
      setOrgs(Array.isArray(orgsData) ? orgsData : [])
      setStaff(Array.isArray(staffData) ? staffData : [])
      if (!Array.isArray(orgsData)) console.error('Admin orgs API error:', orgsData)
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [])

  const filtered = useMemo(() => {
    let list = orgs
      .filter(o => o.id !== '00000000-0000-0000-0000-000000000001')

    if (filter === 'active')      list = list.filter(o => o.subscription_status === 'active' && !o.suspended_at)
    else if (filter === 'trialing')    list = list.filter(o => o.subscription_status === 'trialing')
    else if (filter === 'past_due')    list = list.filter(o => o.subscription_status === 'past_due')
    else if (filter === 'suspended')   list = list.filter(o => !!o.suspended_at)
    else if (filter === 'unassigned')  list = list.filter(o => !o.assigned_staff_id)

    if (verticalFilter === 'dealer') list = list.filter(o => (o.vertical ?? 'dealer') === 'dealer')
    else if (verticalFilter === 'real_estate') list = list.filter(o => o.vertical === 'real_estate')

    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(o =>
        o.name.toLowerCase().includes(q) ||
        (o.business_phone ?? '').includes(q) ||
        (o.signup_email ?? '').toLowerCase().includes(q)
      )
    }
    return list
  }, [orgs, filter, verticalFilter, search])

  const counts = useMemo(() => {
    const base = orgs.filter(o => o.id !== '00000000-0000-0000-0000-000000000001')
    return {
      all:        base.length,
      active:     base.filter(o => o.subscription_status === 'active' && !o.suspended_at).length,
      trialing:   base.filter(o => o.subscription_status === 'trialing').length,
      past_due:   base.filter(o => o.subscription_status === 'past_due').length,
      suspended:  base.filter(o => !!o.suspended_at).length,
      unassigned: base.filter(o => !o.assigned_staff_id).length,
    }
  }, [orgs])

  const verticalCounts = useMemo(() => {
    const base = orgs.filter(o => o.id !== '00000000-0000-0000-0000-000000000001')
    return {
      all: base.length,
      dealer: base.filter(o => (o.vertical ?? 'dealer') === 'dealer').length,
      real_estate: base.filter(o => o.vertical === 'real_estate').length,
    }
  }, [orgs])

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAll() {
    setSelected(new Set(filtered.map(o => o.id)))
  }

  async function applyAssignment() {
    if (selected.size === 0) return
    setAssigning(true)
    setAssignMsg('')
    const res = await fetch('/api/admin/orgs/assign', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        org_ids: Array.from(selected),
        staff_id: assignStaffId || null,
      }),
    })
    const data = await res.json()
    if (!res.ok) {
      setAssignMsg(data.error ?? 'Assignment failed')
    } else {
      setAssignMsg(`${data.updated} ${data.updated !== 1 ? orgNounPlural : orgNoun} updated.`)
      setSelected(new Set())
      setSelecting(false)
      loadData()
    }
    setAssigning(false)
  }

  return (
    <div>
      <TopBar title={isRE ? 'Agencies' : 'Dealerships'} />
      <div className="px-4 py-4 lg:px-6 space-y-4">

        {/* Controls */}
        <div className="flex flex-col gap-3">
        <div className="flex rounded-lg border bg-card overflow-hidden shrink-0 flex-wrap w-fit">
            {(['all', 'dealer', 'real_estate'] as const).map(v => (
              <button
                key={v}
                onClick={() => setVerticalFilter(v)}
                className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  verticalFilter === v ? 'bg-[#0D2B55] text-white' : 'text-muted-foreground hover:bg-accent'
                }`}
              >
                {v === 'all' ? `All brands (${verticalCounts.all})` :
                 v === 'dealer' ? `DealerWyze (${verticalCounts.dealer})` :
                 `RealtyWyze (${verticalCounts.real_estate})`}
              </button>
            ))}
          </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex rounded-lg border bg-card overflow-hidden shrink-0 flex-wrap">
            <Filter className="h-3.5 w-3.5 text-muted-foreground self-center ml-2.5" />
            {(['all', 'active', 'trialing', 'past_due', 'suspended', 'unassigned'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  filter === f ? 'bg-[#0D2B55] text-white' : 'text-muted-foreground hover:bg-accent'
                }`}
              >
                {f === 'all'        ? `All (${counts.all})` :
                 f === 'active'     ? `Active (${counts.active})` :
                 f === 'trialing'   ? `Trial (${counts.trialing})` :
                 f === 'past_due'   ? `Past Due (${counts.past_due})` :
                 f === 'suspended'  ? `Suspended (${counts.suspended})` :
                 `Unassigned (${counts.unassigned})`}
              </button>
            ))}
          </div>

          <div className="flex gap-2 flex-1">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by name or phone…"
                className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg border bg-card"
              />
            </div>
            {staff.length > 0 && (
              <button
                onClick={() => { setSelecting(s => !s); setSelected(new Set()); setAssignMsg('') }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                  selecting ? 'bg-[#0D2B55] text-white border-[#0D2B55]' : 'bg-card hover:bg-accent'
                }`}
              >
                <UserCheck className="h-3.5 w-3.5" />
                {selecting ? 'Cancel' : 'Assign'}
              </button>
            )}
          </div>
        </div>
        </div>

        {/* Assignment toolbar */}
        {selecting && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-blue-50 border-blue-200 px-4 py-3">
            <span className="text-xs font-medium text-blue-800">
              {selected.size} selected
            </span>
            <button onClick={selectAll} className="text-xs text-blue-700 hover:underline">
              Select all {filtered.length}
            </button>
            <button onClick={() => setSelected(new Set())} className="text-xs text-blue-700 hover:underline">
              Clear
            </button>
            <div className="flex items-center gap-2 ml-auto flex-wrap">
              <select
                value={assignStaffId}
                onChange={e => setAssignStaffId(e.target.value)}
                className="text-xs rounded-lg border bg-white px-2 py-1.5"
              >
                <option value="">Unassign</option>
                {staff.map(s => (
                  <option key={s.id} value={s.id}>{s.display_name}</option>
                ))}
              </select>
              <button
                onClick={applyAssignment}
                disabled={assigning || selected.size === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0D2B55] text-white text-xs font-medium disabled:opacity-50"
              >
                <Check className="h-3.5 w-3.5" />
                {assigning ? 'Saving…' : `Apply to ${selected.size}`}
              </button>
              {assignMsg && (
                <span className={`text-xs ${assignMsg.includes('failed') || assignMsg.includes('Migration') ? 'text-red-600' : 'text-green-700'}`}>
                  {assignMsg}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Engagement legend */}
        <div className="flex flex-wrap items-center gap-2">
          {(Object.values(TIER_META) as TierMeta[]).map(t => (
            <span key={t.tier} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-semibold ${t.badge}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${t.dot}`} />
              {t.label}
            </span>
          ))}
          <span className="text-[10px] text-muted-foreground ml-1">Hot = daily · Active = weekly · Slowing = 8–21d · At Risk = 22–60d · Dormant = 60d+</span>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground text-center py-8">{`Loading ${orgNounPlural}…`}</p>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden lg:block rounded-xl border bg-card overflow-hidden">
              <table className="w-full text-sm border-collapse">
                <thead className="sticky top-0 z-10 bg-card">
                  <tr className="border-b bg-muted/30 text-xs text-muted-foreground font-semibold uppercase tracking-wide">
                    {selecting && <th className="py-3 px-3 w-8"></th>}
                    <th className="py-3 px-4 text-left">{isRE ? 'Agency' : 'Dealership'}</th>
                    <th className="py-3 px-4 text-left">Engagement</th>
                    <th className="py-3 px-4 text-left">Status</th>
                    <th className="py-3 px-4 text-left">Plan</th>
                    <th className="py-3 px-4 text-left">Assigned To</th>
                    <th className="py-3 px-4 text-left">SMS</th>
                    <th className="py-3 px-4 text-left">Last Active</th>
                    <th className="py-3 px-4 text-left">Signed Up</th>
                    <th className="py-3 px-4 text-left">Billing</th>
                    <th className="py-3 px-4 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(org => {
                    const billingDate = org.subscription_status === 'trialing'
                      ? org.trial_ends_at
                      : org.current_period_end
                    const isSelected = selected.has(org.id)
                    const tier = getEngagementTier(org, nowMs)
                    return (
                      <tr
                        key={org.id}
                        className={cn(
                          'border-b transition-colors',
                          tier.borderLeft,
                          isSelected ? 'bg-blue-50' : `${tier.row} hover:bg-accent/40`,
                        )}
                        onClick={selecting ? () => toggleSelect(org.id) : undefined}
                        style={selecting ? { cursor: 'pointer' } : undefined}
                      >
                        {selecting && (
                          <td className="py-3 px-3">
                            <div className={`h-4 w-4 rounded border-2 flex items-center justify-center ${
                              isSelected ? 'bg-[#0D2B55] border-[#0D2B55]' : 'border-gray-300'
                            }`}>
                              {isSelected && <Check className="h-3 w-3 text-white" />}
                            </div>
                          </td>
                        )}
                        <td className="py-3 px-4">
                          <Link
                            href={`/admin/orgs/${org.id}`}
                            onClick={e => selecting && e.stopPropagation()}
                            className="font-medium hover:text-primary flex items-center gap-1.5 flex-wrap"
                          >
                            <span>{org.name || 'Unnamed'}</span>
                            <VerticalBadge vertical={org.vertical} />
                            {org.suspended_at && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium">Susp.</span>
                            )}
                            {!org.has_active_email && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-yellow-50 border border-yellow-200 text-yellow-700">No Email</span>
                            )}
                          </Link>
                          <div className="mt-0.5 space-y-0.5">
                            {org.signup_email && (
                              <a href={`mailto:${org.signup_email}`} onClick={e => e.stopPropagation()} className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
                                <Mail className="h-3 w-3 shrink-0" />{org.signup_email}
                              </a>
                            )}
                            {org.business_phone && (
                              <a href={`tel:${org.business_phone}`} onClick={e => e.stopPropagation()} className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
                                <Phone className="h-3 w-3 shrink-0" />{org.business_phone}
                              </a>
                            )}
                            {org.dealer_website_url && (
                              <a href={org.dealer_website_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground truncate max-w-[200px]">
                                <Globe className="h-3 w-3 shrink-0" />{org.dealer_website_url.replace(/^https?:\/\//, '')}
                              </a>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4"><EngagementBadge tier={tier} /></td>
                        <td className="py-3 px-4"><StatusBadge status={org.subscription_status} /></td>
                        <td className="py-3 px-4 text-muted-foreground uppercase text-xs">{org.plan}</td>
                        <td className="py-3 px-4 text-xs">
                          {org.assigned_staff_name ? (
                            <Link
                              href={`/admin/staff/${org.assigned_staff_id}`}
                              onClick={e => selecting && e.stopPropagation()}
                              className="text-primary hover:underline"
                            >
                              {org.assigned_staff_name}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${
                                org.sms_used_pct >= 90 ? 'bg-red-500' : org.sms_used_pct >= 70 ? 'bg-yellow-500' : 'bg-green-500'
                              }`} style={{ width: `${Math.min(100, org.sms_used_pct)}%` }} />
                            </div>
                            <span className="text-xs text-muted-foreground">{org.sms_used_pct}%</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-xs text-muted-foreground">{humanizeAgo(org.last_active_at, nowMs)}</td>
                        <td className="py-3 px-4 text-xs text-muted-foreground">{formatDate(org.created_at)}</td>
                        <td className="py-3 px-4 text-xs text-muted-foreground">{formatDate(billingDate ?? null)}</td>
                        <td className="py-3 px-4">
                          <Link
                            href={`/admin/orgs/${org.id}`}
                            onClick={e => selecting && e.stopPropagation()}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <ChevronRight className="h-4 w-4" />
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={selecting ? 11 : 10} className="py-10 text-center text-sm text-muted-foreground">
                        {`No ${orgNounPlural} match this filter.`}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="lg:hidden space-y-2">
              {filtered.map(org => {
                const billingDate = org.subscription_status === 'trialing'
                  ? org.trial_ends_at
                  : org.current_period_end
                const isSelected = selected.has(org.id)
                const tier = getEngagementTier(org, nowMs)
                return (
                  <div
                    key={org.id}
                    onClick={selecting ? () => toggleSelect(org.id) : undefined}
                    className={cn(
                      'rounded-xl border overflow-hidden',
                      tier.borderLeft,
                      selecting ? 'cursor-pointer' : '',
                      isSelected ? 'border-blue-400 bg-blue-50' : tier.row || 'bg-card',
                    )}
                  >
                    <Link
                      href={selecting ? '#' : `/admin/orgs/${org.id}`}
                      onClick={e => selecting && e.preventDefault()}
                      className="flex items-center gap-3 p-4 active:opacity-70"
                    >
                      {selecting && (
                        <div className={`h-4 w-4 rounded border-2 flex items-center justify-center shrink-0 ${
                          isSelected ? 'bg-[#0D2B55] border-[#0D2B55]' : 'border-gray-300'
                        }`}>
                          {isSelected && <Check className="h-3 w-3 text-white" />}
                        </div>
                      )}
                      <HealthDot score={org.health_score ?? 50} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-sm truncate">{org.name || 'Unnamed'}</p>
                          <VerticalBadge vertical={org.vertical} />
                          <EngagementBadge tier={tier} />
                          <StatusBadge status={org.subscription_status} />
                          {org.suspended_at && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700">Suspended</span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {humanizeAgo(org.last_active_at, nowMs)} · SMS {org.sms_used_pct}%
                          {org.assigned_staff_name && ` · ${org.assigned_staff_name}`}
                          {!org.has_active_email && ' · No email'}
                          {billingDate && ` · ${formatDate(billingDate)}`}
                        </p>
                        {(org.signup_email || org.business_phone) && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {org.signup_email && org.signup_email}
                            {org.signup_email && org.business_phone && ' · '}
                            {org.business_phone && org.business_phone}
                          </p>
                        )}
                      </div>
                      {!selecting && <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                    </Link>
                  </div>
                )
              })}
              {filtered.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">No {orgNounPlural} match this filter.</p>
              )}
            </div>

            <p className="text-xs text-muted-foreground">{filtered.length} {filtered.length !== 1 ? orgNounPlural : orgNoun} shown</p>
          </>
        )}
      </div>
    </div>
  )
}
