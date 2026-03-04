import { NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'
import { requirePlatformSuperAdmin } from '@/lib/auth/platform'

function computeHealthScore(org: {
  subscription_status: string | null
  last_active_at:      string | null
  has_active_email:    boolean
  onboarding_done:     boolean
  sms_used_pct:        number
}): number {
  let score = 0
  if (org.subscription_status === 'active')   score += 30
  if (org.last_active_at) {
    const daysSince = (Date.now() - new Date(org.last_active_at).getTime()) / 86400000
    if (daysSince < 7)  score += 20
    else if (daysSince >= 14) score -= 20
  }
  if (org.has_active_email) score += 20
  if (org.onboarding_done)  score += 15
  if (org.sms_used_pct > 10) score += 15
  if (org.subscription_status === 'past_due') score -= 40
  return Math.max(0, Math.min(100, score))
}

export async function GET() {
  const profile = await requireProfile()
  const denied = await requirePlatformSuperAdmin(profile.id)
  if (denied) return denied

  const service = createServiceClient()

  const [{ data: orgs }, { data: emailAccounts }, { data: authUsers }] = await Promise.all([
    service
      .from('organizations')
      .select(`
        id,
        name,
        plan,
        subscription_status,
        trial_ends_at,
        current_period_end,
        approved_at,
        created_at,
        stripe_customer_id,
        suspended_at,
        org_settings (
          business_phone,
          monthly_message_count,
          sms_quota,
          onboarding_completed_at
        )
      `)
      .order('created_at', { ascending: false }),

    service
      .from('email_accounts')
      .select('org_id, status'),

    // Get last sign-in per user by joining profiles → auth.users
    service
      .from('profiles')
      .select('org_id, id'),
  ])

  // Build per-org email active map
  const emailMap = new Map<string, boolean>()
  for (const ea of emailAccounts ?? []) {
    if (ea.status === 'active') emailMap.set(ea.org_id, true)
  }

  // Build per-org latest profile map (we can't get last_sign_in from anon client,
  // but we can store a proxy: newest profile created_at as a minimum bound)
  // For last_active_at we use the most recently created profile as a proxy here.
  // A deeper join to auth.users requires a separate service admin call.
  const profileOrgMap = new Map<string, string[]>()
  for (const p of authUsers ?? []) {
    if (!profileOrgMap.has(p.org_id)) profileOrgMap.set(p.org_id, [])
    profileOrgMap.get(p.org_id)!.push(p.id)
  }

  // Fetch auth.users last_sign_in_at for all profile IDs in batch
  const allProfileIds = (authUsers ?? []).map(p => p.id)
  let lastSignInMap = new Map<string, string>()

  if (allProfileIds.length > 0) {
    // Use service role admin to list users — paginate in batches of 1000
    const { data: { users } } = await service.auth.admin.listUsers({ perPage: 1000 })
    for (const u of users ?? []) {
      if (u.last_sign_in_at) lastSignInMap.set(u.id, u.last_sign_in_at)
    }
  }

  // Compute per-org last_active_at (latest sign-in across all org members)
  const orgLastActiveMap = new Map<string, string>()
  for (const [orgId, profileIds] of profileOrgMap) {
    let latest: string | null = null
    for (const pid of profileIds) {
      const t = lastSignInMap.get(pid)
      if (t && (!latest || t > latest)) latest = t
    }
    if (latest) orgLastActiveMap.set(orgId, latest)
  }

  const result = (orgs ?? []).map(org => {
    const settings = Array.isArray(org.org_settings)
      ? org.org_settings[0]
      : org.org_settings

    const monthly  = settings?.monthly_message_count ?? 0
    const quota    = settings?.sms_quota ?? 1
    const sms_used_pct = quota > 0 ? Math.round((monthly / quota) * 100) : 0

    const last_active_at  = orgLastActiveMap.get(org.id) ?? null
    const has_active_email = emailMap.get(org.id) ?? false
    const onboarding_done  = !!settings?.onboarding_completed_at

    const health_score = computeHealthScore({
      subscription_status: org.subscription_status,
      last_active_at,
      has_active_email,
      onboarding_done,
      sms_used_pct,
    })

    return {
      id:                  org.id,
      name:                org.name,
      plan:                org.plan,
      subscription_status: org.subscription_status,
      trial_ends_at:       org.trial_ends_at ?? null,
      current_period_end:  org.current_period_end ?? null,
      approved_at:         org.approved_at ?? null,
      created_at:          org.created_at,
      stripe_customer_id:  org.stripe_customer_id ?? null,
      suspended_at:        org.suspended_at ?? null,
      business_phone:      settings?.business_phone ?? null,
      sms_used_pct,
      last_active_at,
      has_active_email,
      onboarding_done,
      health_score,
    }
  })

  return NextResponse.json(result)
}
