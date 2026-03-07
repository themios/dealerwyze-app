import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'
import { isPlatformSuperAdmin } from '@/lib/auth/platform'
import TopBar from '@/components/layout/TopBar'
import PendingApprovalQueue from '@/components/admin/PendingApprovalQueue'
import PendingTransferQueue from '@/components/admin/PendingTransferQueue'

export const dynamic = 'force-dynamic'

interface OrgRow {
  id: string
  name: string
  plan: string
  subscription_status: string | null
  trial_ends_at: string | null
  current_period_end: string | null
  created_at: string
  approved_at: string | null
  suspended_at: string | null
  health_score: number
  sms_used_pct: number
  last_active_at: string | null
  has_active_email: boolean
  org_settings: {
    business_phone: string | null
  } | null
}

interface PendingOrgRow {
  id: string
  name: string
  created_at: string
}

type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | string

const PLAN_MRR: Record<string, number> = {
  tier1: 150,   // Complete CRM $150
  tier2: 200,   // Voice AI $200
  tier3: 250,   // Legacy
}

function StatusBadge({ status }: { status: SubscriptionStatus | null }) {
  const s = status ?? 'unknown'
  const styles: Record<string, string> = {
    active:   'bg-green-100 text-green-700',
    trialing: 'bg-blue-100 text-blue-700',
    past_due: 'bg-red-100 text-red-700',
    canceled: 'bg-gray-100 text-gray-500',
  }
  const cls = styles[s] ?? 'bg-gray-100 text-gray-500'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {s.replace('_', ' ')}
    </span>
  )
}

function HealthDot({ score }: { score: number }) {
  const color = score >= 70 ? 'bg-green-500' : score >= 40 ? 'bg-yellow-500' : 'bg-red-500'
  return <span className={`inline-block h-2 w-2 rounded-full ${color} shrink-0`} title={`Health: ${score}`} />
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function humanizeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Never'
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return '1d ago'
  if (days < 30)  return `${days}d ago`
  return formatDate(dateStr)
}

export default async function AdminPage() {
  const profile = await requireProfile()
  const superAdmin = await isPlatformSuperAdmin(profile.id)

  // Platform staff sees only tickets
  if (!superAdmin) redirect('/admin/tickets')

  const supabase = createServiceClient()

  const [orgsResult, pendingResult, transfersResult, alertsResult, cronResult] = await Promise.allSettled([
    // Orgs from the health-enriched endpoint data (we fetch DB directly here for SSR)
    supabase
      .from('organizations')
      .select(`
        id,
        name,
        plan,
        subscription_status,
        trial_ends_at,
        current_period_end,
        created_at,
        approved_at,
        suspended_at,
        org_settings (
          business_phone
        )
      `)
      .order('created_at', { ascending: false }),

    supabase
      .from('organizations')
      .select('id, name, created_at')
      .is('approved_at', null)
      .neq('id', '00000000-0000-0000-0000-000000000001')
      .order('created_at', { ascending: true }),

    supabase
      .from('business_transfers')
      .select('id, org_id, new_owner_email, status, data_snapshot, notes, created_at, token_expires_at, initiated_by, new_owner_user_id')
      .in('status', ['pending_claim', 'pending_approval'])
      .order('created_at', { ascending: false }),

    supabase
      .from('admin_alerts')
      .select('id', { count: 'exact', head: true })
      .is('resolved_at', null),

    supabase
      .from('cron_runs')
      .select('job_name, started_at, status')
      .order('started_at', { ascending: false })
      .limit(30),
  ])

  const orgs = orgsResult.status === 'fulfilled' ? (orgsResult.value.data ?? []) as unknown as OrgRow[] : []
  const pendingOrgs = pendingResult.status === 'fulfilled' ? (pendingResult.value.data ?? []) as unknown as PendingOrgRow[] : []
  const rawTransfers = transfersResult.status === 'fulfilled' ? (transfersResult.value.data ?? []) : []
  const alertCount = alertsResult.status === 'fulfilled' ? (alertsResult.value.count ?? 0) : 0
  const cronRuns = cronResult.status === 'fulfilled' ? (cronResult.value.data ?? []) : []

  // Build latest cron run per job
  const CRON_JOBS = ['check-tasks', 'sync-leads', 'poll-reviews']
  const cronStatus = CRON_JOBS.map(job => {
    const latest = cronRuns.find(r => r.job_name === job)
    const stale = latest
      ? (Date.now() - new Date(latest.started_at).getTime()) > 25 * 3600000
      : true
    return { job, latest, stale }
  })

  // Enrich transfers with org names + profile names for the queue component
  let pendingTransfers: Parameters<typeof PendingTransferQueue>[0]['transfers'] = []
  if (rawTransfers.length > 0) {
    const profileIds = Array.from(new Set([
      ...rawTransfers.map(t => t.initiated_by),
      ...rawTransfers.map(t => t.new_owner_user_id).filter(Boolean),
    ])) as string[]
    const orgIds = Array.from(new Set(rawTransfers.map(t => t.org_id)))

    const [profilesRes, orgNamesRes] = await Promise.allSettled([
      supabase.from('profiles').select('id, full_name, email').in('id', profileIds),
      supabase.from('organizations').select('id, name').in('id', orgIds),
    ])
    const profileMap = Object.fromEntries(
      (profilesRes.status === 'fulfilled' ? profilesRes.value.data ?? [] : []).map(p => [p.id, p])
    )
    const orgNameMap = Object.fromEntries(
      (orgNamesRes.status === 'fulfilled' ? orgNamesRes.value.data ?? [] : []).map(o => [o.id, o.name])
    )
    pendingTransfers = rawTransfers.map(t => ({
      id:                      t.id,
      org_name:                orgNameMap[t.org_id] ?? 'Unknown',
      status:                  t.status as 'pending_claim' | 'pending_approval',
      new_owner_email:         t.new_owner_email,
      initiated_by_name:       profileMap[t.initiated_by]?.full_name ?? 'Unknown',
      initiated_by_email:      profileMap[t.initiated_by]?.email ?? '',
      new_owner_name:          t.new_owner_user_id ? (profileMap[t.new_owner_user_id]?.full_name ?? null) : null,
      new_owner_account_email: t.new_owner_user_id ? (profileMap[t.new_owner_user_id]?.email ?? null) : null,
      data_snapshot:           t.data_snapshot as Parameters<typeof PendingTransferQueue>[0]['transfers'][0]['data_snapshot'],
      created_at:              t.created_at,
      token_expires_at:        t.token_expires_at,
    }))
  }

  // Exclude sentinel org and pending orgs from main list
  const approvedRows = orgs.filter(o =>
    o.id !== '00000000-0000-0000-0000-000000000001' && !!o.approved_at
  )

  const total    = approvedRows.length
  const active   = approvedRows.filter(o => o.subscription_status === 'active').length
  const trialing = approvedRows.filter(o => o.subscription_status === 'trialing').length
  const pastDue  = approvedRows.filter(o => o.subscription_status === 'past_due').length
  const suspended = approvedRows.filter(o => !!o.suspended_at).length
  const mrr = approvedRows
    .filter(o => o.subscription_status === 'active')
    .reduce((sum, o) => sum + (PLAN_MRR[o.plan] ?? 0), 0)

  const summaryCards = [
    { label: 'Total Dealers', value: total },
    { label: 'Active', value: active },
    { label: 'Trialing', value: trialing },
    { label: 'Past Due', value: pastDue },
    { label: 'Est. MRR', value: `$${mrr.toLocaleString()}` },
    { label: 'Pending Approval', value: pendingOrgs.length },
  ]

  return (
    <div>
      <TopBar title="Admin" />
      <div className="px-4 py-4 lg:px-6 space-y-6">

        {/* Alert banner */}
        {alertCount > 0 && (
          <Link href="/admin/alerts" className="flex items-center justify-between gap-2 rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800 px-4 py-3 hover:bg-red-100 transition-colors">
            <p className="text-sm font-medium text-red-700 dark:text-red-400">
              {alertCount} tenant alert{alertCount !== 1 ? 's' : ''} need attention
            </p>
            <span className="text-xs text-red-600 dark:text-red-400">View →</span>
          </Link>
        )}

        {/* Summary cards */}
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
          {summaryCards.map(({ label, value }) => (
            <div key={label} className="rounded-xl border bg-card p-4">
              <p className="text-2xl font-bold">{value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
            </div>
          ))}
          {suspended > 0 && (
            <div className="rounded-xl border border-orange-200 bg-orange-50 dark:bg-orange-950/20 p-4">
              <p className="text-2xl font-bold text-orange-700">{suspended}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Suspended</p>
            </div>
          )}
        </div>

        {/* Quick links */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          <Link href="/admin/tickets" className="flex items-center justify-center gap-1.5 p-3 rounded-xl border bg-card text-sm font-medium hover:bg-accent transition-colors">
            Tickets
          </Link>
          <Link href="/admin/analytics" className="flex items-center justify-center gap-1.5 p-3 rounded-xl border bg-card text-sm font-medium hover:bg-accent transition-colors">
            Analytics
          </Link>
          <Link href="/admin/audit-log" className="flex items-center justify-center gap-1.5 p-3 rounded-xl border bg-card text-sm font-medium hover:bg-accent transition-colors">
            Audit Log
          </Link>
          <Link href="/admin/team" className="flex items-center justify-center gap-1.5 p-3 rounded-xl border bg-card text-sm font-medium hover:bg-accent transition-colors">
            Platform Team
          </Link>
        </div>

        {/* Cron health widget */}
        <section>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Cron Jobs
          </p>
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

        {/* Pending approval queue */}
        {pendingOrgs.length > 0 && (
          <PendingApprovalQueue orgs={pendingOrgs} />
        )}

        {/* Pending ownership transfers */}
        {pendingTransfers.length > 0 && (
          <PendingTransferQueue transfers={pendingTransfers} />
        )}

        {/* Approved org list */}
        <section>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            All Dealerships
          </p>

          {/* Mobile cards */}
          <div className="lg:hidden space-y-2">
            {approvedRows.map(org => {
              const status = org.subscription_status ?? null
              const billingDate = status === 'trialing' ? org.trial_ends_at ?? null : org.current_period_end ?? null
              const billingLabel = status === 'trialing' ? 'Trial ends' : 'Next billing'
              const healthScore = org.health_score ?? 50
              const smsUsedPct = org.sms_used_pct ?? 0
              const lastActive = org.last_active_at ?? null
              const hasEmail = org.has_active_email ?? false
              return (
                <Link key={org.id} href={`/admin/orgs/${org.id}`} className="block rounded-xl border bg-card p-4 space-y-2 active:opacity-70">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <HealthDot score={healthScore} />
                      <p className="font-medium text-sm leading-tight truncate">{org.name || 'Unnamed'}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {org.suspended_at && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium">Suspended</span>
                      )}
                      <StatusBadge status={status} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    {smsUsedPct > 0 && (
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${smsUsedPct >= 90 ? 'bg-red-500' : smsUsedPct >= 70 ? 'bg-yellow-500' : 'bg-green-500'}`} style={{ width: `${Math.min(100, smsUsedPct)}%` }} />
                        </div>
                        <span className="text-[10px] text-muted-foreground shrink-0">{smsUsedPct}% SMS</span>
                      </div>
                    )}
                    <div className="flex items-center gap-3 flex-wrap">
                      <p className="text-xs text-muted-foreground">Active: {humanizeAgo(lastActive)}</p>
                      {!hasEmail && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-yellow-50 border border-yellow-200 text-yellow-700">No Email</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{billingLabel}: {formatDate(billingDate)}</p>
                  </div>
                </Link>
              )
            })}
            {approvedRows.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">No organizations found.</p>
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
                  <th className="py-2 text-left">SMS Usage</th>
                  <th className="py-2 text-left">Last Active</th>
                  <th className="py-2 text-left">Billing</th>
                </tr>
              </thead>
              <tbody>
                {approvedRows.map(org => {
                  const status = org.subscription_status ?? null
                  const billingDate = status === 'trialing' ? org.trial_ends_at ?? null : org.current_period_end ?? null
                  const healthScore = org.health_score ?? 50
                  const smsUsedPct = org.sms_used_pct ?? 0
                  const lastActive = org.last_active_at ?? null
                  const hasEmail = org.has_active_email ?? false
                  return (
                    <tr key={org.id} className="border-b hover:bg-accent/40 transition-colors">
                      <td className="py-2.5 pr-3"><HealthDot score={healthScore} /></td>
                      <td className="py-2.5 pr-4">
                        <Link href={`/admin/orgs/${org.id}`} className="font-medium hover:text-primary flex items-center gap-1.5">
                          {org.suspended_at && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium">Suspended</span>}
                          {!hasEmail && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-yellow-50 border border-yellow-200 text-yellow-700">No Email</span>}
                          {org.name || 'Unnamed'}
                        </Link>
                      </td>
                      <td className="py-2.5 pr-4"><StatusBadge status={status} /></td>
                      <td className="py-2.5 pr-4 text-muted-foreground uppercase text-xs">{org.plan}</td>
                      <td className="py-2.5 pr-4">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${smsUsedPct >= 90 ? 'bg-red-500' : smsUsedPct >= 70 ? 'bg-yellow-500' : 'bg-green-500'}`} style={{ width: `${Math.min(100, smsUsedPct)}%` }} />
                          </div>
                          <span className="text-xs text-muted-foreground">{smsUsedPct}%</span>
                        </div>
                      </td>
                      <td className="py-2.5 pr-4 text-xs text-muted-foreground">{humanizeAgo(lastActive)}</td>
                      <td className="py-2.5 text-xs text-muted-foreground">{formatDate(billingDate)}</td>
                    </tr>
                  )
                })}
                {approvedRows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-sm text-muted-foreground">No organizations found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  )
}
