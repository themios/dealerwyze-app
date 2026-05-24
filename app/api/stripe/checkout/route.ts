import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/auth/profile'
import { canAccessBilling } from '@/lib/auth/dealerRoles'
import type { UserRole } from '@/types/index'
import {
  stripe, PRICE_ID, PRICE_ID_TIER2, PRICE_ID_TIER3, SMS_PRICE_ID, APP_URL,
  PRICE_ID_RE_STARTER, PRICE_ID_RE_PRO,
  type PlanTier, type SmsTier, priceIdForSmsTier,
} from '@/lib/stripe'

function priceIdForPlan(plan: PlanTier, vertical: string): string {
  if (vertical === 'real_estate') {
    // RE has 2 plans: tier1 = Starter $150, tier2+ = Pro $300
    if (plan === 'tier2' || plan === 'tier3') return PRICE_ID_RE_PRO || PRICE_ID_RE_STARTER || PRICE_ID
    return PRICE_ID_RE_STARTER || PRICE_ID
  }
  if (plan === 'tier2') return PRICE_ID_TIER2 || PRICE_ID
  if (plan === 'tier3') return PRICE_ID_TIER3 || PRICE_ID
  return PRICE_ID
}

export async function POST(req: Request) {
  const profile = await requireProfile()
  if (!canAccessBilling(profile.role as UserRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const supabase = await createClient()

  const { data: org } = await supabase
    .from('organizations')
    .select('stripe_customer_id, name, vertical')
    .eq('id', profile.org_id)
    .single()

  let customerId = org?.stripe_customer_id

  if (!customerId) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const customer = await stripe.customers.create({
      email: user.email,
      name: org?.name ?? undefined,
      metadata: { org_id: profile.org_id },
    })
    customerId = customer.id
    await supabase.from('organizations').update({ stripe_customer_id: customerId }).eq('id', profile.org_id)
  }

  const body = await req.json().catch(() => ({}))
  const plan: PlanTier = body.plan ?? 'tier1'
  const smsTier: SmsTier | null = body.smsTier ?? null
  const includeSms = body.includeSms === true  // legacy
  const vertical = (org?.vertical as string | null) ?? 'dealer'

  const lineItems: Array<{ price: string; quantity: number }> = [{ price: priceIdForPlan(plan, vertical), quantity: 1 }]

  if (smsTier) {
    // New tiered SMS add-on checkout
    const smsPrice = priceIdForSmsTier(smsTier)
    if (smsPrice) lineItems.push({ price: smsPrice, quantity: 1 })
  } else if (includeSms && plan === 'tier1') {
    // Legacy SMS add-on
    lineItems.push({ price: SMS_PRICE_ID, quantity: 1 })
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: lineItems,
    success_url: `${APP_URL}/settings/billing?success=1`,
    cancel_url: `${APP_URL}/settings/billing?canceled=1`,
    subscription_data: {
      trial_period_days: 14,
      metadata: { org_id: profile.org_id, plan, sms_tier: smsTier ?? '' },
    },
  })

  return NextResponse.json({ url: session.url })
}
