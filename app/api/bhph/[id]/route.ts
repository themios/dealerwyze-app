/**
 * PATCH /api/bhph/[id] — update BHPH contract (GPS device, financing terms).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/auth/profile'
import { canAccessBhph } from '@/lib/auth/dealerRoles'
import { BhphGpsPatchSchema } from '@/lib/bhph/gpsDevice'
import {
  BhphContractTermsPatchSchema,
  buildContractTermsUpdate,
  interestRateStoredToDecimal,
} from '@/lib/bhph/contractTerms'
import { canonicalOutstandingBalance, financedPrincipalAmount } from '@/lib/bhph/balance'
import { createServiceClient } from '@/lib/supabase/service'
import { applyBhphLedgerReplay } from '@/lib/bhph/applyLedgerReplay'
import { ensureBhphContractFinance } from '@/lib/bhph/ensureContractFinance'
import type { UserRole } from '@/types/index'

interface Params {
  params: Promise<{ id: string }>
}

function hasGpsFields(body: Record<string, unknown>): boolean {
  return (
    'gps_vendor' in body ||
    'gps_device_id' in body ||
    'gps_installed_at' in body ||
    'gps_notes' in body
  )
}

function hasTermsFields(body: Record<string, unknown>): boolean {
  return (
    'annual_interest_rate_percent' in body ||
    'monthly_payment' in body ||
    'payment_frequency' in body ||
    'payment_day' in body ||
    'notes' in body
  )
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params
  const profile = await requireProfile()
  if (!canAccessBhph(profile.role as UserRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!hasGpsFields(body) && !hasTermsFields(body)) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const supabase = await createClient()

  const { data: existing, error: loadErr } = await supabase
    .from('bhph_payments')
    .select(
      'id, loan_amount, down_payment, total_paid, principal_balance, interest_rate, monthly_payment, payment_frequency, payment_day_anchor, notes',
    )
    .eq('id', id)
    .eq('user_id', profile.org_id)
    .maybeSingle()

  if (loadErr || !existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const update: Record<string, unknown> = {}

  if (hasGpsFields(body)) {
    const gpsParsed = BhphGpsPatchSchema.safeParse(body)
    if (!gpsParsed.success) {
      const msg = gpsParsed.error.issues[0]?.message ?? 'Invalid GPS fields'
      return NextResponse.json({ error: msg }, { status: 400 })
    }
    update.gps_vendor = gpsParsed.data.gps_vendor
    update.gps_device_id = gpsParsed.data.gps_device_id
    update.gps_installed_at = gpsParsed.data.gps_installed_at
    update.gps_notes = gpsParsed.data.gps_notes
  }

  if (hasTermsFields(body)) {
    const termsParsed = BhphContractTermsPatchSchema.safeParse(body)
    if (!termsParsed.success) {
      const issue = termsParsed.error.issues[0]
      const msg = issue
        ? `${issue.path.join('.') || 'terms'}: ${issue.message}`
        : 'Invalid contract terms'
      return NextResponse.json({ error: msg }, { status: 400 })
    }
    Object.assign(update, buildContractTermsUpdate(termsParsed.data))

    const newRate =
      'interest_rate' in update
        ? (update.interest_rate as number)
        : interestRateStoredToDecimal(existing.interest_rate)

    if (newRate > 0 && existing.principal_balance == null) {
      const financed =
        financedPrincipalAmount(existing) ??
        canonicalOutstandingBalance(existing)
      if (financed != null && financed > 0) {
        update.principal_balance = financed
      }
    }
  }

  const selectCols = [
    'id',
    'interest_rate',
    'monthly_payment',
    'payment_frequency',
    'payment_day_anchor',
    'notes',
    'principal_balance',
  ]
  if (hasGpsFields(body)) {
    selectCols.push('gps_vendor', 'gps_device_id', 'gps_installed_at', 'gps_notes')
  }

  const { data, error } = await supabase
    .from('bhph_payments')
    .update(update)
    .eq('id', id)
    .eq('user_id', profile.org_id)
    .select(selectCols.join(', '))
    .maybeSingle()

  if (error) {
    console.error('[bhph PATCH] update:', error.message, error.details, error.hint)
    const hint =
      error.message?.includes('gps_') && error.message.includes('does not exist')
        ? 'Database migration 227_bhph_gps_device.sql is not applied yet. Contract terms can still be saved without GPS fields.'
        : error.message
    return NextResponse.json(
      {
        error: 'Could not save contract',
        detail: process.env.NODE_ENV === 'development' ? hint : undefined,
      },
      { status: 500 },
    )
  }
  if (!data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  let rebuild: { totalInterestPaid?: number; paymentsUpdated?: number } | undefined
  if (
    hasTermsFields(body) &&
    'interest_rate' in update &&
    typeof update.interest_rate === 'number' &&
    update.interest_rate > 0
  ) {
    const service = createServiceClient()
    await ensureBhphContractFinance(service, id, profile.org_id)
    const replayResult = await applyBhphLedgerReplay(service, id, profile.org_id)
    if (replayResult.ok) {
      rebuild = {
        totalInterestPaid: replayResult.totalInterestPaid,
        paymentsUpdated: replayResult.paymentsUpdated,
      }
    }
  }

  return NextResponse.json({ ok: true, contract: data, rebuild })
}
