/**
 * GET /api/admin/customers
 * All approved dealers with attrition scores + salesperson attribution.
 * Supports ?sort=risk|inactive|usage|tickets|name|salesperson
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { requirePlatformArea } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/service'
import { computeAttritionScore } from '@/lib/admin/attrition'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const profile = await requireProfile()
  const denied  = await requirePlatformArea(profile.id, 'accounts')
  if (denied) return denied

  const service = createServiceClient()

  const [orgsRes, codesRes, emailRes, ticketRes, profileRes] = await Promise.allSettled([
    service.from('organizations')
      .select('id, name, plan, subscription_status, trial_ends_at, current_period_end, created_at, approved_at, suspended_at, affiliate_code, org_settings(monthly_message_count, sms_quota, onboarding_completed_at)')
      .not('id', 'eq', '00000000-0000-0000-0000-000000000001')
      .not('approved_at', 'is', null)
      .order('created_at', { ascending: false }),
    service.from('affiliate_codes').select('code, owner_name, owner_email, type'),
    service.from('email_accounts').select('org_id, status'),
    service.from('support_tickets').select('org_id, status'),
    service.from('profiles').select('id, org_id'),
  ])

  const orgs    = orgsRes.status    === 'fulfilled' ? (orgsRes.value.data    ?? []) : []
  const codes   = codesRes.status   === 'fulfilled' ? (codesRes.value.data   ?? []) : []
  const emails  = emailRes.status   === 'fulfilled' ? (emailRes.value.data   ?? []) : []
  const tickets = ticketRes.status  === 'fulfilled' ? (ticketRes.value.data  ?? []) : []
  const profs   = profileRes.status === 'fulfilled' ? (profileRes.value.data ?? []) : []

  const codeMap = new Map(codes.map(c => [c.code, c]))
  const emailMap = new Map<string, boolean>()
  for (const ea of emails) { if (ea.status === 'active') emailMap.set(ea.org_id, true) }

  const openTicketsMap = new Map<string, number>()
  for (const t of tickets) {
    if (t.status !== 'closed' && t.status !== 'resolved')
      openTicketsMap.set(t.org_id, (openTicketsMap.get(t.org_id) ?? 0) + 1)
  }

  const profileOrgMap = new Map<string, string[]>()
  for (const p of profs) {
    if (!profileOrgMap.has(p.org_id)) profileOrgMap.set(p.org_id, [])
    profileOrgMap.get(p.org_id)!.push(p.id)
  }
  const { data: { users: authUsers } } = await service.auth.admin.listUsers({ perPage: 1000 })
  const lastSignInMap = new Map((authUsers ?? []).filter(u => u.last_sign_in_at).map(u => [u.id, u.last_sign_in_at!]))
  const orgLastActiveMap = new Map<string, string>()
  for (const [orgId, ids] of profileOrgMap) {
    let latest: string | null = null
    for (const pid of ids) { const t = lastSignInMap.get(pid); if (t && (!latest || t > latest)) latest = t }
    if (latest) orgLastActiveMap.set(orgId, latest)
  }

  const result = orgs.map(org => {
    const s = Array.isArray(org.org_settings) ? org.org_settings[0] : org.org_settings
    const quota = s?.sms_quota ?? 1
    const msg   = s?.monthly_message_count ?? 0
    const pct   = quota > 0 ? Math.round((msg / quota) * 100) : 0
    const lastActive  = orgLastActiveMap.get(org.id) ?? null
    const daysInactive = lastActive ? Math.floor((Date.now() - new Date(lastActive).getTime()) / 86400000) : 999
    const trialDays   = org.trial_ends_at ? Math.ceil((new Date(org.trial_ends_at).getTime() - Date.now()) / 86400000) : null
    const pastDueDays = org.subscription_status === 'past_due' && org.current_period_end
      ? Math.floor((Date.now() - new Date(org.current_period_end).getTime()) / 86400000) : 0

    const { score, tier, signals } = computeAttritionScore({
      subscription_status: org.subscription_status, last_active_at: lastActive,
      has_active_email: emailMap.get(org.id) ?? false, onboarding_done: !!s?.onboarding_completed_at,
      sms_used_pct: pct, monthly_message_count: msg,
      tickets_open: openTicketsMap.get(org.id) ?? 0, past_due_days: pastDueDays, trial_days_left: trialDays,
    })

    const aff = org.affiliate_code ? codeMap.get(org.affiliate_code) : null

    return {
      id: org.id, name: org.name, plan: org.plan,
      subscription_status: org.subscription_status,
      created_at: org.created_at, suspended_at: org.suspended_at ?? null,
      last_active_at: lastActive, days_inactive: daysInactive,
      score, tier, signals,
      sms_used_pct: pct, has_active_email: emailMap.get(org.id) ?? false,
      onboarding_done: !!s?.onboarding_completed_at,
      tickets_open: openTicketsMap.get(org.id) ?? 0,
      affiliate_code: org.affiliate_code ?? null,
      salesperson_name:  aff?.owner_name  ?? null,
      salesperson_email: aff?.owner_email ?? null,
    }
  })

  // Sort
  const sort = req.nextUrl.searchParams.get('sort') ?? 'risk'
  if (sort === 'risk') {
    const order = { critical: 0, at_risk: 1, healthy: 2 }
    result.sort((a, b) => {
      const ta = order[a.tier as keyof typeof order] ?? 2
      const tb = order[b.tier as keyof typeof order] ?? 2
      return ta !== tb ? ta - tb : a.score - b.score
    })
  } else if (sort === 'inactive') {
    result.sort((a, b) => b.days_inactive - a.days_inactive)
  } else if (sort === 'usage') {
    result.sort((a, b) => a.sms_used_pct - b.sms_used_pct)
  } else if (sort === 'tickets') {
    result.sort((a, b) => b.tickets_open - a.tickets_open)
  } else if (sort === 'salesperson') {
    result.sort((a, b) => (a.salesperson_name ?? 'ZZZ').localeCompare(b.salesperson_name ?? 'ZZZ'))
  } else if (sort === 'name') {
    result.sort((a, b) => a.name.localeCompare(b.name))
  }

  return NextResponse.json(result)
}
