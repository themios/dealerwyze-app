import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'
import { requirePlatformArea } from '@/lib/auth/platform'
import { getAdminVerticalScope } from '@/lib/admin/verticalScope'

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

export async function GET(req: NextRequest) {
  const profile = await requireProfile()
  const denied = await requirePlatformArea(profile.id, 'accounts')
  if (denied) return denied

  const service = createServiceClient()
  const scope = await getAdminVerticalScope(req)

  const [
    { data: orgs, error: orgsError },
    { data: orgSettingsRows },
    { data: emailAccounts },
    { data: authUsers },
  ] = await Promise.all([
    service
      .from('organizations')
      .select('id, name, plan, subscription_status, trial_ends_at, current_period_end, approved_at, created_at, stripe_customer_id, suspended_at, sms_plan, sms_quota, monthly_message_count, last_active_at, vertical')
      .in('id', scope.orgIds)
      .order('created_at', { ascending: false }),

    service
      .from('org_settings')
      .select('org_id, business_phone, onboarding_completed_at, dealer_website_url'),

    service
      .from('email_accounts')
      .select('org_id, status'),

    // Get profiles to map org_id → user ids (admin = org owner)
    service
      .from('profiles')
      .select('org_id, id, role'),
  ])

  if (orgsError) {
    console.error('[admin/orgs] orgs query error:', orgsError)
    return NextResponse.json({ error: 'Failed to load dealerships', detail: orgsError.message }, { status: 500 })
  }

  // Build org_settings lookup map
  const settingsMap = new Map<string, { business_phone: string | null; onboarding_completed_at: string | null; dealer_website_url: string | null }>()
  for (const s of orgSettingsRows ?? []) {
    settingsMap.set(s.org_id, s)
  }

  // Build per-org email active map
  const emailMap = new Map<string, boolean>()
  for (const ea of emailAccounts ?? []) {
    if (ea.status === 'active') emailMap.set(ea.org_id, true)
  }

  // Build org member map for email lookup only
  const profileOrgMap = new Map<string, string[]>()
  for (const p of authUsers ?? []) {
    if (!profileOrgMap.has(p.org_id)) profileOrgMap.set(p.org_id, [])
    profileOrgMap.get(p.org_id)!.push(p.id)
  }

  // Fetch auth.users emails. org.id === auth_user.id for owners.
  const authEmailMap = new Map<string, string>()
  try {
    const { data, error } = await service.auth.admin.listUsers({ perPage: 1000 })
    if (error) console.error('[admin/orgs] listUsers error:', error.message)
    for (const u of data?.users ?? []) {
      if (u.email) authEmailMap.set(u.id, u.email)
    }
  } catch (e) {
    console.error('[admin/orgs] listUsers threw:', e)
  }


  // Staff assignments (graceful if migration 060 not yet applied)
  const staffNameMap = new Map<string, string>()
  const orgStaffMap  = new Map<string, string>()  // org_id → staff_id
  try {
    const [{ data: staffProfiles }, { data: orgAssignments }] = await Promise.all([
      service.from('profiles').select('id, display_name').eq('platform_role', 'platform_staff'),
      service.from('organizations').select('id, assigned_staff_id').not('assigned_staff_id', 'is', null),
    ])
    for (const s of staffProfiles ?? []) staffNameMap.set(s.id, s.display_name)
    for (const o of orgAssignments ?? []) {
      if (o.assigned_staff_id) orgStaffMap.set(o.id, o.assigned_staff_id)
    }
  } catch { /* migration 060 pending — staff assignment column not yet available */ }
  const result = (orgs ?? []).map(org => {
    const settings = settingsMap.get(org.id) ?? null

    // SMS fields live on organizations (not org_settings)
    const orgAny   = org as Record<string, unknown>
    const monthly  = (orgAny.monthly_message_count as number | null) ?? 0
    const quota    = (orgAny.sms_quota as number | null) ?? 1000
    const sms_used_pct = quota > 0 ? Math.round((monthly / quota) * 100) : 0

    const orgAny2 = org as Record<string, unknown>
    const last_active_at = (orgAny2.last_active_at as string | null) ?? null
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
      vertical:            (org as { vertical?: string | null }).vertical ?? 'dealer',
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
      assigned_staff_id:   orgStaffMap.get(org.id) ?? null,
      assigned_staff_name: orgStaffMap.has(org.id) ? (staffNameMap.get(orgStaffMap.get(org.id)!) ?? null) : null,
      signup_email:        authEmailMap.get(org.id) ?? null,
      dealer_website_url:  settings?.dealer_website_url ?? null,
    }
  })

  return NextResponse.json(result)
}
