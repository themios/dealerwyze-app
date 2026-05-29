import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/auth/profile'
import { isDealerAdmin } from '@/lib/auth/dealerRoles'
import { CommissionPlanUpdateSchema } from '@/lib/commissions/schemas'

export const runtime = 'nodejs'

/**
 * PATCH /api/commission-plans/[id]
 * Update a commission plan. Broker/admin only.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
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
  const parsed = CommissionPlanUpdateSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: parsed.error.flatten() },
      { status: 400 },
    )
  }
  const body = parsed.data
  const { id } = await params

  // Verify plan belongs to this org
  const { data: existing } = await supabase
    .from('commission_plans')
    .select('id, agent_id, is_default')
    .eq('id', id)
    .eq('org_id', profile.org_id)
    .maybeSingle()

  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Swap default if this plan is being promoted to default (org-level default only)
  if (body.is_default === true && (body.agent_id ?? existing.agent_id) == null) {
    const { error: clearErr } = await supabase
      .from('commission_plans')
      .update({ is_default: false })
      .eq('org_id', profile.org_id)
      .eq('is_default', true)
      .is('agent_id', null)
      .neq('id', id) // don't clear the plan being updated

    if (clearErr) {
      console.error('[commission-plans] clear default error:', clearErr.message)
      return NextResponse.json({ error: 'Internal error' }, { status: 500 })
    }
  }

  // Compute broker_split_pct if agent_split_pct is being set and broker_split_pct omitted
  const updatePayload: Record<string, unknown> = { ...body }
  if (
    body.plan_type === 'percentage_split' &&
    body.agent_split_pct != null &&
    body.broker_split_pct == null
  ) {
    updatePayload.broker_split_pct = 100 - body.agent_split_pct
  }

  const { data: updated, error: updateErr } = await supabase
    .from('commission_plans')
    .update(updatePayload)
    .eq('id', id)
    .eq('org_id', profile.org_id)
    .select('*')
    .single()

  if (updateErr || !updated) {
    console.error('[commission-plans] update error:', updateErr?.message)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }

  return NextResponse.json(updated)
}

/**
 * DELETE /api/commission-plans/[id]
 * Delete a commission plan. Broker/admin only.
 * Returns 409 if any open transactions reference this plan.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
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

  const { id } = await params

  // Verify plan belongs to this org (prefer 404 over 403 — don't leak existence)
  const { data: existing } = await supabase
    .from('commission_plans')
    .select('id')
    .eq('id', id)
    .eq('org_id', profile.org_id)
    .maybeSingle()

  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Guard: reject delete if open transactions reference this plan
  const { count, error: refErr } = await supabase
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .eq('commission_plan_id', id)
    .neq('status', 'closed')
    .neq('status', 'fallen_through')

  if (refErr) {
    console.error('[commission-plans] reference check error:', refErr.message)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }

  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: 'Plan is in use by open transactions' },
      { status: 409 },
    )
  }

  const { error: delErr } = await supabase
    .from('commission_plans')
    .delete()
    .eq('id', id)
    .eq('org_id', profile.org_id)

  if (delErr) {
    console.error('[commission-plans] delete error:', delErr.message)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }

  return NextResponse.json({ deleted: true })
}
