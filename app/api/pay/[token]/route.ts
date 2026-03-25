/**
 * Public payment API for BHPH customers.
 * GET  /api/pay/[token]            — fetch token details (amount, dealer name, vehicle)
 * POST /api/pay/[token]            — create Stripe PaymentIntent using dealer's secret key
 * POST /api/pay/[token]/confirm    — mark token paid + log bhph payment entry
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
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
  const { token } = await params
  const supabase  = createServiceClient()

  const body = await req.json().catch(() => ({ action: 'intent' }))
  const { action, payment_intent_id } = body as { action?: string; payment_intent_id?: string }

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

    const intentRes = await fetch('https://api.stripe.com/v1/payment_intents', {
      method: 'POST',
      headers: {
        Authorization:  `Bearer ${org.stripe_dealer_secret_key}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        amount:   String(Math.round(pt.amount * 100)),
        currency: 'usd',
        metadata: JSON.stringify({ bhph_payment_token: pt.id }),
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
    // payment_intent_id already destructured from body above

    const { data: pt } = await supabase
      .from('bhph_payment_tokens')
      .select('id, amount, status, org_id, customer_id, bhph_contract_id')
      .eq('token', token)
      .maybeSingle()

    if (!pt || pt.status !== 'pending') {
      return NextResponse.json({ error: 'Token invalid' }, { status: 410 })
    }

    // Mark token paid
    await supabase.from('bhph_payment_tokens').update({
      status:                 'paid',
      paid_at:                new Date().toISOString(),
      stripe_payment_intent_id: payment_intent_id ?? null,
    }).eq('id', pt.id)

    // Log payment activity
    await supabase.from('activities').insert({
      user_id:     pt.org_id,
      customer_id: pt.customer_id,
      type:        'note',
      direction:   'inbound',
      body:        `BHPH payment of $${pt.amount} received via Stripe online payment.`,
      priority:    'normal',
      completed_at: new Date().toISOString(),
    })

    // Advance total_paid on the contract
    const { data: contract } = await supabase
      .from('bhph_payments')
      .select('total_paid, monthly_payment, next_due_date, payment_frequency')
      .eq('id', pt.bhph_contract_id)
      .maybeSingle()

    if (contract) {
      const newTotalPaid = (Number(contract.total_paid) || 0) + Number(pt.amount)
      // Advance next_due_date by one payment period
      const nextDue = new Date(contract.next_due_date + 'T12:00:00')
      const freq    = contract.payment_frequency ?? 'monthly'
      if (freq === 'weekly')        nextDue.setDate(nextDue.getDate() + 7)
      else if (freq === 'biweekly') nextDue.setDate(nextDue.getDate() + 14)
      else                          nextDue.setMonth(nextDue.getMonth() + 1)

      await supabase.from('bhph_payments').update({
        total_paid:    newTotalPaid,
        next_due_date: nextDue.toISOString().slice(0, 10),
        last_reminder_type: null, // reset so next cycle sends fresh
      }).eq('id', pt.bhph_contract_id)
    }

    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
