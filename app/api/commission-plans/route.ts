import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/auth/profile'
import { isDealerAdmin } from '@/lib/auth/dealerRoles'
import { CommissionPlanCreateSchema } from '@/lib/commissions/schemas'

export const runtime = 'nodejs'

/**
 * GET /api/commission-plans
 * Returns all commission plans for the authenticated RE org.
 * All org members may read.
 */
export async function GET() {
  const profile = await requireProfile()
  const supabase = await createClient()

  // Verify this is a real-estate org
  const { data: org } = await supabase
    .from('organizations')
    .select('vertical')
    .eq('id', profile.org_id)
    .single()

  if (org?.vertical !== 'real_estate') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data, error } = await supabase
    .from('commission_plans')
    .select('*')
    .eq('org_id', profile.org_id)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(100)

  if (error) {
    console.error('[commission-plans] GET error:', error.message)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }

  return NextResponse.json({ plans: data ?? [] })
}

/**
 * POST /api/commission-plans
 * Create a new commission plan. Broker/admin only.
 */
export async function POST(req: NextRequest) {
  const profile = await requireProfile()
  const supabase = await createClient()

  // Verify this is a real-estate org
  const { data: org } = await supabase
    .from('organizations')
    .select('vertical')
    .eq('id', profile.org_id)
    .single()

  if (org?.vertical !== 'real_estate') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Broker/admin gate
  if (!isDealerAdmin(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const rawBody = await req.json().catch(() => ({}))
  const parsed = CommissionPlanCreateSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: parsed.error.flatten() },
      { status: 400 },
    )
  }
  const body = parsed.data

  // Compute broker_split_pct if not provided for percentage_split
  let brokerSplitPct = body.broker_split_pct ?? null
  if (
    body.plan_type === 'percentage_split' &&
    body.agent_split_pct != null &&
    brokerSplitPct == null
  ) {
    brokerSplitPct = 100 - body.agent_split_pct
  }

  // Swap default: if setting a new org-level default, clear the existing one first.
  // (partial unique index on commission_plans enforces one-default-per-org at DB level too)
  if (body.is_default && body.agent_id == null) {
    const { error: clearErr } = await supabase
      .from('commission_plans')
      .update({ is_default: false })
      .eq('org_id', profile.org_id)
      .eq('is_default', true)
      .is('agent_id', null)

    if (clearErr) {
      console.error('[commission-plans] clear default error:', clearErr.message)
      return NextResponse.json({ error: 'Internal error' }, { status: 500 })
    }
  }

  const { data: created, error: insertErr } = await supabase
    .from('commission_plans')
    .insert({
      org_id: profile.org_id,
      plan_type: body.plan_type,
      tier_name: body.tier_name ?? null,
      agent_id: body.agent_id ?? null,
      agent_split_pct: body.agent_split_pct ?? null,
      broker_split_pct: brokerSplitPct,
      referral_fee_flat: body.referral_fee_flat,
      referral_fee_pct: body.referral_fee_pct,
      is_default: body.is_default,
      threshold_gci: body.threshold_gci ?? null,
      effective_at: body.effective_at ?? null,
    })
    .select('*')
    .single()

  if (insertErr || !created) {
    console.error('[commission-plans] insert error:', insertErr?.message)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }

  return NextResponse.json(created, { status: 201 })
}
