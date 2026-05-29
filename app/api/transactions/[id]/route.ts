import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/auth/profile'
import { TransactionUpdateSchema } from '@/lib/transactions/schemas'
import { canTransition, type PipelineStatus } from '@/lib/transactions/types'

export const runtime = 'nodejs'

/**
 * GET /api/transactions/[id]
 * Fetch a single transaction. Prefer 404 over 403 — don't confirm existence to wrong tenant.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const profile = await requireProfile()
  const supabase = await createClient()
  const { id } = await params

  const { data: transaction, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('id', id)
    .eq('org_id', profile.org_id)
    .maybeSingle()

  if (error) {
    console.error('[transactions] GET single error:', error.message)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }

  if (!transaction) {
    return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
  }

  return NextResponse.json(transaction)
}

/**
 * PATCH /api/transactions/[id]
 * Agent update path — advances pipeline, records closing_date/final_sale_price,
 * updates parties JSONB and offer details.
 *
 * Does NOT trigger commission calculation or lock the transaction.
 * Broker close (Plan 09-05) is the only path to pipeline_status='closed'.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const profile = await requireProfile()
  const supabase = await createClient()
  const { id } = await params

  let body: ReturnType<typeof TransactionUpdateSchema.parse>
  try {
    const raw = await req.json().catch(() => ({}))
    body = TransactionUpdateSchema.parse(raw)
  } catch {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  // Block pipeline_status='closed' on the agent PATCH path —
  // closing requires broker confirmation via /api/transactions/[id]/close (Plan 09-05)
  if (body.pipeline_status === 'closed') {
    return NextResponse.json(
      { error: 'Use the close endpoint to close a transaction' },
      { status: 422 },
    )
  }

  // If transitioning status, validate against VALID_TRANSITIONS
  if (body.pipeline_status !== undefined) {
    const { data: current, error: fetchErr } = await supabase
      .from('transactions')
      .select('pipeline_status')
      .eq('id', id)
      .eq('org_id', profile.org_id)
      .maybeSingle()

    if (fetchErr) {
      console.error('[transactions] PATCH fetch error:', fetchErr.message)
      return NextResponse.json({ error: 'Internal error' }, { status: 500 })
    }

    if (!current) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
    }

    if (!canTransition(current.pipeline_status as PipelineStatus, body.pipeline_status)) {
      return NextResponse.json({ error: 'Invalid status transition' }, { status: 422 })
    }
  }

  // Build update payload — only include fields present in body
  // commission_snapshot and commission_plan_id are never set here
  const updatePayload: Record<string, unknown> = {}

  if (body.pipeline_status     !== undefined) {
    updatePayload.pipeline_status = body.pipeline_status
    // Keep legacy status column in sync for any existing dealer code paths
    updatePayload.status = body.pipeline_status
  }
  if (body.offer_amount        !== undefined) updatePayload.offer_amount        = body.offer_amount
  if (body.offer_date          !== undefined) updatePayload.offer_date          = body.offer_date
  if (body.inspection_deadline !== undefined) updatePayload.inspection_deadline = body.inspection_deadline
  if (body.contingencies       !== undefined) updatePayload.contingencies       = body.contingencies
  if (body.notes               !== undefined) updatePayload.notes               = body.notes
  if (body.parties             !== undefined) updatePayload.parties             = body.parties
  if (body.commission_pct      !== undefined) updatePayload.commission_pct      = body.commission_pct
  if (body.co_broke_pct        !== undefined) updatePayload.co_broke_pct        = body.co_broke_pct
  if (body.closing_date        !== undefined) updatePayload.closing_date        = body.closing_date
  if (body.final_sale_price    !== undefined) updatePayload.final_sale_price    = body.final_sale_price

  const { data: updated, error: updateErr } = await supabase
    .from('transactions')
    .update(updatePayload)
    .eq('id', id)
    .eq('org_id', profile.org_id)
    .select('*')
    .maybeSingle()

  if (updateErr) {
    console.error('[transactions] PATCH update error:', updateErr.message)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }

  if (!updated) {
    return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
  }

  return NextResponse.json(updated)
}
