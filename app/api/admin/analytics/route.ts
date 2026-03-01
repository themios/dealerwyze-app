import { NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'

const PLAN_MRR: Record<string, number> = {
  tier1: 49.94,
  tier2: 64.95,
  tier3: 249.95,
}

export async function GET() {
  const profile = await requireProfile()
  if (profile.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = createServiceClient()
  const now = Date.now()
  const since30d = new Date(now - 30 * 86400000).toISOString()
  const since7d  = new Date(now - 7  * 86400000).toISOString()

  const [
    { data: orgs },
    { data: voiceCalls30d },
    { data: emailAccounts },
    { data: retellOrgs },
  ] = await Promise.all([
    supabase
      .from('organizations')
      .select('id, name, plan, sms_plan, subscription_status, monthly_message_count, monthly_voice_seconds, created_at'),
    supabase
      .from('voice_calls')
      .select('duration_seconds')
      .gte('created_at', since30d),
    supabase
      .from('email_accounts')
      .select('org_id'),
    supabase
      .from('org_settings')
      .select('org_id, retell_agent_id')
      .not('retell_agent_id', 'is', null),
  ])

  const rows = orgs ?? []
  const total   = rows.length
  const active  = rows.filter(o => o.subscription_status === 'active').length
  const trialing = rows.filter(o => o.subscription_status === 'trialing').length
  const pastDue  = rows.filter(o => o.subscription_status === 'past_due').length
  const canceled = rows.filter(o => o.subscription_status === 'canceled').length

  // MRR — only count active orgs
  const mrr = rows
    .filter(o => o.subscription_status === 'active')
    .reduce((sum, o) => sum + (PLAN_MRR[o.sms_plan ?? 'tier1'] ?? PLAN_MRR.tier1), 0)

  const newOrgs30d = rows.filter(o => o.created_at >= since30d).length
  const newOrgs7d  = rows.filter(o => o.created_at >= since7d).length

  // Platform SMS: sum current billing period counts (rough proxy)
  const platformSms = rows.reduce((s, o) => s + (o.monthly_message_count ?? 0), 0)

  // Platform voice: sum actual call seconds in last 30d
  const platformVoiceSeconds = (voiceCalls30d ?? []).reduce(
    (s, c) => s + (c.duration_seconds ?? 0), 0,
  )
  const platformVoiceMinutes = Math.round(platformVoiceSeconds / 60)

  // Feature adoption
  const gmailOrgIds  = new Set((emailAccounts ?? []).map(e => e.org_id))
  const retellOrgIds = new Set((retellOrgs ?? []).map(r => r.org_id))
  const gmailPct  = total ? Math.round((gmailOrgIds.size  / total) * 100) : 0
  const voicePct  = total ? Math.round((retellOrgIds.size / total) * 100) : 0

  // Trial conversion rate: % of non-trial status (active + past_due)
  const converted = active + pastDue
  const conversionRate = (active + trialing + pastDue) > 0
    ? Math.round((converted / (active + trialing + pastDue)) * 100)
    : 0

  // Top 10 orgs by SMS usage
  const topOrgs = [...rows]
    .sort((a, b) => (b.monthly_message_count ?? 0) - (a.monthly_message_count ?? 0))
    .slice(0, 10)
    .map(o => ({
      id:    o.id,
      name:  o.name ?? 'Unnamed',
      plan:  o.sms_plan ?? 'tier1',
      status: o.subscription_status,
      sms:   o.monthly_message_count ?? 0,
      voice_seconds: o.monthly_voice_seconds ?? 0,
    }))

  return NextResponse.json({
    summary: { total, active, trialing, past_due: pastDue, canceled },
    mrr: Math.round(mrr * 100) / 100,
    new_orgs_30d: newOrgs30d,
    new_orgs_7d:  newOrgs7d,
    platform_sms_30d:           platformSms,
    platform_voice_minutes_30d: platformVoiceMinutes,
    feature_adoption: { gmail_pct: gmailPct, voice_pct: voicePct },
    trial_conversion_rate: conversionRate,
    top_orgs: topOrgs,
  })
}
