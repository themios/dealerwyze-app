import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'
import TopBar from '@/components/layout/TopBar'

interface OrgRow {
  id: string
  name: string
  plan: string
  subscription_status: string | null
  trial_ends_at: string | null
  current_period_end: string | null
  created_at: string
  org_settings: {
    business_phone: string | null
  } | null
}

type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | string

function StatusBadge({ status }: { status: SubscriptionStatus | null }) {
  const s = status ?? 'unknown'
  const styles: Record<string, string> = {
    active: 'bg-green-100 text-green-700',
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

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default async function AdminPage() {
  const profile = await requireProfile()
  if (profile.role !== 'admin') redirect('/today')

  const supabase = createServiceClient()

  const { data: orgs } = await supabase
    .from('organizations')
    .select(`
      id,
      name,
      plan,
      subscription_status,
      trial_ends_at,
      current_period_end,
      created_at,
      org_settings (
        business_phone
      )
    `)
    .order('created_at', { ascending: false })

  const rows = (orgs ?? []) as unknown as OrgRow[]

  const total = rows.length
  const active = rows.filter(o => o.subscription_status === 'active').length
  const trialing = rows.filter(o => o.subscription_status === 'trialing').length
  const pastDue = rows.filter(o => o.subscription_status === 'past_due').length

  const summaryCards = [
    { label: 'Total Dealers', value: total },
    { label: 'Active', value: active },
    { label: 'Trialing', value: trialing },
    { label: 'Past Due', value: pastDue },
  ]

  return (
    <div>
      <TopBar title="Admin" />
      <div className="px-4 py-4 space-y-6">

        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-3">
          {summaryCards.map(({ label, value }) => (
            <div key={label} className="rounded-xl border bg-card p-4">
              <p className="text-2xl font-bold">{value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* Quick links */}
        <div className="flex gap-2">
          <Link href="/admin/tickets" className="flex-1 flex items-center justify-center gap-1.5 p-3 rounded-xl border bg-card text-sm font-medium hover:bg-accent transition-colors">
            Tickets
          </Link>
          <Link href="/admin/analytics" className="flex-1 flex items-center justify-center gap-1.5 p-3 rounded-xl border bg-card text-sm font-medium hover:bg-accent transition-colors">
            Analytics
          </Link>
          <Link href="/admin/audit-log" className="flex-1 flex items-center justify-center gap-1.5 p-3 rounded-xl border bg-card text-sm font-medium hover:bg-accent transition-colors">
            Audit Log
          </Link>
        </div>

        {/* Org list */}
        <section>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            All Dealerships
          </p>
          <div className="space-y-3">
            {rows.map(org => {
              const status = org.subscription_status ?? null
              const billingDate =
                status === 'trialing'
                  ? org.trial_ends_at ?? null
                  : org.current_period_end ?? null
              const billingLabel = status === 'trialing' ? 'Trial ends' : 'Next billing'

              return (
                <Link key={org.id} href={`/admin/orgs/${org.id}`} className="block rounded-xl border bg-card p-4 space-y-2 active:opacity-70">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-sm leading-tight">{org.name || 'Unnamed'}</p>
                    <StatusBadge status={status} />
                  </div>
                  <div className="space-y-1">
                    {org.org_settings?.business_phone && (
                      <p className="text-xs text-muted-foreground">{org.org_settings.business_phone}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {billingLabel}: {formatDate(billingDate)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Created {formatDate(org.created_at)}
                    </p>
                  </div>
                </Link>
              )
            })}

            {rows.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">No organizations found.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
