/**
 * GET /api/admin/sales
 * Sales team overview — all affiliate codes enriched with customer health + commission data.
 */
import { NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { requirePlatformArea } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/service'
import { computeAttritionScore } from '@/lib/admin/attrition'

export const dynamic = 'force-dynamic'

export async function GET() {
  const profile = await requireProfile()
  const denied = await requirePlatformArea(profile.id, 'sales')
  if (denied) return denied

  const service = createServiceClient()

  const [codesRes, orgsRes, emailRes, ticketRes, profileRes] = await Promise.allSettled([
    service.from('affiliate_codes')
      .select('code, type, owner_name, owner_email, is_active, commission_first_pct, commission_recurring_pct, created_at, notes')
      .order('created_at', { ascending: false }),
    service.from('organizations')
      .select('id, name, plan, subscription_status, trial_ends_at, current_period_end, created_at, affiliate_code, org_settings(monthly_message_count, sms_quota, onboarding_completed_at)')
      .not('id', 'eq', '00000000-0000-0000-0000-000000000001')
      .not('approved_at', 'is', null),
    service.from('email_accounts').select('org_id, status'),
    service.from('support_tickets').select('org_id, status'),
    service.from('profiles').select('id, org_id'),
  ])

  const codes   = codesRes.status   === 'fulfilled' ? (codesRes.value.data   ?? []) : []
  const orgs    = orgsRes.status    === 'fulfilled' ? (orgsRes.value.data    ?? []) : []
  const emails  = emailRes.status   === 'fulfilled' ? (emailRes.value.data   ?? []) : []
  const tickets = ticketRes.status  === 'fulfilled' ? (ticketRes.value.data  ?? []) : []
  const profs   = profileRes.status === 'fulfilled' ? (profileRes.value.data ?? []) : []

  // Commission — graceful if table not yet migrated
  let ledger: { affiliate_code: string; amount: number; status: string }[] = []
  try {
    const { data } = await service.from('commission_ledger').select('affiliate_code, amount, status').limit(10000)
    ledger = (data ?? []).map(r => ({ ...r, amount: Number(r.amount) }))
  } catch { /* migration 054 pending */ }

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

  const commMap = new Map<string, { pending: number; paid: number }>()
  for (const row of ledger) {
    if (!commMap.has(row.affiliate_code)) commMap.set(row.affiliate_code, { pending: 0, paid: 0 })
    const e = commMap.get(row.affiliate_code)!
    if (row.status === 'pending') e.pending += row.amount
    else if (row.status === 'paid') e.paid += row.amount
  }

  const result = codes.map(code => {
    const customers = orgs.filter(o => o.affiliate_code === code.code)
    let totalScore = 0, critical = 0, at_risk = 0, healthy = 0, active = 0

    for (const org of customers) {
      const s = Array.isArray(org.org_settings) ? org.org_settings[0] : org.org_settings
      const quota = s?.sms_quota ?? 1
      const msg   = s?.monthly_message_count ?? 0
      const pct   = quota > 0 ? Math.round((msg / quota) * 100) : 0
      const lastActive  = orgLastActiveMap.get(org.id) ?? null
      const trialDays   = org.trial_ends_at ? Math.ceil((new Date(org.trial_ends_at).getTime() - Date.now()) / 86400000) : null
      const pastDueDays = org.subscription_status === 'past_due' && org.current_period_end
        ? Math.floor((Date.now() - new Date(org.current_period_end).getTime()) / 86400000) : 0

      const { score, tier } = computeAttritionScore({
        subscription_status: org.subscription_status, last_active_at: lastActive,
        has_active_email: emailMap.get(org.id) ?? false, onboarding_done: !!s?.onboarding_completed_at,
        sms_used_pct: pct, monthly_message_count: msg,
        tickets_open: openTicketsMap.get(org.id) ?? 0, past_due_days: pastDueDays, trial_days_left: trialDays,
      })
      totalScore += score
      if (tier === 'critical') critical++
      else if (tier === 'at_risk') at_risk++
      else healthy++
      if (org.subscription_status === 'active') active++
    }

    const total = customers.length
    const avg_score = total > 0 ? Math.round(totalScore / total) : 0
    const retention_rate = total > 0 ? Math.round((healthy / total) * 100) : 100
    const performance_score = Math.round((active / Math.max(total, 1)) * 50 + (avg_score / 100) * 50)
    const comm = commMap.get(code.code) ?? { pending: 0, paid: 0 }

    return {
      code: code.code, type: code.type,
      owner_name: code.owner_name, owner_email: code.owner_email ?? null,
      is_active: code.is_active, notes: code.notes ?? null, created_at: code.created_at,
      commission_first_pct: code.commission_first_pct,
      commission_recurring_pct: code.commission_recurring_pct ?? 0,
      total_customers: total, active_customers: active,
      critical, at_risk, healthy,
      avg_score, retention_rate, performance_score,
      commission_pending: parseFloat(comm.pending.toFixed(2)),
      commission_paid:    parseFloat(comm.paid.toFixed(2)),
    }
  })

  result.sort((a, b) => b.performance_score - a.performance_score)
  return NextResponse.json({ salespeople: result })
}
