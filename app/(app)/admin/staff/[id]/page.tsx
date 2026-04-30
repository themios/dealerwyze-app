import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { requireProfile } from '@/lib/auth/profile'
import { requirePlatformSuperAdmin } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/service'
import TopBar from '@/components/layout/TopBar'
import {
  Mail, Clock, Shield, TicketCheck, Building2,
  ArrowLeft, AlertCircle, ChevronRight,
} from 'lucide-react'

export const dynamic = 'force-dynamic'

function humanizeAgo(dateStr: string | null, nowMs: number): string {
  if (!dateStr) return 'Never'
  const days = Math.floor((nowMs - new Date(dateStr).getTime()) / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return '1d ago'
  if (days < 30)  return `${days}d ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}yr ago`
}

function formatDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const PRIORITY_COLOR: Record<string, string> = {
  urgent: 'text-red-600 bg-red-50 border-red-200',
  high:   'text-orange-600 bg-orange-50 border-orange-200',
  normal: 'text-blue-600 bg-blue-50 border-blue-200',
  low:    'text-gray-600 bg-gray-50 border-gray-200',
}

export default async function StaffDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const profile = await requireProfile()
  const denied  = await requirePlatformSuperAdmin(profile.id)
  if (denied) redirect('/admin')

  const renderNow = new Date()
  const renderNowMs = renderNow.getTime()
  const service = createServiceClient()

  const { data: staffProfile } = await service
    .from('profiles')
    .select('id, display_name, created_at, platform_role')
    .eq('id', id)
    .eq('platform_role', 'platform_staff')
    .maybeSingle()

  if (!staffProfile) notFound()

  const { data: { user: authUser } } = await service.auth.admin.getUserById(id)

  // Tickets assigned to this staff member
  const { data: tickets } = await service
    .from('support_tickets')
    .select('id, subject, status, priority, created_at, updated_at, org_id')
    .eq('assigned_to', id)
    .order('updated_at', { ascending: false })
    .limit(25)

  // Orgs assigned to this staff member (graceful if migration 060 pending)
  let assignedOrgs: { id: string; name: string; subscription_status: string | null; created_at: string }[] = []
  try {
    const { data } = await service
      .from('organizations')
      .select('id, name, subscription_status, created_at')
      .eq('assigned_staff_id', id)
      .order('name', { ascending: true })
      .limit(100)
    assignedOrgs = data ?? []
  } catch { /* migration 060 pending */ }

  const openTickets   = (tickets ?? []).filter(t => t.status !== 'closed' && t.status !== 'resolved')
  const closedTickets = (tickets ?? []).filter(t => t.status === 'closed' || t.status === 'resolved')
  const lastSignIn    = authUser?.last_sign_in_at ?? null
  const daysInactive  = lastSignIn
    ? Math.floor((renderNowMs - new Date(lastSignIn).getTime()) / 86400000)
    : 999

  return (
    <div>
      <TopBar title={staffProfile.display_name} />
      <div className="px-4 py-4 lg:px-6 space-y-6 max-w-2xl">

        <Link href="/admin/staff" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
          Back to Staff
        </Link>

        {/* Profile card */}
        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-start gap-4">
            <div className="h-14 w-14 rounded-full bg-[#0D2B55] flex items-center justify-center shrink-0">
              <Shield className="h-7 w-7 text-white/80" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-bold leading-tight">{staffProfile.display_name}</h1>
              {authUser?.email && (
                <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-0.5">
                  <Mail className="h-3.5 w-3.5 shrink-0" />
                  {authUser.email}
                </p>
              )}
              <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-1">
                <Clock className="h-3 w-3 shrink-0" />
                Joined {formatDate(staffProfile.created_at)} · Last login {humanizeAgo(lastSignIn, renderNowMs)}
              </p>
              {daysInactive > 14 && (
                <p className="text-xs text-orange-600 flex items-center gap-1 mt-1">
                  <AlertCircle className="h-3 w-3" />
                  Inactive {daysInactive} days
                </p>
              )}
            </div>
          </div>

          {/* Stat grid */}
          <div className="mt-4 grid grid-cols-3 gap-3">
            <div className="rounded-lg bg-muted/50 p-3 text-center">
              <p className="text-xl font-bold">{assignedOrgs.length}</p>
              <p className="text-xs text-muted-foreground">Assigned orgs</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-3 text-center">
              <p className="text-xl font-bold">{closedTickets.length}</p>
              <p className="text-xs text-muted-foreground">Tickets closed</p>
            </div>
            <div className={`rounded-lg p-3 text-center ${openTickets.length > 0 ? 'bg-orange-50' : 'bg-muted/50'}`}>
              <p className={`text-xl font-bold ${openTickets.length > 0 ? 'text-orange-600' : ''}`}>{openTickets.length}</p>
              <p className="text-xs text-muted-foreground">Tickets open</p>
            </div>
          </div>
        </div>

        {/* Assigned Dealerships */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Assigned Dealerships ({assignedOrgs.length})
            </p>
            <Link href="/admin/orgs" className="text-xs text-primary hover:underline flex items-center gap-1">
              <Building2 className="h-3 w-3" />
              Manage assignments
            </Link>
          </div>

          {assignedOrgs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No dealerships assigned yet. Go to <Link href="/admin/orgs" className="text-primary hover:underline">Dealerships</Link> to assign.</p>
          ) : (
            <div className="rounded-xl border bg-card divide-y">
              {assignedOrgs.map(org => (
                <Link
                  key={org.id}
                  href={`/admin/orgs/${org.id}`}
                  className="flex items-center justify-between px-4 py-3 hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-sm font-medium truncate">{org.name}</span>
                  </div>
                  <div className="flex items-center gap-2 ml-3 shrink-0">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                      org.subscription_status === 'active'   ? 'bg-green-100 text-green-700' :
                      org.subscription_status === 'trialing' ? 'bg-blue-100 text-blue-700' :
                      org.subscription_status === 'past_due' ? 'bg-red-100 text-red-700' :
                      'bg-gray-100 text-gray-500'
                    }`}>
                      {(org.subscription_status ?? 'unknown').replace('_', ' ')}
                    </span>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Tickets */}
        <section>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            <span className="flex items-center gap-1.5">
              <TicketCheck className="h-3.5 w-3.5" />
              Assigned Tickets ({(tickets ?? []).length})
            </span>
          </p>

          {(tickets ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No tickets assigned yet.</p>
          ) : (
            <div className="rounded-xl border bg-card divide-y">
              {(tickets ?? []).map(t => (
                <Link
                  key={t.id}
                  href={`/admin/tickets/${t.id}`}
                  className="flex items-center justify-between px-4 py-3 hover:bg-accent/50 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{t.subject}</p>
                    <p className="text-[10px] text-muted-foreground">Updated {humanizeAgo(t.updated_at, renderNowMs)}</p>
                  </div>
                  <div className="flex items-center gap-2 ml-3 shrink-0">
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${PRIORITY_COLOR[t.priority] ?? PRIORITY_COLOR.normal}`}>
                      {t.priority}
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                      t.status === 'closed' || t.status === 'resolved'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-blue-100 text-blue-700'
                    }`}>
                      {t.status}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Actions */}
        <div className="flex flex-wrap gap-3">
          <Link
            href={`/admin/tickets?assigned_to=${id}`}
            className="px-4 py-2 rounded-lg border bg-card text-sm font-medium hover:bg-accent transition-colors"
          >
            All Tickets
          </Link>
          <Link
            href={`/admin/orgs?staff=${id}`}
            className="px-4 py-2 rounded-lg border bg-card text-sm font-medium hover:bg-accent transition-colors"
          >
            Assigned Dealerships
          </Link>
          {authUser?.email && (
            <a
              href={`mailto:${authUser.email}`}
              className="px-4 py-2 rounded-lg border bg-card text-sm font-medium hover:bg-accent transition-colors"
            >
              Send Email
            </a>
          )}
        </div>

      </div>
    </div>
  )
}
