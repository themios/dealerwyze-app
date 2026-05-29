import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/auth/profile'
import { TransactionCreateSchema } from '@/lib/transactions/schemas'
import { ZodError } from 'zod'

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
    console.log('[transactions] POST raw body:', JSON.stringify(raw))
    body = TransactionCreateSchema.parse(raw)
  } catch (err) {
    if (err instanceof ZodError) {
      console.log('[transactions] Zod issues:', JSON.stringify(err.issues))
      const fieldErrors: Record<string, string> = {}
      for (const issue of err.issues) {
        const field = issue.path.join('.')
        fieldErrors[field] = issue.message
      }
      return NextResponse.json({ error: 'Invalid input', fieldErrors }, { status: 400 })
    }
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

  const txType = body.transaction_type ?? 'sale'
  const initialStatus = txType === 'lease' ? 'application' : 'offer'

  const insertPayload: Record<string, unknown> = {
    org_id:             profile.org_id,
    vehicle_id:         body.vehicle_id,
    transaction_type:   txType,
    pipeline_status:    initialStatus,
    status:             initialStatus,
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
  if (body.parties             != null) insertPayload.parties             = body.parties
  // Lease fields
  if (body.monthly_rent        != null) insertPayload.monthly_rent        = body.monthly_rent
  if (body.security_deposit    != null) insertPayload.security_deposit    = body.security_deposit
  if (body.lease_term_months   != null) insertPayload.lease_term_months   = body.lease_term_months
  if (body.move_in_date        != null) insertPayload.move_in_date        = body.move_in_date
  if (body.lease_end_date      != null) insertPayload.lease_end_date      = body.lease_end_date

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
 * GET /api/transactions?transaction_type=lease  — all org leases (for /leases page)
 * List transactions scoped to the authenticated org.
 */
export async function GET(req: NextRequest) {
  const profile = await requireProfile()
  const supabase = await createClient()

  const vehicleId = req.nextUrl.searchParams.get('vehicle_id')
  const txnType   = req.nextUrl.searchParams.get('transaction_type')

  // Org-wide lease listing (no vehicle_id required)
  if (txnType === 'lease' && !vehicleId) {
    const { data, error } = await supabase
      .from('transactions')
      .select('*, vehicle:vehicles(address_line1, city)')
      .eq('org_id', profile.org_id)
      .eq('transaction_type', 'lease')
      .order('created_at', { ascending: false })
      .limit(500)
    if (error) {
      console.error('[transactions] GET leases error:', error.message)
      return NextResponse.json({ error: 'Failed to load leases' }, { status: 500 })
    }
    return NextResponse.json({ transactions: data ?? [] })
  }

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
