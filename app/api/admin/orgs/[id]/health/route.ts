import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { canAccessAdminArea } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

function humanizeAgo(dateStr: string | null): string | null {
  if (!dateStr) return null
  const ms = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(ms / 60000)
  if (mins < 2) return 'Just now'
  if (mins < 60) return `${mins} minutes ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} hours ago`
  const days = Math.floor(hrs / 24)
  return `${days} days ago`
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: orgId } = await params
  const profile = await requireProfile()
  if (!(await canAccessAdminArea(profile.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Service role required: cross-tenant admin observability (recovery archive + auth admin).
  const service = createServiceClient()

  const { data: orgProfiles } = await service
    .from('profiles')
    .select('id')
    .eq('org_id', orgId)

  let lastActiveAt: string | null = null
  if ((orgProfiles ?? []).length > 0) {
    const ids = new Set((orgProfiles ?? []).map(p => p.id))
    const { data: { users } } = await service.auth.admin.listUsers({ perPage: 1000 })
    for (const u of users ?? []) {
      if (!ids.has(u.id)) continue
      if (u.last_sign_in_at && (!lastActiveAt || u.last_sign_in_at > lastActiveAt)) {
        lastActiveAt = u.last_sign_in_at
      }
    }
  }

  // Recovery pending count + oldest expiry across all archive tables
  const tables = ['deleted_customers', 'deleted_activities', 'deleted_vehicles', 'deleted_ledger_transactions'] as const
  let pendingCount = 0
  let oldestExpires: string | null = null

  for (const t of tables) {
    const { data, count } = await service
      .from(t)
      .select('expires_at', { count: 'exact' })
      .eq('org_id', orgId)
      .is('restored_at', null)
      .is('purged_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('expires_at', { ascending: true })
      .limit(1)

    pendingCount += count ?? 0
    const exp = (data?.[0]?.expires_at as string | undefined) ?? null
    if (exp && (!oldestExpires || exp < oldestExpires)) oldestExpires = exp
  }

  // Sentry per-org issues (graceful fallback)
  const sentryToken = process.env.SENTRY_AUTH_TOKEN
  const sentryOrg = process.env.SENTRY_ORG
  const sentryProj = process.env.SENTRY_PROJECT
  let sentryIssues: unknown[] = []
  let errorCount24h: number | null = null

  if (sentryToken && sentryOrg && sentryProj) {
    const headers = { Authorization: `Bearer ${sentryToken}` }
    const base = `https://sentry.io/api/0/projects/${sentryOrg}/${sentryProj}`
    const q = encodeURIComponent(`is:unresolved org_id:${orgId}`)
    sentryIssues = await fetch(`${base}/issues/?query=${q}&limit=3`, { headers })
      .then(r => r.ok ? r.json() : []).catch(() => [])
    errorCount24h = Array.isArray(sentryIssues) ? sentryIssues.length : null
  }

  return NextResponse.json({
    last_active_at: lastActiveAt,
    last_active_humanized: humanizeAgo(lastActiveAt),
    error_count_24h: errorCount24h,
    sentry_issues: sentryIssues,
    recovery_records: { pending_count: pendingCount, oldest_expires_at: oldestExpires },
  })
}

