/**
 * GET /api/admin/sales/[id]
 * [id] = affiliate code. Returns salesperson + all their customers with full attrition data.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { requirePlatformArea } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/service'
import { computeAttritionScore } from '@/lib/admin/attrition'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: affiliateCode } = await params
  const profile = await requireProfile()
  const denied  = await requirePlatformArea(profile.id, 'sales')
  if (denied) return denied

  const service = createServiceClient()

  const [codeRes, orgsRes, emailRes, ticketRes, profileRes] = await Promise.allSettled([
    service.from('affiliate_codes').select('*').eq('code', affiliateCode).maybeSingle(),
    service.from('organizations')
      .select('id, name, plan, subscription_status, trial_ends_at, current_period_end, created_at, suspended_at, org_settings(monthly_message_count, sms_quota, onboarding_completed_at)')
      .eq('affiliate_code', affiliateCode)
      .not('approved_at', 'is', null),
    service.from('email_accounts').select('org_id, status'),
    service.from('support_tickets').select('org_id, status'),
    service.from('profiles').select('id, org_id'),
  ])

  const code    = codeRes.status    === 'fulfilled' ? codeRes.value.data       : null
  const orgs    = orgsRes.status    === 'fulfilled' ? (orgsRes.value.data ?? [])    : []
  const emails  = emailRes.status   === 'fulfilled' ? (emailRes.value.data ?? [])   : []
  const tickets = ticketRes.status  === 'fulfilled' ? (ticketRes.value.data ?? [])  : []
  const profs   = profileRes.status === 'fulfilled' ? (profileRes.value.data ?? []) : []

  if (!code) return NextResponse.json({ error: 'Affiliate code not found' }, { status: 404 })

  let commRows: { id: string; event_type: string; amount: number; status: string; billing_period: string | null; created_at: string; org_id: string }[] = []
  try {
    const { data } = await service.from('commission_ledger')
      .select('id, event_type, amount, status, billing_period, created_at, org_id')
      .eq('affiliate_code', affiliateCode)
      .order('created_at', { ascending: false })
      .limit(50)
    commRows = (data ?? []).map(r => ({ ...r, amount: Number(r.amount) }))
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

  const customers = orgs.map(org => {
    const s = Array.isArray(org.org_settings) ? org.org_settings[0] : org.org_settings
    const quota = s?.sms_quota ?? 1
    const msg   = s?.monthly_message_count ?? 0
    const pct   = quota > 0 ? Math.round((msg / quota) * 100) : 0
    const lastActive  = orgLastActiveMap.get(org.id) ?? null
    const trialDays   = org.trial_ends_at ? Math.ceil((new Date(org.trial_ends_at).getTime() - Date.now()) / 86400000) : null
    const pastDueDays = org.subscription_status === 'past_due' && org.current_period_end
      ? Math.floor((Date.now() - new Date(org.current_period_end).getTime()) / 86400000) : 0

    const { score, tier, signals } = computeAttritionScore({
      subscription_status: org.subscription_status, last_active_at: lastActive,
      has_active_email: emailMap.get(org.id) ?? false, onboarding_done: !!s?.onboarding_completed_at,
      sms_used_pct: pct, monthly_message_count: msg,
      tickets_open: openTicketsMap.get(org.id) ?? 0, past_due_days: pastDueDays, trial_days_left: trialDays,
    })

    return {
      id: org.id, name: org.name, plan: org.plan,
      subscription_status: org.subscription_status,
      created_at: org.created_at, suspended_at: org.suspended_at ?? null,
      last_active_at: lastActive,
      score, tier, signals,
      sms_used_pct: pct, has_active_email: emailMap.get(org.id) ?? false,
      onboarding_done: !!s?.onboarding_completed_at,
      tickets_open: openTicketsMap.get(org.id) ?? 0,
    }
  })

  customers.sort((a, b) => {
    const order = { critical: 0, at_risk: 1, healthy: 2 }
    const ta = order[a.tier as keyof typeof order] ?? 2
    const tb = order[b.tier as keyof typeof order] ?? 2
    if (ta !== tb) return ta - tb
    return a.score - b.score
  })

  const commPending = commRows.filter(r => r.status === 'pending').reduce((s, r) => s + r.amount, 0)
  const commPaid    = commRows.filter(r => r.status === 'paid').reduce((s, r) => s + r.amount, 0)

  return NextResponse.json({
    salesperson: {
      code: code.code, type: code.type,
      owner_name: code.owner_name, owner_email: code.owner_email ?? null,
      is_active: code.is_active, notes: code.notes ?? null,
      commission_first_pct: code.commission_first_pct,
      commission_recurring_pct: code.commission_recurring_pct ?? 0,
      commission_pending: parseFloat(commPending.toFixed(2)),
      commission_paid:    parseFloat(commPaid.toFixed(2)),
      created_at: code.created_at,
    },
    customers,
    commission_events: commRows.slice(0, 20),
  })
}
