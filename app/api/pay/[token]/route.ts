/**
 * Public payment API for BHPH customers.
 * GET  /api/pay/[token]            — fetch token details (amount, dealer name, vehicle)
 * POST /api/pay/[token]            — create Stripe PaymentIntent using dealer's secret key
 * POST /api/pay/[token]/confirm    — mark token paid + log bhph payment entry
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { paymentLimiter } from '@/lib/rateLimit/upstash'
import { PayTokenPostSchema, parseBody } from '@/lib/validation/schemas'
import { logOrgAudit } from '@/lib/audit/orgAudit'

interface StripePaymentIntentResponse {
  id: string
  status: string
  amount: number
  currency: string
  metadata?: Record<string, string>
}

async function recordPaymentLinkView(supabase: ReturnType<typeof createServiceClient>, tokenId: string) {
  const now = new Date().toISOString()

  await supabase
    .from('bhph_payment_tokens')
    .update({
      last_viewed_at: now,
      first_viewed_at: now,
    })
    .eq('id', tokenId)
    .is('first_viewed_at', null)

  const { data: tokenRow } = await supabase
    .from('bhph_payment_tokens')
    .select('view_count')
    .eq('id', tokenId)
    .maybeSingle()

  await supabase
    .from('bhph_payment_tokens')
    .update({
      last_viewed_at: now,
      view_count: ((tokenRow?.view_count as number | null) ?? 0) + 1,
    })
    .eq('id', tokenId)

  const { data: latestReminder } = await supabase
    .from('payment_reminder_log')
    .select('id, click_count')
    .eq('payment_token_id', tokenId)
    .eq('channel', 'sms')
    .eq('status', 'sent')
    .order('sent_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!latestReminder?.id) return

  await supabase
    .from('payment_reminder_log')
    .update({
      clicked_at: now,
      click_count: ((latestReminder.click_count as number | null) ?? 0) + 1,
    })
    .eq('id', latestReminder.id)
}

async function markReminderTokenPaid(
  supabase: ReturnType<typeof createServiceClient>,
  tokenId: string,
  paidAt: string
) {
  await supabase
    .from('payment_reminder_log')
    .update({ paid_at: paidAt })
    .eq('payment_token_id', tokenId)
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const { allowed } = await paymentLimiter(ip)
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 })
  }

  const { token } = await params
  const supabase  = createServiceClient()

  const { data: pt } = await supabase
    .from('bhph_payment_tokens')
    .select(`
      id, amount, status, expires_at, org_id, customer_id, bhph_contract_id,
      customers(name),
      bhph_payments!bhph_contract_id(monthly_payment, next_due_date,
        vehicles(year, make, model))
    `)
    .eq('token', token)
    .maybeSingle()

  if (!pt)                              return NextResponse.json({ error: 'Not found' },  { status: 404 })
  if (pt.status === 'paid')             return NextResponse.json({ error: 'Already paid' }, { status: 410 })
  if (new Date(pt.expires_at) < new Date()) return NextResponse.json({ error: 'Expired' }, { status: 410 })

  await recordPaymentLinkView(supabase, pt.id)

  // Fetch org settings — dealer name + Stripe publishable key (safe to expose)
  const { data: org } = await supabase
    .from('org_settings')
    .select('business_name, stripe_dealer_publishable_key')
    .eq('org_id', pt.org_id)
    .maybeSingle()

  const customer  = Array.isArray(pt.customers)   ? pt.customers[0]   : pt.customers
  const contract  = Array.isArray(pt.bhph_payments) ? pt.bhph_payments[0] : pt.bhph_payments
  const vehicle   = contract && (Array.isArray((contract as Record<string,unknown>).vehicles)
    ? ((contract as Record<string,unknown>).vehicles as Array<{year:number;make:string;model:string}>)[0]
    : (contract as Record<string,unknown>).vehicles) as {year:number;make:string;model:string} | null

  return NextResponse.json({
    amount:            pt.amount,
    customer_name:     (customer as {name:string} | null)?.name ?? 'Customer',
    dealer_name:       org?.business_name ?? 'Your Dealer',
    vehicle_label:     vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : null,
    stripe_publishable_key: org?.stripe_dealer_publishable_key ?? null,
  })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const { allowed } = await paymentLimiter(ip)
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 })
  }

  const { token } = await params
  const supabase  = createServiceClient()

  const parsed = await parseBody(req, PayTokenPostSchema)
  if (parsed.errorResponse) return parsed.errorResponse
  const { action } = parsed.data
  const payment_intent_id = 'payment_intent_id' in parsed.data ? parsed.data.payment_intent_id : undefined

  // ── Create PaymentIntent ──────────────────────────────────────────────────
  if (action === 'intent' || !action) {
    const { data: pt } = await supabase
      .from('bhph_payment_tokens')
      .select('id, amount, status, expires_at, org_id')
      .eq('token', token)
      .maybeSingle()

    if (!pt || pt.status !== 'pending' || new Date(pt.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Token invalid or expired' }, { status: 410 })
    }

    const { data: org } = await supabase
      .from('org_settings')
      .select('stripe_dealer_secret_key')
      .eq('org_id', pt.org_id)
      .maybeSingle()

    if (!org?.stripe_dealer_secret_key) {
      return NextResponse.json({ error: 'Online payments not configured for this dealer' }, { status: 422 })
    }

    const intentAbort = AbortSignal.timeout(10_000)
    const intentRes = await fetch('https://api.stripe.com/v1/payment_intents', {
      method: 'POST',
      signal: intentAbort,
      headers: {
        Authorization:  `Bearer ${org.stripe_dealer_secret_key}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        amount:   String(Math.round(pt.amount * 100)),
        currency: 'usd',
        'metadata[bhph_payment_token]': pt.id,
      }),
    })

    if (!intentRes.ok) {
      return NextResponse.json({ error: 'Payment setup failed' }, { status: 502 })
    }

    const intent = await intentRes.json()
    return NextResponse.json({ client_secret: intent.client_secret })
  }

  // ── Confirm payment ───────────────────────────────────────────────────────
  if (action === 'confirm') {
    if (!payment_intent_id) {
      return NextResponse.json({ error: 'payment_intent_id is required' }, { status: 400 })
    }

    const { data: pt } = await supabase
      .from('bhph_payment_tokens')
      .select('id, amount, status, org_id, customer_id, bhph_contract_id')
      .eq('token', token)
      .maybeSingle()

    if (!pt || pt.status !== 'pending') {
      return NextResponse.json({ error: 'Token invalid' }, { status: 410 })
    }

    const { data: org } = await supabase
      .from('org_settings')
      .select('stripe_dealer_secret_key')
      .eq('org_id', pt.org_id)
      .maybeSingle()

    if (!org?.stripe_dealer_secret_key) {
      return NextResponse.json({ error: 'Online payments not configured for this dealer' }, { status: 422 })
    }

    const verifyRes = await fetch(
      `https://api.stripe.com/v1/payment_intents/${encodeURIComponent(payment_intent_id)}`,
      {
        signal: AbortSignal.timeout(10_000),
        headers: {
          Authorization: `Bearer ${org.stripe_dealer_secret_key}`,
        },
      },
    )

    if (!verifyRes.ok) {
      return NextResponse.json({ error: 'Payment verification failed' }, { status: 502 })
    }

    const paymentIntent = await verifyRes.json() as StripePaymentIntentResponse
    const expectedAmount = Math.round(pt.amount * 100)

    if (paymentIntent.status !== 'succeeded') {
      return NextResponse.json({ error: 'Payment not completed' }, { status: 409 })
    }
    if (paymentIntent.amount !== expectedAmount || paymentIntent.currency.toLowerCase() !== 'usd') {
      return NextResponse.json({ error: 'Payment details do not match token' }, { status: 409 })
    }
    if (paymentIntent.metadata?.bhph_payment_token !== pt.id) {
      return NextResponse.json({ error: 'Payment does not belong to this token' }, { status: 409 })
    }

    const paidAt = new Date().toISOString()

    const { data: rpcResult, error: rpcError } = await supabase.rpc('finalize_bhph_payment', {
      p_token_id:              pt.id,
      p_stripe_payment_intent: payment_intent_id,
      p_paid_at:               paidAt,
    })

    if (rpcError) {
      console.error('[pay/confirm] finalize_bhph_payment rpc error:', rpcError.message)
      return NextResponse.json({ error: 'Could not finalize payment' }, { status: 500 })
    }

    const result = rpcResult as { ok?: boolean; already_processed?: boolean; conflict?: boolean } | null

    if (result?.conflict) {
      return NextResponse.json({ error: 'Token already processed' }, { status: 409 })
    }

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null

    if (result?.already_processed) {
      await markReminderTokenPaid(supabase, pt.id, paidAt)
      void logOrgAudit({ org_id: pt.org_id, actor_type: 'system', action: 'bhph_payment_idempotent',
        ip, details: { token_id: pt.id, payment_intent_id } })
      return NextResponse.json({ ok: true, already_processed: true })
    }

    await markReminderTokenPaid(supabase, pt.id, paidAt)

    void logOrgAudit({ org_id: pt.org_id, actor_type: 'system', action: 'bhph_payment_confirmed',
      ip, details: { token_id: pt.id, payment_intent_id, amount: pt.amount } })

    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
