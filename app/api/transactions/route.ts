import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/auth/profile'
import { TransactionCreateSchema } from '@/lib/transactions/schemas'

export const runtime = 'nodejs'

/**
 * POST /api/transactions
 * Create a transaction linked to a listing (vehicle). RE orgs only.
 * org_id is derived exclusively from the authenticated profile — never from request.
 */
export async function POST(req: NextRequest) {
  const profile = await requireProfile()
  const supabase = await createClient()

  // Verify this is an RE org — dealer orgs cannot use the transactions API
  const { data: org } = await supabase
    .from('organizations')
    .select('vertical')
    .eq('id', profile.org_id)
    .maybeSingle()

  if (!org || org.vertical !== 'real_estate') {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  let body: ReturnType<typeof TransactionCreateSchema.parse>
  try {
    const raw = await req.json().catch(() => ({}))
    body = TransactionCreateSchema.parse(raw)
  } catch {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  // Verify listing belongs to this org (vehicles uses user_id for org scoping)
  const { data: listing } = await supabase
    .from('vehicles')
    .select('id')
    .eq('id', body.vehicle_id)
    .eq('user_id', profile.org_id)
    .maybeSingle()

  if (!listing) {
    return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
  }

  // Generate a simple transaction number — collisions acceptable at MVP scale
  const txnNumber = `TXN-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000).padStart(4, '0')}`

  const insertPayload: Record<string, unknown> = {
    org_id:             profile.org_id,
    vehicle_id:         body.vehicle_id,
    pipeline_status:    'offer',
    status:             'offer',         // keep legacy status column in sync
    transaction_number: txnNumber,
  }

  if (body.offer_amount        != null) insertPayload.offer_amount        = body.offer_amount
  if (body.offer_date          != null) insertPayload.offer_date          = body.offer_date
  if (body.inspection_deadline != null) insertPayload.inspection_deadline = body.inspection_deadline
  if (body.contingencies       != null) insertPayload.contingencies       = body.contingencies
  if (body.notes               != null) insertPayload.notes               = body.notes
  if (body.commission_pct      != null) insertPayload.commission_pct      = body.commission_pct
  if (body.co_broke_pct        != null) insertPayload.co_broke_pct        = body.co_broke_pct
  if (body.listing_agent_id    != null) insertPayload.listing_agent_id    = body.listing_agent_id
  if (body.buyer_agent_id      != null) insertPayload.buyer_agent_id      = body.buyer_agent_id

  const { data: transaction, error } = await supabase
    .from('transactions')
    .insert(insertPayload)
    .select('*')
    .single()

  if (error || !transaction) {
    console.error('[transactions] insert error:', error?.message)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }

  return NextResponse.json(transaction, { status: 201 })
}

/**
 * GET /api/transactions?vehicle_id=X
 * List transactions for a listing, scoped to the authenticated org.
 */
export async function GET(req: NextRequest) {
  const profile = await requireProfile()
  const supabase = await createClient()

  const vehicleId = req.nextUrl.searchParams.get('vehicle_id')
  if (!vehicleId) {
    return NextResponse.json({ error: 'vehicle_id is required' }, { status: 400 })
  }

  // Verify listing belongs to this org
  const { data: listing } = await supabase
    .from('vehicles')
    .select('id')
    .eq('id', vehicleId)
    .eq('user_id', profile.org_id)
    .maybeSingle()

  if (!listing) {
    return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
  }

  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('org_id', profile.org_id)
    .eq('vehicle_id', vehicleId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    console.error('[transactions] GET error:', error.message)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }

  return NextResponse.json({ transactions: data ?? [] })
}
