/**
 * POST /api/bhph/[id]/confirm-manual-payment
 * Dealer confirms a customer's PAID (Zelle/Venmo/Cash App) reply.
 */

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getProfile, normalizeOwnerRole, type Profile } from '@/lib/auth/profile'
import { getStaffSessionInfo } from '@/lib/auth/staffSession'
import type { UserRole } from '@/types/index'
import type { SupabaseClient } from '@supabase/supabase-js'
import { sendTwilioSms, toE164Us } from '@/lib/bhph/twilioOutbound'

const BodySchema = z.object({
  amount:       z.number().finite().positive(),
  paymentDate:  z.string().min(10),
  notes:        z.string().max(4000).optional(),
})

function todayUtcYmd(): string {
  return new Date().toISOString().slice(0, 10)
}

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
  const role = profile.role as UserRole
  if (role !== 'dealer_admin' && role !== 'dealer_manager' && role !== 'admin') {
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
    .select(`
      id, user_id, customer_id,
      customer:customers(name, primary_phone, sms_opt_out),
      vehicle:vehicles(year, make, model)
    `)
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
    p_payment_type:  'manual',
    p_notes:         body.notes ?? null,
    p_recorded_by:   profile.id,
  })

  if (rpcError) {
    console.error('[bhph/confirm-manual-payment] rpc', rpcError.message)
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
    new_balance?: number
    paid_off?: boolean
  } | null

  if (!row?.ok) {
    return NextResponse.json({ error: 'Could not record payment' }, { status: 500 })
  }

  const nowIso = new Date().toISOString()
  await supabase
    .from('bhph_payments')
    .update({
      manual_payment_confirmed_at: nowIso,
      manual_payment_confirmed_by: profile.id,
      pending_manual_payment_at: null,
      pending_manual_payment_amount: null,
    })
    .eq('id', contractId)
    .eq('user_id', profile.org_id)

  const { data: orgSettings } = await supabase
    .from('org_settings')
    .select('business_name')
    .eq('org_id', profile.org_id)
    .maybeSingle()

  const dealerName = (orgSettings?.business_name as string | null)?.trim() || 'your dealership'
  const rawCust = contract.customer as { name?: string; primary_phone?: string; sms_opt_out?: boolean } | null
  const rawVeh = contract.vehicle as unknown as { year: number; make: string; model: string } | null
  const vehicleLabel = rawVeh ? `${rawVeh.year} ${rawVeh.make} ${rawVeh.model}` : 'your vehicle'
  const first = (rawCust?.name ?? 'there').split(/\s+/)[0] ?? 'there'
  const amtStr = body.amount.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
  const smsBody =
    `Hi ${first}, your ${amtStr} payment for your ${vehicleLabel} has been confirmed by ${dealerName}. Thank you! Reply STOP to opt out.`

  if (rawCust?.primary_phone && !rawCust.sms_opt_out) {
    const to = toE164Us(rawCust.primary_phone)
    if (to) {
      void sendTwilioSms(to, smsBody).then(r => {
        if (!r.ok) console.error('[bhph/confirm-manual-payment] customer sms', r.error)
      })
    }
  }

  return NextResponse.json({
    ok: true,
    newBalance: row.new_balance,
    paidOff: !!row.paid_off,
  })
}
