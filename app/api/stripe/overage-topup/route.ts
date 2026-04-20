import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/auth/profile'
import { canAccessBilling } from '@/lib/auth/dealerRoles'
import type { UserRole } from '@/types/index'
import { stripe, APP_URL } from '@/lib/stripe'

const VALID_AMOUNTS = [10, 25, 50, 100] as const
type TopupAmount = typeof VALID_AMOUNTS[number]

export async function POST(req: Request) {
  const profile = await requireProfile()
  if (!canAccessBilling(profile.role as UserRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const amount = body.amount as TopupAmount
  if (!VALID_AMOUNTS.includes(amount)) {
    return NextResponse.json({ error: 'Invalid amount. Choose $10, $25, $50, or $100.' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: org } = await supabase
    .from('organizations')
    .select('stripe_customer_id, name')
    .eq('id', profile.org_id)
    .single()

  // Ensure the org has a Stripe customer record
  let customerId = org?.stripe_customer_id
  if (!customerId) {
    const { data: { user } } = await supabase.auth.getUser()
    const customer = await stripe.customers.create({
      email: user!.email,
      name: org?.name ?? undefined,
      metadata: { org_id: profile.org_id },
    })
    customerId = customer.id
    await supabase.from('organizations').update({ stripe_customer_id: customerId }).eq('id', profile.org_id)
  }

  const amountCents = amount * 100

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: {
            name: `DealerWyze Overage Buffer — $${amount}`,
            description: 'Prepaid credit for SMS/MMS overage. Lasts until exhausted — never expires.',
          },
          unit_amount: amountCents,
        },
        quantity: 1,
      },
    ],
    metadata: {
      org_id: profile.org_id,
      topup_cents: String(amountCents),
      topup_type: 'overage_buffer',
    },
    saved_payment_method_options: { payment_method_save: 'enabled' },
    payment_intent_data: {
      metadata: {
        org_id: profile.org_id,
        topup_cents: String(amountCents),
        topup_type: 'overage_buffer',
      },
    },
    success_url: `${APP_URL}/settings/billing?topup=success&amount=${amount}`,
    cancel_url: `${APP_URL}/settings/billing?topup=canceled`,
  })

  return NextResponse.json({ url: session.url })
}
