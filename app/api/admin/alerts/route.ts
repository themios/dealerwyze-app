import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'
import { requirePlatformArea } from '@/lib/auth/platform'
import { getAdminVerticalScope } from '@/lib/admin/verticalScope'

// These are cron dedup markers, not actionable alerts — never show in UI.
const DEDUP_PREFIXES = ['dealer_followup_', 'onboarding_nudge', 'owner_digest_sent']

function isDedup(alertType: string) {
  return DEDUP_PREFIXES.some(p => alertType.startsWith(p))
}

export async function GET(req: NextRequest) {
  const profile = await requireProfile()
  const denied = await requirePlatformArea(profile.id, 'alerts')
  if (denied) return denied

  const supabase = createServiceClient()
  const scope = await getAdminVerticalScope(req)
  if (scope.orgIds.length === 0) return NextResponse.json([])

  // ?count=1 → lightweight count-only response for badge use
  if (req.nextUrl.searchParams.get('count') === '1') {
    const { count, error } = await supabase
      .from('admin_alerts')
      .select('id', { count: 'exact', head: true })
      .is('resolved_at', null)
      .in('org_id', scope.orgIds)
    if (error) {
      console.error('[admin/alerts]', error)
      return NextResponse.json({ error: 'Failed to fetch alerts' }, { status: 500 })
    }
    return NextResponse.json({ unresolved: count ?? 0 })
  }

  const { data, error } = await supabase
    .from('admin_alerts')
    .select(`
      id, org_id, alert_type, severity, created_at, resolved_at,
      organizations(
        id, name, subscription_status, plan,
        trial_ends_at, past_due_since, last_active_at,
        monthly_message_count, sms_quota
      )
    `)
    .in('org_id', scope.orgIds)
    .is('resolved_at', null)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) {
    console.error('[admin/alerts] list', error)
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }

  const actionable = (data ?? []).filter(a => !isDedup(a.alert_type))
  if (actionable.length === 0) return NextResponse.json([])

  // Fetch dealer_admin emails for all unique orgs in one query
  const orgIds = [...new Set(actionable.map(a => a.org_id))]
  const { data: adminProfiles } = await supabase
    .from('profiles')
    .select('org_id, user_id')
    .in('org_id', orgIds)
    .in('role', ['dealer_admin', 'admin'])

  // Resolve auth emails (auth.users) for each profile
  const emailByOrg: Record<string, string> = {}
  for (const p of adminProfiles ?? []) {
    if (emailByOrg[p.org_id]) continue // already have one for this org
    const { data: authUser } = await supabase.auth.admin.getUserById(p.user_id)
    if (authUser?.user?.email) emailByOrg[p.org_id] = authUser.user.email
  }

  const result = actionable.map(a => ({
    ...a,
    admin_email: emailByOrg[a.org_id] ?? null,
  }))

  return NextResponse.json(result)
}
