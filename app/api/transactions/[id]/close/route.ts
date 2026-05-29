import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireProfile } from '@/lib/auth/profile'
import { isDealerAdmin } from '@/types/index'

export const runtime = 'nodejs'

/**
 * POST /api/transactions/[id]/close
 *
 * Confirms close on a transaction. Calls the close_re_transaction RPC which
 * atomically stores the commission snapshot and marks the vehicle sold.
 *
 * Authority: org owner/admin, OR sole member of the org.
 * Closing price and date are taken from the transaction record (set by agent via PATCH).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const profile = await requireProfile()
  const supabase = await createClient()
  const svc = createServiceClient()

  // Verify RE org
  const { data: org } = await supabase
    .from('organizations')
    .select('vertical')
    .eq('id', profile.org_id)
    .maybeSingle()

  if (!org || org.vertical !== 'real_estate') {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  // Authority check: admin/owner always; agent only if sole org member
  let hasAuthority = isDealerAdmin(profile.role)
  if (!hasAuthority) {
    const { count } = await svc
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', profile.org_id)
    hasAuthority = (count ?? 0) <= 1
  }
  if (!hasAuthority) {
    return NextResponse.json({ error: 'Only an admin or broker can confirm close' }, { status: 403 })
  }

  // Load transaction — must belong to this org
  const { data: txn } = await supabase
    .from('transactions')
    .select('id, closing_date, final_sale_price, pipeline_status, closing_price, transaction_type')
    .eq('id', id)
    .eq('org_id', profile.org_id)
    .maybeSingle()

  if (!txn) return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
  if (txn.transaction_type === 'lease') {
    return NextResponse.json({ error: 'Leases cannot be closed. Mark as expired or cancelled instead.' }, { status: 422 })
  }
  if (txn.pipeline_status === 'closed') {
    return NextResponse.json({ error: 'Transaction is already closed' }, { status: 409 })
  }

  // Accept closing_price/date from request body (agent may have pre-filled, or override here)
  let body: { closing_price?: number; closing_date?: string } = {}
  try { body = await req.json() } catch { /* optional body */ }

  const closingPrice = body.closing_price ?? txn.final_sale_price ?? txn.closing_price
  const closingDate  = body.closing_date  ?? txn.closing_date

  if (!closingPrice || closingPrice <= 0) {
    return NextResponse.json(
      { error: 'Enter a final sale price before confirming close.' },
      { status: 422 }
    )
  }
  if (!closingDate) {
    return NextResponse.json(
      { error: 'Enter a closing date before confirming close.' },
      { status: 422 }
    )
  }

  // Call the RPC — SECURITY DEFINER, handles commission snapshot + vehicle sold
  const { data: snapshot, error: rpcError } = await svc.rpc('close_re_transaction', {
    p_org_id:         profile.org_id,
    p_transaction_id: id,
    p_closing_price:  closingPrice,
    p_closing_date:   closingDate,
    p_closed_by:      profile.id,
  })

  if (rpcError) {
    const msg = rpcError.message ?? ''
    console.error('[transactions/close] RPC error:', msg)
    // Map known RPC error messages to safe user-facing responses
    if (msg.includes('already closed') || msg.includes('Already closed')) {
      return NextResponse.json({ error: 'Transaction is already closed.' }, { status: 422 })
    }
    if (msg.includes('not found') || msg.includes('No commission plan')) {
      return NextResponse.json({ error: 'Transaction not found or missing commission plan.' }, { status: 404 })
    }
    return NextResponse.json({ error: 'Failed to close transaction. Please try again.' }, { status: 500 })
  }

  return NextResponse.json({ success: true, commission_snapshot: snapshot }, { status: 200 })
}
