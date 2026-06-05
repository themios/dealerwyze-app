/**
 * POST /api/bhph/[id]/rebuild-ledger
 * Re-allocates interest/principal on all ledger rows and syncs contract totals.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireProfile } from '@/lib/auth/profile'
import { canRecordBhphPayment } from '@/lib/auth/dealerRoles'
import { ensureBhphContractFinance } from '@/lib/bhph/ensureContractFinance'
import type { UserRole } from '@/types/index'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: contractId } = await params
  const profile = await requireProfile()
  if (!canRecordBhphPayment(profile.role as UserRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = await createClient()
  const { data: contract } = await supabase
    .from('bhph_payments')
    .select('id')
    .eq('id', contractId)
    .eq('user_id', profile.org_id)
    .maybeSingle()

  if (!contract) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const service = createServiceClient()
  const result = await ensureBhphContractFinance(service, contractId, profile.org_id)

  if (!result.ok) {
    console.error('[bhph/rebuild-ledger]', result.error)
    return NextResponse.json({ error: 'Could not recalculate interest' }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    repaired: result.repaired,
    principalBalance: result.principalBalance,
    totalInterestPaid: result.totalInterestPaid,
    ledgerReplayed: result.ledgerReplayed,
  })
}
