import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'
import { logAdminAction } from '@/lib/admin/audit'

const SMS_PLANS: Record<string, { quota: number; label: string }> = {
  tier1: { quota: 1000,  label: 'Tier 1 — 1,000 msgs/mo' },
  tier2: { quota: 3000,  label: 'Tier 2 — 3,000 msgs/mo' },
  tier3: { quota: 10000, label: 'Tier 3 — 10,000 msgs/mo' },
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const profile = await requireProfile()
  if (profile.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id: orgId } = await params
  const supabase = createServiceClient()
  const since30d = new Date(Date.now() - 30 * 86400000).toISOString()

  const [
    { data: org },
    { data: settings },
    { data: team },
    { data: voiceCalls },
    { count: leadsCount },
  ] = await Promise.all([
    supabase.from('organizations').select('*').eq('id', orgId).single(),
    supabase.from('org_settings').select('*').eq('org_id', orgId).maybeSingle(),
    supabase.from('profiles').select('id, display_name, role, created_at').eq('org_id', orgId),
    supabase.from('voice_calls').select('duration').eq('org_id', orgId).gte('created_at', since30d),
    supabase.from('customers').select('id', { count: 'exact', head: true }).eq('user_id', orgId).gte('created_at', since30d),
  ])

  if (!org) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const voiceMinutes = Math.round(
    (voiceCalls?.reduce((s, c) => s + (c.duration ?? 0), 0) ?? 0) / 60,
  )

  return NextResponse.json({
    org,
    settings,
    team: team ?? [],
    stats: {
      voice_calls_30d:   voiceCalls?.length ?? 0,
      voice_minutes_30d: voiceMinutes,
      leads_30d:         leadsCount ?? 0,
    },
  })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const profile = await requireProfile()
  if (profile.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id: orgId } = await params
  const supabase = createServiceClient()
  const body = await req.json() as {
    action: string
    plan?: string
    subscription_status?: string
    sms_plan?: string
    sms_overage_enabled?: boolean
  }

  const now = new Date().toISOString()

  if (body.action === 'update_plan') {
    const { error } = await supabase
      .from('organizations')
      .update({ plan: body.plan, subscription_status: body.subscription_status, updated_at: now })
      .eq('id', orgId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await logAdminAction(profile.id, 'update_plan', orgId, { plan: body.plan, subscription_status: body.subscription_status })
  }

  else if (body.action === 'update_sms_plan') {
    const tier = SMS_PLANS[body.sms_plan ?? '']
    if (!tier) return NextResponse.json({ error: 'Invalid sms_plan' }, { status: 400 })
    const { error } = await supabase
      .from('organizations')
      .update({ sms_plan: body.sms_plan, sms_quota: tier.quota, updated_at: now })
      .eq('id', orgId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await logAdminAction(profile.id, 'update_sms_plan', orgId, { sms_plan: body.sms_plan, sms_quota: tier.quota })
  }

  else if (body.action === 'toggle_overage') {
    const { error } = await supabase
      .from('organizations')
      .update({ sms_overage_enabled: body.sms_overage_enabled, updated_at: now })
      .eq('id', orgId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await logAdminAction(profile.id, 'toggle_overage', orgId, { enabled: body.sms_overage_enabled })
  }

  else if (body.action === 'reset_billing') {
    const today = new Date()
    const cycleEnd = new Date(today)
    cycleEnd.setMonth(cycleEnd.getMonth() + 1)
    const { error } = await supabase
      .from('organizations')
      .update({
        billing_cycle_start:   today.toISOString().split('T')[0],
        billing_cycle_end:     cycleEnd.toISOString().split('T')[0],
        monthly_message_count: 0,
        monthly_mms_count:     0,
        monthly_voice_seconds: 0,
        updated_at:            now,
      })
      .eq('id', orgId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await logAdminAction(profile.id, 'reset_billing', orgId)
  }

  else if (body.action === 'reset_sms_count') {
    const { error } = await supabase
      .from('organizations')
      .update({ monthly_message_count: 0, updated_at: now })
      .eq('id', orgId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await logAdminAction(profile.id, 'reset_sms_count', orgId)
  }

  else {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
