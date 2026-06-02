import { NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { canAccessAdminArea } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/service'
import { checkAiModelHealth } from '@/lib/ai/healthCheck'

export const dynamic = 'force-dynamic'

export async function GET() {
  const profile = await requireProfile()
  if (!(await canAccessAdminArea(profile.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Service role required: platform-level org counts (cross-tenant).
  const supabase = createServiceClient()

  const [{ count: activeOrgs }, { count: activeToday }, { count: openAlerts }, aiHealth] =
    await Promise.all([
      supabase.from('organizations').select('*', { count: 'exact', head: true })
        .eq('subscription_status', 'active'),
      supabase.from('organizations').select('*', { count: 'exact', head: true })
        .gte('last_active_at', new Date(Date.now() - 86400000).toISOString()),
      supabase.from('platform_alerts').select('*', { count: 'exact', head: true })
        .eq('resolved', false),
      checkAiModelHealth(),
    ])

  const sentryToken = process.env.SENTRY_AUTH_TOKEN
  const sentryOrg = process.env.SENTRY_ORG
  const sentryProj = process.env.SENTRY_PROJECT

  let sentryIssues: unknown[] = []
  let sentryVolume: unknown[] = []
  let sentryConfigured = false

  if (sentryToken && sentryOrg && sentryProj) {
    sentryConfigured = true
    const headers = { Authorization: `Bearer ${sentryToken}` }
    const base = `https://sentry.io/api/0/projects/${sentryOrg}/${sentryProj}`
    const since = Math.floor((Date.now() - 86400000) / 1000)

    const [issuesRes, statsRes] = await Promise.all([
      fetch(`${base}/issues/?query=is:unresolved&limit=10&sort=date`, { headers })
        .then(r => r.ok ? r.json() : [])
        .catch((err) => {
          console.error('[admin/platform-health][GET] Failed fetching Sentry issues:', err)
          return []
        }),
      fetch(`${base}/stats/?stat=received&resolution=1h&since=${since}`, { headers })
        .then(r => r.ok ? r.json() : [])
        .catch((err) => {
          console.error('[admin/platform-health][GET] Failed fetching Sentry stats:', err)
          return []
        }),
    ])
    sentryIssues = issuesRes
    sentryVolume = statsRes
  }

  return NextResponse.json({
    internal: {
      activeOrgs: activeOrgs ?? 0,
      activeToday: activeToday ?? 0,
      openAlerts: openAlerts ?? 0,
    },
    sentry: { configured: sentryConfigured, org: sentryOrg ?? null, issues: sentryIssues, volume: sentryVolume },
    ai: { ok: aiHealth.ok, model: aiHealth.model, error: aiHealth.error ?? null },
  })
}

