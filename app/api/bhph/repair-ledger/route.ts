/**
 * POST /api/bhph/repair-ledger
 * Re-seed principal and replay ledger for all active interest-bearing contracts in the org.
 */

import { NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { canRecordBhphPayment } from '@/lib/auth/dealerRoles'
import { repairOrgBhphContracts } from '@/lib/bhph/ensureContractFinance'
import { createServiceClient } from '@/lib/supabase/service'
import type { UserRole } from '@/types/index'

export async function POST() {
  const profile = await requireProfile()
  if (!canRecordBhphPayment(profile.role as UserRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const service = createServiceClient()
  const result = await repairOrgBhphContracts(service, profile.org_id)

  if (!result.ok) {
    console.error('[bhph/repair-ledger]', result.error)
    return NextResponse.json({ error: 'Could not repair contracts' }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    scanned: result.scanned,
    repaired: result.repaired,
    errors: result.errors,
  })
}
