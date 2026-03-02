import { NextRequest, NextResponse } from 'next/server'
import { stripe, tierFromPriceId, smsTierFromPriceId, PLAN_QUOTA, SMS_TIER_QUOTA } from '@/lib/stripe'
import { createServiceClient } from '@/lib/supabase/service'
import Stripe from 'stripe'

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')!

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const supabase = createServiceClient()

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const sub0 = await stripe.subscriptions.retrieve(session.subscription as string)
      const orgId = sub0.metadata?.org_id
      if (!orgId || !session.subscription) break

      const sub = sub0
      // Find CRM base price and optional SMS add-on price from line items
      let crmPriceId = sub.items.data[0].price.id
      let smsPriceId: string | undefined
      for (const item of sub.items.data) {
        const st = smsTierFromPriceId(item.price.id)
        if (st) { smsPriceId = item.price.id } else { crmPriceId = item.price.id }
      }
      const tier = tierFromPriceId(crmPriceId)
      const smsTier = smsPriceId ? smsTierFromPriceId(smsPriceId) : null
      const smsQuota = smsTier ? SMS_TIER_QUOTA[smsTier] : PLAN_QUOTA[tier]

      await supabase.from('organizations').update({
        stripe_subscription_id: sub.id,
        stripe_price_id: crmPriceId,
        subscription_status: sub.status,
        plan: 'active',
        sms_plan: smsTier ?? tier,
        sms_quota: smsQuota,
        current_period_end: (sub as unknown as { current_period_end?: number }).current_period_end
          ? new Date(((sub as unknown as { current_period_end: number }).current_period_end) * 1000).toISOString()
          : null,
        billing_cycle_start: new Date().toISOString().slice(0, 10),
        billing_cycle_end: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
        updated_at: new Date().toISOString(),
      }).eq('id', orgId)
      break
    }

    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription
      const orgId = sub.metadata?.org_id
      if (!orgId) break

      let crmPriceId: string | undefined
      let smsPriceId: string | undefined
      for (const item of sub.items.data) {
        const st = smsTierFromPriceId(item.price.id)
        if (st) { smsPriceId = item.price.id } else { crmPriceId = item.price.id }
      }
      const tier = crmPriceId ? tierFromPriceId(crmPriceId) : undefined
      const smsTier = smsPriceId ? smsTierFromPriceId(smsPriceId) : null
      const smsQuota = smsTier ? SMS_TIER_QUOTA[smsTier] : (tier ? PLAN_QUOTA[tier] : undefined)
      const quotaUpdate = smsQuota !== undefined
        ? { sms_plan: smsTier ?? tier, sms_quota: smsQuota }
        : {}

      await supabase.from('organizations').update({
        subscription_status: sub.status,
        plan: sub.status === 'active' || sub.status === 'trialing' ? 'active' : 'canceled',
        ...quotaUpdate,
        current_period_end: (sub as unknown as { current_period_end?: number }).current_period_end
          ? new Date(((sub as unknown as { current_period_end: number }).current_period_end) * 1000).toISOString()
          : null,
        updated_at: new Date().toISOString(),
      }).eq('id', orgId)
      break
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription
      const orgId = sub.metadata?.org_id
      if (!orgId) break

      await supabase.from('organizations').update({
        subscription_status: 'canceled',
        plan: 'canceled',
        updated_at: new Date().toISOString(),
      }).eq('id', orgId)
      break
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice & { subscription?: string | null }
      if (!invoice.subscription) break
      const sub = await stripe.subscriptions.retrieve(invoice.subscription as string)
      const orgId = sub.metadata?.org_id
      if (!orgId) break

      await supabase.from('organizations').update({
        subscription_status: 'past_due',
        updated_at: new Date().toISOString(),
      }).eq('id', orgId)
      break
    }
  }

  return NextResponse.json({ received: true })
}
