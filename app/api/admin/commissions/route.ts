/**
 * GET /api/admin/commissions — list commission balances per affiliate code
 * Platform superadmin only.
 */
import { type NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { requirePlatformArea } from '@/lib/auth/platform'
import { getCommissionSummaries, MIN_PAYOUT } from '@/lib/stripe/commissions'
import { getAdminVerticalScope } from '@/lib/admin/verticalScope'

export async function GET(req: NextRequest) {
  const profile = await requireProfile()
  const denied  = await requirePlatformArea(profile.id, 'commissions')
  if (denied) return denied

  const scope = await getAdminVerticalScope(req)
  const vertical = scope.isRE ? 'real_estate' : 'dealer'

  const summaries = await getCommissionSummaries(vertical)
  return NextResponse.json({ commissions: summaries, min_payout: MIN_PAYOUT })
}
