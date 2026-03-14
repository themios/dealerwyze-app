/**
 * POST /api/admin/affiliates/[code]/transfer
 * Transfers all organizations (and their commission history) from one
 * affiliate code to another. Used when a salesperson leaves.
 *
 * [code] = source affiliate code (the departing rep)
 * Body:  { to_code: string, transfer_commissions?: boolean }
 *
 * - All orgs with affiliate_code=[code] → updated to affiliate_code=[to_code]
 * - If transfer_commissions=true (default): pending commission_ledger rows
 *   for [code] are re-attributed to [to_code]
 * - Does NOT delete the source affiliate_code (keep for audit trail)
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { requirePlatformArea } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/service'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const profile = await requireProfile()
  const denied  = await requirePlatformArea(profile.id, 'affiliates')
  if (denied) return denied

  const { code: fromCode } = await params
  const body = await req.json().catch(() => ({}))
  const { to_code, transfer_commissions = true } = body

  if (!to_code) {
    return NextResponse.json({ error: 'to_code is required' }, { status: 400 })
  }
  if (fromCode === to_code) {
    return NextResponse.json({ error: 'Source and destination codes are the same' }, { status: 400 })
  }

  const service = createServiceClient()

  // Verify both codes exist
  const [{ data: from }, { data: to }] = await Promise.all([
    service.from('affiliate_codes').select('code').eq('code', fromCode).single(),
    service.from('affiliate_codes').select('code').eq('code', to_code).single(),
  ])

  if (!from) return NextResponse.json({ error: `Source code ${fromCode} not found` }, { status: 404 })
  if (!to)   return NextResponse.json({ error: `Destination code ${to_code} not found` }, { status: 404 })

  // Transfer orgs
  const { data: orgs, error: orgsErr } = await service
    .from('organizations')
    .update({ affiliate_code: to_code })
    .eq('affiliate_code', fromCode)
    .select('id')

  if (orgsErr) return NextResponse.json({ error: orgsErr.message }, { status: 500 })

  // Transfer pending commissions
  let commissionsTransferred = 0
  if (transfer_commissions) {
    const { data: comms, error: commsErr } = await service
      .from('commission_ledger')
      .update({ affiliate_code: to_code })
      .eq('affiliate_code', fromCode)
      .eq('status', 'pending')
      .select('id')

    if (commsErr) return NextResponse.json({ error: commsErr.message }, { status: 500 })
    commissionsTransferred = comms?.length ?? 0
  }

  // Deactivate source code
  await service
    .from('affiliate_codes')
    .update({ is_active: false })
    .eq('code', fromCode)

  return NextResponse.json({
    ok:                      true,
    from_code:               fromCode,
    to_code,
    orgs_transferred:        orgs?.length ?? 0,
    commissions_transferred: commissionsTransferred,
    source_deactivated:      true,
  })
}
