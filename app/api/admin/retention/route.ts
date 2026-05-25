import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { requirePlatformArea } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/service'
import { computeAttritionScore } from '@/lib/admin/attrition'
import { getAdminVerticalScope } from '@/lib/admin/verticalScope'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/retention
 * Returns attrition scores for all approved, non-sentinel organizations.
 *
 * ?count=1 → lightweight { at_risk: N } for sidebar badge
 */
export async function GET(req: NextRequest) {
  const profile = await requireProfile()
  const denied  = await requirePlatformArea(profile.id, 'retention')
  if (denied) return denied

  const service = createServiceClient()
  const scope = await getAdminVerticalScope(req)

  // Fetch orgs with key fields
  const [{ data: orgs }, { data: emailAccounts }, { data: ticketCounts }] = await Promise.all([
    service
      .from('organizations')
      .select(`
        id, name, plan, subscription_status,
        trial_ends_at, current_period_end,
        created_at, approved_at, suspended_at,
        org_settings (
          monthly_message_count,
          sms_quota,
          onboarding_completed_at
        )
      `)
      .not('id', 'eq', '00000000-0000-0000-0000-000000000001')
      .in('id', scope.orgIds)
      .not('approved_at', 'is', null)
      .order('created_at', { ascending: false }),

    service
      .from('email_accounts')
      .select('org_id, status'),

    service
      .from('support_tickets')
      .select('org_id, status'),
  ])

  // Build lookup maps
  const emailMap = new Map<string, boolean>()
  for (const ea of emailAccounts ?? []) {
    if (ea.status === 'active') emailMap.set(ea.org_id, true)
  }

  const openTicketsMap = new Map<string, number>()
  for (const t of ticketCounts ?? []) {
    if (t.status !== 'closed' && t.status !== 'resolved') {
      openTicketsMap.set(t.org_id, (openTicketsMap.get(t.org_id) ?? 0) + 1)
    }
  }

  // Get last sign-in per org via auth.users
  const { data: profiles } = await service
    .from('profiles')
    .select('id, org_id')
    .not('org_id', 'eq', '00000000-0000-0000-0000-000000000001')

  const profileOrgMap = new Map<string, string[]>()
  for (const p of profiles ?? []) {
    if (!profileOrgMap.has(p.org_id)) profileOrgMap.set(p.org_id, [])
    profileOrgMap.get(p.org_id)!.push(p.id)
  }

  const { data: { users: authUsers } } = await service.auth.admin.listUsers({ perPage: 1000 })
  const lastSignInMap = new Map(
    (authUsers ?? []).filter(u => u.last_sign_in_at).map(u => [u.id, u.last_sign_in_at!])
  )

  const orgLastActiveMap = new Map<string, string>()
  for (const [orgId, ids] of profileOrgMap) {
    let latest: string | null = null
    for (const pid of ids) {
      const t = lastSignInMap.get(pid)
      if (t && (!latest || t > latest)) latest = t
    }
    if (latest) orgLastActiveMap.set(orgId, latest)
  }

  // Count-only shortcut for sidebar badge
  if (req.nextUrl.searchParams.get('count') === '1') {
    let atRisk = 0
    for (const org of orgs ?? []) {
      const settings      = Array.isArray(org.org_settings) ? org.org_settings[0] : org.org_settings
      const smsQuota      = settings?.sms_quota ?? 1
      const msgCount      = settings?.monthly_message_count ?? 0
      const smsUsedPct    = smsQuota > 0 ? Math.round((msgCount / smsQuota) * 100) : 0
      const last_active   = orgLastActiveMap.get(org.id) ?? null
      const trialDaysLeft = org.trial_ends_at
        ? Math.ceil((new Date(org.trial_ends_at).getTime() - Date.now()) / 86400000)
        : null
      const pastDueDays   = org.subscription_status === 'past_due' && org.current_period_end
        ? Math.floor((Date.now() - new Date(org.current_period_end).getTime()) / 86400000)
        : 0

      const { tier } = computeAttritionScore({
        subscription_status:   org.subscription_status,
        last_active_at:        last_active,
        has_active_email:      emailMap.get(org.id) ?? false,
        onboarding_done:       !!settings?.onboarding_completed_at,
        sms_used_pct:          smsUsedPct,
        monthly_message_count: msgCount,
        tickets_open:          openTicketsMap.get(org.id) ?? 0,
        past_due_days:         pastDueDays,
        trial_days_left:       trialDaysLeft,
      })
      if (tier === 'at_risk' || tier === 'critical') atRisk++
    }
    return NextResponse.json({ at_risk: atRisk })
  }

  // Full response
  const result = (orgs ?? []).map(org => {
    const settings      = Array.isArray(org.org_settings) ? org.org_settings[0] : org.org_settings
    const smsQuota      = settings?.sms_quota ?? 1
    const msgCount      = settings?.monthly_message_count ?? 0
    const smsUsedPct    = smsQuota > 0 ? Math.round((msgCount / smsQuota) * 100) : 0
    const last_active   = orgLastActiveMap.get(org.id) ?? null
    const trialDaysLeft = org.trial_ends_at
      ? Math.ceil((new Date(org.trial_ends_at).getTime() - Date.now()) / 86400000)
      : null
    const pastDueDays   = org.subscription_status === 'past_due' && org.current_period_end
      ? Math.floor((Date.now() - new Date(org.current_period_end).getTime()) / 86400000)
      : 0

    const { score, tier, signals } = computeAttritionScore({
      subscription_status:   org.subscription_status,
      last_active_at:        last_active,
      has_active_email:      emailMap.get(org.id) ?? false,
      onboarding_done:       !!settings?.onboarding_completed_at,
      sms_used_pct:          smsUsedPct,
      monthly_message_count: msgCount,
      tickets_open:          openTicketsMap.get(org.id) ?? 0,
      past_due_days:         pastDueDays,
      trial_days_left:       trialDaysLeft,
    })

    return {
      id:                  org.id,
      name:                org.name,
      plan:                org.plan,
      subscription_status: org.subscription_status,
      created_at:          org.created_at,
      last_active_at:      last_active,
      score,
      tier,
      signals,
      sms_used_pct:        smsUsedPct,
      has_active_email:    emailMap.get(org.id) ?? false,
      onboarding_done:     !!settings?.onboarding_completed_at,
      tickets_open:        openTicketsMap.get(org.id) ?? 0,
    }
  })

  // Sort: critical first, then at_risk, then healthy; within tier sort by score asc
  result.sort((a, b) => {
    const tierOrder = { critical: 0, at_risk: 1, healthy: 2 }
    const ta = tierOrder[a.tier as keyof typeof tierOrder] ?? 2
    const tb = tierOrder[b.tier as keyof typeof tierOrder] ?? 2
    if (ta !== tb) return ta - tb
    return a.score - b.score
  })

  return NextResponse.json(result)
}
