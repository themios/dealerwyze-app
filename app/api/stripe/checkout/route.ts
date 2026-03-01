import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/auth/profile'
import { stripe, PRICE_ID, PRICE_ID_TIER2, PRICE_ID_TIER3, SMS_PRICE_ID, APP_URL, type PlanTier } from '@/lib/stripe'

function priceIdForPlan(plan: PlanTier): string {
  if (plan === 'tier2') return PRICE_ID_TIER2 || PRICE_ID
  if (plan === 'tier3') return PRICE_ID_TIER3 || PRICE_ID
  return PRICE_ID
}

export async function POST(req: Request) {
  const profile = await requireProfile()
  const supabase = await createClient()

  const { data: org } = await supabase
    .from('organizations')
    .select('stripe_customer_id, name')
    .eq('id', profile.org_id)
    .single()

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

  const body = await req.json().catch(() => ({}))
  const plan: PlanTier = body.plan ?? 'tier1'
  const includeSms = body.includeSms === true  // legacy

  const lineItems: Array<{ price: string; quantity: number }> = [{ price: priceIdForPlan(plan), quantity: 1 }]
  if (includeSms && plan === 'tier1') lineItems.push({ price: SMS_PRICE_ID, quantity: 1 })

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: lineItems,
    success_url: `${APP_URL}/settings/billing?success=1`,
    cancel_url: `${APP_URL}/settings/billing?canceled=1`,
    subscription_data: {
      trial_period_days: 14,
      metadata: { org_id: profile.org_id, plan },
    },
  })

  return NextResponse.json({ url: session.url })
}
