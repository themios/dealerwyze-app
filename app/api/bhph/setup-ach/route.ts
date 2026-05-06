/**
 * POST /api/bhph/setup-ach
 * Public: signed setup token in body (no contract id in URL).
 * Creates Stripe Customer (if needed), SetupIntent (us_bank_account + Financial Connections).
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase/service'
import { paymentLimiter } from '@/lib/rateLimit/upstash'
import { verifyAchSetupToken, maskContractId } from '@/lib/bhph/achSetupToken'

const BodySchema = z.object({
  token: z.string().min(10),
})

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const { allowed } = await paymentLimiter(ip)
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 })
  }

  let body: z.infer<typeof BodySchema>
  try {
    body = BodySchema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const verified = verifyAchSetupToken(body.token)
  if (!verified) {
    return NextResponse.json({ error: 'Invalid or expired link.' }, { status: 410 })
  }

  const contractId = verified.contractId
  const supabase = createServiceClient()

  const { data: row, error } = await supabase
    .from('bhph_payments')
    .select(`
      id, user_id, customer_id, monthly_payment, status, payment_method_type,
      stripe_customer_id,
      customer:customers(id, name),
      vehicle:vehicles(year, make, model)
    `)
    .eq('id', contractId)
    .maybeSingle()

  if (error || !row) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  }

  if (row.status !== 'active') {
    return NextResponse.json({ error: 'This contract is not active.' }, { status: 409 })
  }

  const orgId = row.user_id as string
  const { data: orgRow } = await supabase
    .from('org_settings')
    .select('business_name, stripe_dealer_secret_key, stripe_dealer_publishable_key')
    .eq('org_id', orgId)
    .maybeSingle()

  const secret = orgRow?.stripe_dealer_secret_key as string | null
  if (!secret?.trim()) {
    return NextResponse.json({ error: 'Online payments are not configured for this dealer.' }, { status: 422 })
  }

  const publishable =
    (orgRow?.stripe_dealer_publishable_key as string | null)?.trim() ||
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ||
    ''

  let stripeCustomerId = row.stripe_customer_id as string | null
  const customerName =
    (Array.isArray(row.customer) ? row.customer[0]?.name : (row.customer as { name?: string } | null)?.name) ??
    'Customer'
  const veh = row.vehicle as { year: number; make: string; model: string } | { year: number; make: string; model: string }[] | null
  const vehicle = Array.isArray(veh) ? veh[0] : veh
  const vehicleDescription = vehicle
    ? `${vehicle.year} ${vehicle.make} ${vehicle.model}`
    : 'vehicle'

  if (!stripeCustomerId) {
    const custRes = await fetch('https://api.stripe.com/v1/customers', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        name: customerName,
        'metadata[bhph_contract_id]': contractId,
        'metadata[org_id]': orgId,
      }),
      signal: AbortSignal.timeout(15_000),
    })
    const custJson = (await custRes.json()) as { id?: string; error?: { message?: string } }
    if (!custRes.ok || !custJson.id) {
      console.error('[setup-ach] stripe customer', { message: custJson.error?.message })
      return NextResponse.json({ error: 'Could not start bank setup.' }, { status: 502 })
    }
    stripeCustomerId = custJson.id
    await supabase
      .from('bhph_payments')
      .update({ stripe_customer_id: stripeCustomerId })
      .eq('id', contractId)
      .eq('user_id', orgId)
  }

  const qs = new URLSearchParams({
    customer: stripeCustomerId,
    'payment_method_types[]': 'us_bank_account',
    'payment_method_options[us_bank_account][financial_connections][permissions][]': 'payment_method',
    'metadata[bhph_contract_id]': contractId,
    'metadata[org_id]': orgId,
  })

  const siRes = await fetch('https://api.stripe.com/v1/setup_intents', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: qs,
    signal: AbortSignal.timeout(20_000),
  })
  const siJson = (await siRes.json()) as { client_secret?: string; error?: { message?: string; code?: string } }
  if (!siRes.ok || !siJson.client_secret) {
    console.error('[setup-ach] setup_intent', { code: siJson.error?.code, message: siJson.error?.message })
    return NextResponse.json({ error: 'Could not start bank setup.' }, { status: 502 })
  }

  return NextResponse.json({
    clientSecret: siJson.client_secret,
    customerId: stripeCustomerId,
    contractIdMasked: maskContractId(contractId),
    vehicleDescription,
    amount: Number(row.monthly_payment),
    publishableKey: publishable,
    dealerName: (orgRow?.business_name as string | null) ?? 'Your dealer',
  })
}
