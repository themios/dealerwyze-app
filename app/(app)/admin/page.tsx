import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'
import { isPlatformSuperAdmin, getPlatformProfile } from '@/lib/auth/platform'
import TopBar from '@/components/layout/TopBar'
import PendingApprovalQueue from '@/components/admin/PendingApprovalQueue'
import PendingTransferQueue from '@/components/admin/PendingTransferQueue'
import { computeAttritionScore } from '@/lib/admin/attrition'
import {
  TicketCheck, TrendingDown, DollarSign, Users,
  AlertTriangle, CheckCircle2, Clock, Building2,
  ArrowRight,
} from 'lucide-react'

export const dynamic = 'force-dynamic'

interface PendingOrgRow { id: string; name: string; created_at: string }

const PLAN_MRR: Record<string, number> = { tier1: 150, tier2: 200, tier3: 250 }

function humanizeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Never'
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return '1d ago'
  if (days < 30)  return `${days}d ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}yr ago`
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
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
  const color = score >= 65 ? 'bg-green-500' : score >= 35 ? 'bg-yellow-500' : 'bg-red-500'
  return <span className={`inline-block h-2 w-2 rounded-full ${color} shrink-0`} title={`Health: ${score}`} />
}

export default async function AdminPage() {
  const profile    = await requireProfile()
  const superAdmin = await isPlatformSuperAdmin(profile.id)
  if (!superAdmin) {
    // Route non-superadmin platform members to their vertical's home page
    const platformProfile = await getPlatformProfile(profile.id)
    if (!platformProfile) redirect('/today')
    const role = platformProfile.platform_role
    if (role === 'platform_sales_manager') redirect('/admin/sales')
    if (role === 'platform_staff_manager') redirect('/admin/staff')
    redirect('/admin/tickets')
  }

  const service = createServiceClient()

  const [orgsRes, pendingRes, transfersRes, alertsRes, cronRes, ticketsRes, staffCountRes, emailRes, profilesRes] =
    await Promise.allSettled([
      service.from('organizations').select(`
        id, name, plan, subscription_status, trial_ends_at, current_period_end,
        created_at, approved_at, suspended_at,
        org_settings ( business_phone, monthly_message_count, sms_quota, onboarding_completed_at )
      `).order('created_at', { ascending: false }),

      service.from('organizations').select('id, name, created_at')
        .is('approved_at', null)
        .neq('id', '00000000-0000-0000-0000-000000000001')
        .order('created_at', { ascending: true }),

      service.from('business_transfers')
        .select('id, org_id, new_owner_email, status, data_snapshot, notes, created_at, token_expires_at, initiated_by, new_owner_user_id')
        .in('status', ['pending_claim', 'pending_approval'])
        .order('created_at', { ascending: false }),

      service.from('admin_alerts').select('id', { count: 'exact', head: true }).is('resolved_at', null),

      service.from('cron_runs').select('job_name, started_at, status').order('started_at', { ascending: false }).limit(30),

      // Open tickets — for dashboard card
      service.from('support_tickets').select('id, status, priority, assigned_to').not('status', 'in', '("closed","resolved")'),

      // Platform staff count
      service.from('profiles').select('id', { count: 'exact', head: true }).eq('platform_role', 'platform_staff'),

      // Email accounts (for attrition)
      service.from('email_accounts').select('org_id, status'),

      // Profiles (for last_active via auth.users)
      service.from('profiles').select('id, org_id').not('org_id', 'eq', '00000000-0000-0000-0000-000000000001'),
    ])

  const rawOrgs      = orgsRes.status      === 'fulfilled' ? (orgsRes.value.data ?? [])      : []
  const pendingOrgs  = pendingRes.status   === 'fulfilled' ? (pendingRes.value.data ?? []) as PendingOrgRow[] : []
  const rawTransfers = transfersRes.status === 'fulfilled' ? (transfersRes.value.data ?? []) : []
  const alertCount   = alertsRes.status    === 'fulfilled' ? (alertsRes.value.count ?? 0)    : 0
  const cronRuns     = cronRes.status      === 'fulfilled' ? (cronRes.value.data ?? [])       : []
  const openTickets  = ticketsRes.status   === 'fulfilled' ? (ticketsRes.value.data ?? [])    : []
  const staffCount   = staffCountRes.status === 'fulfilled' ? (staffCountRes.value.count ?? 0) : 0
  const emailAccs    = emailRes.status     === 'fulfilled' ? (emailRes.value.data ?? [])      : []
  const allProfiles  = profilesRes.status  === 'fulfilled' ? (profilesRes.value.data ?? [])  : []

  // Build last-active map via auth.users
  const profileIds = allProfiles.map(p => p.id)
  const profileOrgMap = new Map<string, string[]>()
  for (const p of allProfiles) {
    if (!profileOrgMap.has(p.org_id)) profileOrgMap.set(p.org_id, [])
    profileOrgMap.get(p.org_id)!.push(p.id)
  }
  const lastSignInMap = new Map<string, string>()
  if (profileIds.length > 0) {
    const { data: { users } } = await service.auth.admin.listUsers({ perPage: 1000 })
    for (const u of users ?? []) {
      if (u.last_sign_in_at) lastSignInMap.set(u.id, u.last_sign_in_at)
    }
  }
  const orgLastActiveMap = new Map<string, string>()
  for (const [orgId, ids] of profileOrgMap) {
    let latest: string | null = null
    for (const pid of ids) {
      const t = lastSignInMap.get(pid)
      if (t && (!latest || t > latest)) latest = t
    }
    if (latest) orgLastActiveMap.set(orgId, latest)
  }

  const emailMap = new Map<string, boolean>()
  for (const ea of emailAccs) { if (ea.status === 'active') emailMap.set(ea.org_id, true) }

  // Approved orgs (exclude sentinel + pending)
  const approvedRows = rawOrgs.filter(o =>
    o.id !== '00000000-0000-0000-0000-000000000001' && !!o.approved_at
  )

  // Compute attrition for all approved orgs
  type TierCount = { critical: number; at_risk: number; healthy: number; totalScore: number }
  const tierCounts: TierCount = { critical: 0, at_risk: 0, healthy: 0, totalScore: 0 }
  let neverLoggedIn = 0
  let dormant30 = 0

  for (const org of approvedRows) {
    const s = Array.isArray(org.org_settings) ? org.org_settings[0] : org.org_settings
    const quota    = s?.sms_quota ?? 1
    const msg      = s?.monthly_message_count ?? 0
    const smsUsedPct = quota > 0 ? Math.round((msg / quota) * 100) : 0
    const lastActive = orgLastActiveMap.get(org.id) ?? null
    const trialDaysLeft = org.trial_ends_at
      ? Math.ceil((new Date(org.trial_ends_at).getTime() - Date.now()) / 86400000) : null
    const pastDueDays = org.subscription_status === 'past_due' && org.current_period_end
      ? Math.floor((Date.now() - new Date(org.current_period_end).getTime()) / 86400000) : 0

    const { score, tier } = computeAttritionScore({
      subscription_status:   org.subscription_status,
      last_active_at:        lastActive,
      has_active_email:      emailMap.get(org.id) ?? false,
      onboarding_done:       !!s?.onboarding_completed_at,
      sms_used_pct:          smsUsedPct,
      monthly_message_count: msg,
      tickets_open:          0,
      past_due_days:         pastDueDays,
      trial_days_left:       trialDaysLeft,
    })

    tierCounts[tier]++
    tierCounts.totalScore += score

    if (!lastActive) neverLoggedIn++
    else {
      const days = (Date.now() - new Date(lastActive).getTime()) / 86400000
      if (days >= 30) dormant30++
    }
  }

  const avgHealthScore = approvedRows.length > 0
    ? Math.round(tierCounts.totalScore / approvedRows.length)
    : 0

  // Ticket metrics
  const urgentHigh = openTickets.filter(t => t.priority === 'urgent' || t.priority === 'high').length
  const unassigned = openTickets.filter(t => !t.assigned_to).length

  // Revenue
  const total    = approvedRows.length
  const active   = approvedRows.filter(o => o.subscription_status === 'active').length
  const trialing = approvedRows.filter(o => o.subscription_status === 'trialing').length
  const pastDue  = approvedRows.filter(o => o.subscription_status === 'past_due').length
  const suspended = approvedRows.filter(o => !!o.suspended_at).length
  const mrr = approvedRows
    .filter(o => o.subscription_status === 'active')
    .reduce((sum, o) => sum + (PLAN_MRR[o.plan] ?? 0), 0)

  // Cron health
  const CRON_JOBS = ['check-tasks', 'sync-leads', 'poll-reviews']
  const cronStatus = CRON_JOBS.map(job => {
    const latest = cronRuns.find(r => r.job_name === job)
    const stale  = latest ? (Date.now() - new Date(latest.started_at).getTime()) > 25 * 3600000 : true
    return { job, latest, stale }
  })

  // Transfers enrichment
  let pendingTransfers: Parameters<typeof PendingTransferQueue>[0]['transfers'] = []
  if (rawTransfers.length > 0) {
    const profileIds2 = Array.from(new Set([
      ...rawTransfers.map(t => t.initiated_by),
      ...rawTransfers.map(t => t.new_owner_user_id).filter(Boolean),
    ])) as string[]
    const orgIds = Array.from(new Set(rawTransfers.map(t => t.org_id)))
    const [profilesRes2, orgNamesRes] = await Promise.allSettled([
      service.from('profiles').select('id, full_name, email').in('id', profileIds2),
      service.from('organizations').select('id, name').in('id', orgIds),
    ])
    const profileMap = Object.fromEntries(
      (profilesRes2.status === 'fulfilled' ? profilesRes2.value.data ?? [] : []).map(p => [p.id, p])
    )
    const orgNameMap = Object.fromEntries(
      (orgNamesRes.status === 'fulfilled' ? orgNamesRes.value.data ?? [] : []).map(o => [o.id, o.name])
    )
    pendingTransfers = rawTransfers.map(t => ({
      id: t.id, org_name: orgNameMap[t.org_id] ?? 'Unknown',
      status: t.status as 'pending_claim' | 'pending_approval',
      new_owner_email: t.new_owner_email,
      initiated_by_name: profileMap[t.initiated_by]?.full_name ?? 'Unknown',
      initiated_by_email: profileMap[t.initiated_by]?.email ?? '',
      new_owner_name: t.new_owner_user_id ? (profileMap[t.new_owner_user_id]?.full_name ?? null) : null,
      new_owner_account_email: t.new_owner_user_id ? (profileMap[t.new_owner_user_id]?.email ?? null) : null,
      data_snapshot: t.data_snapshot as Parameters<typeof PendingTransferQueue>[0]['transfers'][0]['data_snapshot'],
      created_at: t.created_at, token_expires_at: t.token_expires_at,
    }))
  }

  // Weekly signup trend — last 8 weeks
  const nowMs = Date.now()
  const weeklySignups = Array.from({ length: 8 }, (_, i) => {
    const start = nowMs - (8 - i) * 7 * 86400000
    const end   = nowMs - (7 - i) * 7 * 86400000
    const label = new Date(start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    const count = approvedRows.filter(o => {
      const t = new Date(o.created_at).getTime()
      return t >= start && t < end
    }).length
    return { label, count }
  })
  const maxWeeklyCount = Math.max(...weeklySignups.map(w => w.count), 1)

  // Plan distribution for MRR
  const planGroups: Record<string, { count: number; mrr: number; color: string }> = {
    tier2: { count: 0, mrr: 0, color: '#7c3aed' },
    tier1: { count: 0, mrr: 0, color: '#2563eb' },
    other: { count: 0, mrr: 0, color: '#9ca3af' },
  }
  for (const o of approvedRows.filter(x => x.subscription_status === 'active')) {
    const key = o.plan === 'tier1' ? 'tier1' : o.plan === 'tier2' ? 'tier2' : 'other'
    planGroups[key].count++
    planGroups[key].mrr += PLAN_MRR[o.plan] ?? 0
  }

  // Tier bar widths
  const tierTotal = Math.max(approvedRows.length, 1)

  return (
    <div>
      <TopBar title="Admin Dashboard" />
      <div className="px-4 py-4 lg:px-6 space-y-6">

        {/* Alert banner */}
        {alertCount > 0 && (
          <Link href="/admin/alerts"
            className="flex items-center justify-between gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 hover:bg-red-100 transition-colors">
            <p className="text-sm font-medium text-red-700">
              {alertCount} platform alert{alertCount !== 1 ? 's' : ''} need attention
            </p>
            <span className="text-xs text-red-600">View →</span>
          </Link>
        )}

        {/* Revenue summary strip */}
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
          {[
            { label: 'Total Dealers', value: total },
            { label: 'Active',        value: active },
            { label: 'Trialing',      value: trialing },
            { label: 'Past Due',      value: pastDue,  red: pastDue > 0 },
            { label: 'Est. MRR',      value: `$${mrr.toLocaleString()}` },
            { label: 'Pending Approval', value: pendingOrgs.length, orange: pendingOrgs.length > 0 },
          ].map(({ label, value, red, orange }) => (
            <div key={label} className={`rounded-xl border p-4 ${
              red ? 'border-red-200 bg-red-50' : orange ? 'border-orange-200 bg-orange-50' : 'bg-card'
            }`}>
              <p className={`text-2xl font-bold ${red ? 'text-red-700' : orange ? 'text-orange-700' : ''}`}>{value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
            </div>
          ))}
          {suspended > 0 && (
            <div className="rounded-xl border border-orange-200 bg-orange-50 p-4">
              <p className="text-2xl font-bold text-orange-700">{suspended}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Suspended</p>
            </div>
          )}
        </div>

        {/* Metric cards — replaces dead button links */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

          {/* Retention card */}
          <Link href="/admin/retention"
            className="rounded-xl border bg-card p-4 hover:bg-accent/50 transition-colors group">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-purple-100 flex items-center justify-center">
                  <TrendingDown className="h-4 w-4 text-purple-600" />
                </div>
                <span className="text-sm font-semibold">Retention</span>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Avg health score</span>
                <span className={`font-bold text-sm ${avgHealthScore >= 65 ? 'text-green-600' : avgHealthScore >= 35 ? 'text-yellow-600' : 'text-red-600'}`}>
                  {avgHealthScore}/100
                </span>
              </div>
              {/* Tier distribution bar */}
              <div className="h-2 rounded-full overflow-hidden flex gap-0.5">
                <div className="h-full bg-red-500 rounded-l-full" style={{ width: `${(tierCounts.critical / tierTotal) * 100}%` }} />
                <div className="h-full bg-yellow-500" style={{ width: `${(tierCounts.at_risk / tierTotal) * 100}%` }} />
                <div className="h-full bg-green-500 rounded-r-full flex-1" />
              </div>
              <div className="grid grid-cols-3 text-center gap-1">
                <div>
                  <p className="text-sm font-bold text-red-600">{tierCounts.critical}</p>
                  <p className="text-[10px] text-muted-foreground">Critical</p>
                </div>
                <div>
                  <p className="text-sm font-bold text-yellow-600">{tierCounts.at_risk}</p>
                  <p className="text-[10px] text-muted-foreground">At Risk</p>
                </div>
                <div>
                  <p className="text-sm font-bold text-green-600">{tierCounts.healthy}</p>
                  <p className="text-[10px] text-muted-foreground">Healthy</p>
                </div>
              </div>
              {(neverLoggedIn + dormant30 > 0) && (
                <p className="text-[10px] text-orange-600 font-medium">
                  {neverLoggedIn > 0 ? `${neverLoggedIn} never logged in` : ''}
                  {neverLoggedIn > 0 && dormant30 > 0 ? ' · ' : ''}
                  {dormant30 > 0 ? `${dormant30} dormant 30d+` : ''}
                </p>
              )}
            </div>
          </Link>

          {/* Tickets card */}
          <Link href="/admin/tickets"
            className="rounded-xl border bg-card p-4 hover:bg-accent/50 transition-colors group">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-blue-100 flex items-center justify-center">
                  <TicketCheck className="h-4 w-4 text-blue-600" />
                </div>
                <span className="text-sm font-semibold">Support</span>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
            </div>
            <div className="space-y-2">
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-bold">{openTickets.length}</span>
                <span className="text-xs text-muted-foreground">open tickets</span>
              </div>
              <div className="space-y-1">
                {urgentHigh > 0 && (
                  <div className="flex items-center gap-1.5">
                    <AlertTriangle className="h-3 w-3 text-red-500 shrink-0" />
                    <span className="text-xs text-red-600 font-medium">{urgentHigh} urgent/high priority</span>
                  </div>
                )}
                {unassigned > 0 && (
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3 w-3 text-orange-500 shrink-0" />
                    <span className="text-xs text-orange-600">{unassigned} unassigned</span>
                  </div>
                )}
                {openTickets.length === 0 && (
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />
                    <span className="text-xs text-green-600">All clear</span>
                  </div>
                )}
              </div>
            </div>
          </Link>

          {/* Revenue card */}
          <Link href="/admin/analytics"
            className="rounded-xl border bg-card p-4 hover:bg-accent/50 transition-colors group">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-green-100 flex items-center justify-center">
                  <DollarSign className="h-4 w-4 text-green-600" />
                </div>
                <span className="text-sm font-semibold">Revenue</span>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
            </div>
            <div className="space-y-2">
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-bold">${mrr.toLocaleString()}</span>
                <span className="text-xs text-muted-foreground">est. MRR</span>
              </div>
              <div className="space-y-1 text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>{active} active paying</span>
                  <span className="font-medium text-foreground">{active > 0 ? `$${Math.round(mrr / active)}/avg` : '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span>{trialing} trialing</span>
                  <span className={`font-medium ${pastDue > 0 ? 'text-red-600' : 'text-foreground'}`}>
                    {pastDue > 0 ? `${pastDue} past due` : 'no past due'}
                  </span>
                </div>
              </div>
            </div>
          </Link>

          {/* Team card */}
          <Link href="/admin/staff"
            className="rounded-xl border bg-card p-4 hover:bg-accent/50 transition-colors group">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-slate-100 flex items-center justify-center">
                  <Users className="h-4 w-4 text-slate-600" />
                </div>
                <span className="text-sm font-semibold">Team</span>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
            </div>
            <div className="space-y-2">
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-bold">{staffCount}</span>
                <span className="text-xs text-muted-foreground">staff members</span>
              </div>
              <div className="space-y-1 text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>Unassigned dealers</span>
                  <span className="font-medium text-foreground">{approvedRows.length - approvedRows.filter(() => false).length}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Building2 className="h-3 w-3 shrink-0" />
                  <span>{total} total dealerships</span>
                </div>
              </div>
            </div>
          </Link>

        </div>

        {/* Growth charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Weekly dealer signups */}
          <div className="rounded-xl border bg-card p-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Dealer Signups — Last 8 Weeks</p>
            <div className="flex items-end gap-1.5 h-24">
              {weeklySignups.map((w, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
                  {/* Tooltip */}
                  {w.count > 0 && (
                    <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] font-bold text-foreground opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
                      {w.count}
                    </span>
                  )}
                  <div
                    className={`w-full rounded-t transition-all ${
                      i === weeklySignups.length - 1 ? 'bg-blue-500' : 'bg-blue-200 hover:bg-blue-400'
                    }`}
                    style={{ height: `${Math.max((w.count / maxWeeklyCount) * 88, w.count > 0 ? 6 : 2)}px` }}
                    title={`${w.label}: ${w.count} signup${w.count !== 1 ? 's' : ''}`}
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-1.5">
              <span className="text-[10px] text-muted-foreground">{weeklySignups[0]?.label}</span>
              <span className="text-[10px] text-muted-foreground">This week</span>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Total approved: <span className="font-semibold text-foreground">{total}</span>
              {weeklySignups[weeklySignups.length - 1].count > 0 && (
                <span className="ml-2 text-blue-600">+{weeklySignups[weeklySignups.length - 1].count} this week</span>
              )}
            </p>
          </div>

          {/* MRR plan mix */}
          <div className="rounded-xl border bg-card p-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">MRR Breakdown</p>
            {mrr === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No active subscriptions yet</p>
            ) : (
              <>
                {/* Stacked bar */}
                <div className="h-6 rounded-lg overflow-hidden flex gap-px mb-3">
                  {planGroups.tier2.mrr > 0 && (
                    <div
                      className="h-full bg-purple-500 flex items-center justify-center"
                      style={{ width: `${(planGroups.tier2.mrr / mrr) * 100}%` }}
                      title={`Tier 2: $${planGroups.tier2.mrr.toLocaleString()}/mo`}
                    >
                      {planGroups.tier2.mrr / mrr > 0.12 && (
                        <span className="text-[10px] font-bold text-white">T2</span>
                      )}
                    </div>
                  )}
                  {planGroups.tier1.mrr > 0 && (
                    <div
                      className="h-full bg-blue-500 flex items-center justify-center"
                      style={{ width: `${(planGroups.tier1.mrr / mrr) * 100}%` }}
                      title={`Tier 1: $${planGroups.tier1.mrr.toLocaleString()}/mo`}
                    >
                      {planGroups.tier1.mrr / mrr > 0.12 && (
                        <span className="text-[10px] font-bold text-white">T1</span>
                      )}
                    </div>
                  )}
                  {planGroups.other.mrr > 0 && (
                    <div
                      className="h-full bg-gray-300 flex-1"
                      title={`Other: $${planGroups.other.mrr.toLocaleString()}/mo`}
                    />
                  )}
                </div>
                {/* Legend */}
                <div className="space-y-1.5">
                  {[
                    { key: 'tier2', label: 'Tier 2 (Voice)', color: 'bg-purple-500' },
                    { key: 'tier1', label: 'Tier 1 (Base)',  color: 'bg-blue-500' },
                    { key: 'other', label: 'Other',          color: 'bg-gray-300' },
                  ].filter(({ key }) => planGroups[key].count > 0).map(({ key, label, color }) => (
                    <div key={key} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className={`inline-block h-2.5 w-2.5 rounded-sm ${color}`} />
                        <span className="text-muted-foreground">{label}</span>
                      </div>
                      <div className="text-right">
                        <span className="font-semibold">${planGroups[key].mrr.toLocaleString()}/mo</span>
                        <span className="text-muted-foreground ml-1.5">{planGroups[key].count} dealers</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-2 pt-2 border-t flex justify-between text-xs">
                  <span className="text-muted-foreground">Total MRR</span>
                  <span className="font-bold text-green-600">${mrr.toLocaleString()}/mo</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Cron health */}
        <section>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Cron Jobs</p>
          <div className="rounded-xl border bg-card divide-y">
            {cronStatus.map(({ job, latest, stale }) => (
              <div key={job} className="flex items-center justify-between px-3 py-2.5 gap-3">
                <div className="flex items-center gap-2">
                  <span className={`inline-block h-2 w-2 rounded-full shrink-0 ${
                    !latest ? 'bg-gray-400' : stale ? 'bg-red-500' : latest.status === 'error' ? 'bg-red-500' : 'bg-green-500'
                  }`} />
                  <span className="text-xs font-medium">{job}</span>
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {latest ? humanizeAgo(latest.started_at) : 'Never ran'}
                  {latest?.status === 'error' && ' · error'}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Pending queues */}
        {pendingOrgs.length > 0 && <PendingApprovalQueue orgs={pendingOrgs} />}
        {pendingTransfers.length > 0 && <PendingTransferQueue transfers={pendingTransfers} />}

        {/* All dealerships table */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">All Dealerships</p>
            <Link href="/admin/orgs" className="text-xs text-primary hover:underline flex items-center gap-1">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          {/* Mobile cards */}
          <div className="lg:hidden space-y-2">
            {approvedRows.slice(0, 10).map(org => {
              const status = org.subscription_status ?? null
              const billingDate = status === 'trialing' ? org.trial_ends_at ?? null : org.current_period_end ?? null
              return (
                <Link key={org.id} href={`/admin/orgs/${org.id}`}
                  className="flex items-center gap-3 rounded-xl border bg-card p-4 active:opacity-70">
                  <HealthDot score={0} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-sm truncate">{org.name || 'Unnamed'}</p>
                      <StatusBadge status={status} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatDate(billingDate)}
                    </p>
                  </div>
                </Link>
              )
            })}
            {approvedRows.length > 10 && (
              <Link href="/admin/orgs" className="block text-center text-sm text-primary py-2 hover:underline">
                View all {approvedRows.length} dealerships →
              </Link>
            )}
          </div>

          {/* Desktop table */}
          <div className="hidden lg:block">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b text-xs text-muted-foreground font-medium">
                  <th className="py-2 w-5" />
                  <th className="py-2 text-left">Name</th>
                  <th className="py-2 text-left">Status</th>
                  <th className="py-2 text-left">Plan</th>
                  <th className="py-2 text-left">Last Active</th>
                  <th className="py-2 text-left">Billing</th>
                </tr>
              </thead>
              <tbody>
                {approvedRows.slice(0, 20).map(org => {
                  const status = org.subscription_status ?? null
                  const billingDate = status === 'trialing' ? org.trial_ends_at ?? null : org.current_period_end ?? null
                  const lastActive = orgLastActiveMap.get(org.id) ?? null
                  return (
                    <tr key={org.id} className="border-b hover:bg-accent/40 transition-colors">
                      <td className="py-2.5 pr-3"><HealthDot score={0} /></td>
                      <td className="py-2.5 pr-4">
                        <Link href={`/admin/orgs/${org.id}`} className="font-medium hover:text-primary">
                          {org.suspended_at && <span className="text-[10px] mr-1 px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700">Susp.</span>}
                          {org.name || 'Unnamed'}
                        </Link>
                      </td>
                      <td className="py-2.5 pr-4"><StatusBadge status={status} /></td>
                      <td className="py-2.5 pr-4 text-muted-foreground uppercase text-xs">{org.plan}</td>
                      <td className="py-2.5 pr-4 text-xs text-muted-foreground">{humanizeAgo(lastActive)}</td>
                      <td className="py-2.5 text-xs text-muted-foreground">{formatDate(billingDate)}</td>
                    </tr>
                  )
                })}
                {approvedRows.length === 0 && (
                  <tr><td colSpan={6} className="py-8 text-center text-sm text-muted-foreground">No organizations found.</td></tr>
                )}
              </tbody>
            </table>
            {approvedRows.length > 20 && (
              <div className="py-3 text-center">
                <Link href="/admin/orgs" className="text-sm text-primary hover:underline">
                  View all {approvedRows.length} dealerships →
                </Link>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
