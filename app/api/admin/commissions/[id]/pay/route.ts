/**
 * PATCH /api/admin/commissions/[id]/pay
 * Marks all pending commissions for an affiliate code as paid.
 * [id] = affiliate_code (e.g. AFF-T7KR)
 * Body: { paid_via: string, payment_reference: string }
 * Rejects if pending_balance < $25 minimum.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { requirePlatformArea } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/service'
import { MIN_PAYOUT } from '@/lib/stripe/commissions'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await requireProfile()
  const denied  = await requirePlatformArea(profile.id, 'commissions')
  if (denied) return denied

  const { id: affiliateCode } = await params
  const body = await req.json().catch(() => ({}))
  const { paid_via, payment_reference } = body

  if (!paid_via) {
    return NextResponse.json({ error: 'paid_via is required' }, { status: 400 })
  }

  const service = createServiceClient()

  // Fetch all pending commissions for this code
  const { data: pending, error: fetchErr } = await service
    .from('commission_ledger')
    .select('id, amount')
    .eq('affiliate_code', affiliateCode)
    .eq('status', 'pending')

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  if (!pending || pending.length === 0) {
    return NextResponse.json({ error: 'No pending commissions for this affiliate' }, { status: 404 })
  }

  const total = pending.reduce((sum, r) => sum + Number(r.amount), 0)
  if (total < MIN_PAYOUT) {
    return NextResponse.json({
      error: `Balance $${total.toFixed(2)} is below the $${MIN_PAYOUT} minimum payout threshold`,
    }, { status: 422 })
  }

  const ids = pending.map(r => r.id)
  const { error: updateErr } = await service
    .from('commission_ledger')
    .update({
      status:            'paid',
      paid_at:           new Date().toISOString(),
      paid_via,
      payment_reference: payment_reference ?? null,
    })
    .in('id', ids)

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  return NextResponse.json({
    ok:               true,
    affiliate_code:   affiliateCode,
    events_paid:      ids.length,
    total_paid:       parseFloat(total.toFixed(2)),
    paid_via,
    payment_reference: payment_reference ?? null,
  })
}
