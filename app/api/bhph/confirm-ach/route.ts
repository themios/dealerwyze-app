/**
 * POST /api/bhph/confirm-ach
 * After Stripe.js confirms SetupIntent — attach PM, update contract, insert bhph_payment_methods, SMS customer.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase/service'
import { paymentLimiter } from '@/lib/rateLimit/upstash'
import { verifyAchSetupToken } from '@/lib/bhph/achSetupToken'
import { sendTwilioSms, toE164Us } from '@/lib/bhph/twilioOutbound'

const BodySchema = z.object({
  token: z.string().min(10),
  setupIntentId: z.string().min(3),
})

type StripePm = {
  id?: string
  type?: string
  us_bank_account?: { bank_name?: string; last4?: string }
}

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
      id, user_id, customer_id, monthly_payment, status, stripe_customer_id,
      customer:customers(id, name, primary_phone, sms_opt_out),
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
    .select('stripe_dealer_secret_key')
    .eq('org_id', orgId)
    .maybeSingle()

  const secret = orgRow?.stripe_dealer_secret_key as string | null
  if (!secret?.trim()) {
    return NextResponse.json({ error: 'Payments are not configured for this dealer.' }, { status: 422 })
  }

  const siRes = await fetch(
    `https://api.stripe.com/v1/setup_intents/${encodeURIComponent(body.setupIntentId)}`,
    {
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(15_000),
    },
  )
  const siJson = (await siRes.json()) as {
    status?: string
    customer?: string
    payment_method?: string
    error?: { message?: string }
  }
  if (!siRes.ok) {
    console.error('[confirm-ach] setup_intent retrieve', { message: siJson.error?.message })
    return NextResponse.json({ error: 'Could not verify bank setup.' }, { status: 502 })
  }

  const pmId = siJson.payment_method
  if (!pmId || siJson.status !== 'succeeded') {
    const verificationStatus =
      siJson.status === 'requires_action' || siJson.status === 'processing' ? 'pending' : 'pending'
    return NextResponse.json({
      ok: true,
      verificationStatus,
      last4: null,
      bankName: null,
      message: 'Bank verification may take a short time. We will text you when it is ready.',
    })
  }

  const stripeCustomerId = row.stripe_customer_id as string | null
  if (!stripeCustomerId || siJson.customer !== stripeCustomerId) {
    return NextResponse.json({ error: 'Customer mismatch. Please restart bank setup.' }, { status: 409 })
  }

  const pmRes = await fetch(
    `https://api.stripe.com/v1/payment_methods/${encodeURIComponent(pmId)}`,
    {
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(15_000),
    },
  )
  const pmJson = (await pmRes.json()) as StripePm & { error?: { message?: string } }
  if (!pmRes.ok || pmJson.type !== 'us_bank_account') {
    console.error('[confirm-ach] payment_method', { message: pmJson.error?.message, type: pmJson.type })
    return NextResponse.json({ error: 'Bank account could not be verified.' }, { status: 422 })
  }

  const bankName = pmJson.us_bank_account?.bank_name ?? null
  const last4 = pmJson.us_bank_account?.last4 ?? null

  const bankVerificationStatus: 'verified' | 'pending' =
    siJson.status === 'succeeded' && last4 ? 'verified' : 'pending'

  const nowIso = new Date().toISOString()

  await supabase
    .from('bhph_payments')
    .update({
      stripe_payment_method_id: pmId,
      payment_method_type: 'ach',
      bank_verification_status: bankVerificationStatus,
      bank_verified_at: bankVerificationStatus === 'verified' ? nowIso : null,
    })
    .eq('id', contractId)
    .eq('user_id', orgId)

  await supabase.from('bhph_payment_methods').insert({
    org_id: orgId,
    customer_id: row.customer_id as string,
    bhph_id: contractId,
    stripe_pm_id: pmId,
    bank_name: bankName,
    last4,
    verification_status: bankVerificationStatus,
    is_default: true,
  })

  const cust = row.customer as { name?: string; primary_phone?: string; sms_opt_out?: boolean } | null
  const vehicle = row.vehicle as unknown as { year: number; make: string; model: string } | null
  const vehicleLabel = vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : 'vehicle'
  const firstName = (cust?.name ?? 'there').split(/\s+/)[0]

  if (cust?.primary_phone && !cust.sms_opt_out) {
    const to = toE164Us(cust.primary_phone)
    if (to && last4) {
      const msg =
        `Hi ${firstName}, your bank account ending in ${last4} is set up for automatic ` +
        `payments on your ${vehicleLabel}. No action needed each month.`
      const sent = await sendTwilioSms(to, msg)
      if (!sent.ok) {
        console.error('[confirm-ach] confirmation sms', { error: sent.error })
      }
    }
  }

  return NextResponse.json({
    ok: true,
    verificationStatus: bankVerificationStatus,
    last4,
    bankName,
  })
}
