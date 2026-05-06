/**
 * POST /api/bhph/[id]/payment — record manual BHPH payment (cash/check/in-person).
 * Same allocation rules as Stripe finalize (see record_bhph_manual_payment RPC).
 */

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getProfile, normalizeOwnerRole, type Profile } from '@/lib/auth/profile'
import { getStaffSessionInfo } from '@/lib/auth/staffSession'
import { canAccessBhph } from '@/lib/auth/dealerRoles'
import type { UserRole } from '@/types/index'
import type { SupabaseClient } from '@supabase/supabase-js'

const BodySchema = z.object({
  amount:        z.number().finite().positive(),
  paymentDate:   z.string().min(10),
  paymentType:   z.enum(['regular', 'partial', 'extra', 'payoff']),
  notes:         z.string().max(4000).optional(),
})

function todayUtcYmd(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Mirrors requireProfile() (including staff org override) but returns 401 JSON instead of redirect. */
async function requireProfileForBhphApi(): Promise<
  | { profile: Profile; supabase: SupabaseClient }
  | NextResponse
> {
  const supabase = await createClient()
  const profile = await getProfile()
  if (!profile?.org_id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (profile.deactivated_at) {
    await (supabase as SupabaseClient).auth.signOut()
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const jar = await cookies()
  const staffSession = getStaffSessionInfo(jar)
  const effective = staffSession?.orgId
    ? normalizeOwnerRole({ ...profile, org_id: staffSession.orgId })
    : normalizeOwnerRole(profile)
  return { profile: effective, supabase }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireProfileForBhphApi()
  if (auth instanceof NextResponse) return auth

  const { profile, supabase } = auth
  if (!canAccessBhph(profile.role as UserRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id: contractId } = await params

  let body: z.infer<typeof BodySchema>
  try {
    const raw: unknown = JSON.parse(await req.text())
    const parsed = BodySchema.safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }
    body = parsed.data
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const payDay = body.paymentDate.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(payDay)) {
    return NextResponse.json({ error: 'Invalid payment date' }, { status: 400 })
  }
  if (payDay > todayUtcYmd()) {
    return NextResponse.json({ error: 'Payment date cannot be in the future' }, { status: 400 })
  }

  const { data: contract, error: cErr } = await supabase
    .from('bhph_payments')
    .select('id, user_id')
    .eq('id', contractId)
    .maybeSingle()

  if (cErr || !contract) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (contract.user_id !== profile.org_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: rpcData, error: rpcError } = await supabase.rpc('record_bhph_manual_payment', {
    p_contract_id:   contractId,
    p_amount:        body.amount,
    p_payment_date:  payDay,
    p_payment_type:  body.paymentType,
    p_notes:         body.notes ?? null,
    p_recorded_by:   profile.id,
  })

  if (rpcError) {
    console.error('[bhph/payment] rpc error:', rpcError.message)
    const code = rpcError.code ?? ''
    const msg = rpcError.message ?? ''
    if (code === '23514' || msg.includes('bhph_payment_future_date')) {
      return NextResponse.json({ error: 'Payment date cannot be in the future' }, { status: 400 })
    }
    if (msg.includes('bhph_manual_payment_forbidden')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (msg.includes('bhph_manual_payment_bad_amount') || msg.includes('bhph_manual_payment_bad_type')) {
      return NextResponse.json({ error: 'Invalid payment' }, { status: 400 })
    }
    return NextResponse.json({ error: 'Could not record payment' }, { status: 500 })
  }

  const row = rpcData as {
    ok?: boolean
    ledger_id?: string
    new_balance?: number
    paid_off?: boolean
    interest_portion?: number
    principal_portion?: number
  } | null

  if (!row?.ok) {
    return NextResponse.json({ error: 'Could not record payment' }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    ledgerEntry: {
      id:                 row.ledger_id,
      interestPortion:    row.interest_portion,
      principalPortion:   row.principal_portion,
    },
    newBalance: row.new_balance,
    paidOff:    !!row.paid_off,
  })
}
