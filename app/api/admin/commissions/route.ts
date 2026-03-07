/**
 * GET /api/admin/commissions — list commission balances per affiliate code
 * Platform superadmin only.
 */
import { NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { requirePlatformSuperAdmin } from '@/lib/auth/platform'
import { getCommissionSummaries, MIN_PAYOUT } from '@/lib/stripe/commissions'

export async function GET() {
  const profile = await requireProfile()
  const denied  = await requirePlatformSuperAdmin(profile.id)
  if (denied) return denied

  const summaries = await getCommissionSummaries()
  return NextResponse.json({ commissions: summaries, min_payout: MIN_PAYOUT })
}
