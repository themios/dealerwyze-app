import { NextRequest, NextResponse } from 'next/server'
import { stripe, tierFromPriceId, smsTierFromPriceId, PLAN_QUOTA, SMS_TIER_QUOTA } from '@/lib/stripe'
import { createServiceClient } from '@/lib/supabase/service'
import { sendNotificationEmail } from '@/lib/email/notify'
import Stripe from 'stripe'

// In-process idempotency: skip duplicate Stripe events within the same instance lifetime.
// Cross-instance dedup relies on Stripe's own at-least-once delivery (events are idempotent by design).
const processedStripeEvents = new Map<string, number>() // eventId → processedAt ms
const STRIPE_EVENT_TTL_MS = 15 * 60 * 1000 // 15 min

function isStripeEventDuplicate(eventId: string): boolean {
  const now = Date.now()
  // Prune expired entries
  for (const [id, ts] of processedStripeEvents) {
    if (now - ts > STRIPE_EVENT_TTL_MS) processedStripeEvents.delete(id)
  }
  if (processedStripeEvents.has(eventId)) return true
  processedStripeEvents.set(eventId, now)
  return false
}

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')!

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  // Vector 3: skip already-processed events (Stripe retries on non-2xx)
  if (isStripeEventDuplicate(event.id)) {
    return NextResponse.json({ received: true, duplicate: true })
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

      // Stamp canceled_at only on first cancellation (don't overwrite if already set)
      const { data: orgRow } = await supabase
        .from('organizations')
        .select('canceled_at')
        .eq('id', orgId)
        .single()

      await supabase.from('organizations').update({
        subscription_status: 'canceled',
        plan: 'canceled',
        canceled_at: orgRow?.canceled_at ?? new Date().toISOString(),
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

      // G28: Dunning email — notify dealer admin of payment failure
      const { data: adminProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('org_id', orgId)
        .eq('role', 'dealer_admin')
        .eq('is_active', true)
        .limit(1)
        .maybeSingle()
      if (adminProfile?.id) {
        const { data: authUser } = await supabase.auth.admin.getUserById(adminProfile.id)
        const dealerEmail = authUser?.user?.email
        if (dealerEmail) {
          const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://dealerwyze.com'
          void sendNotificationEmail({
            to: dealerEmail,
            subject: 'Action required: Payment failed — DealerWyze',
            html: `<p>Hi,</p>
<p>We were unable to process your latest DealerWyze payment. To avoid service interruption, please update your payment method.</p>
<p><a href="${appUrl}/settings/billing" style="background:#2563eb;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;">Update Payment Method</a></p>
<p>If you have questions, contact us at <a href="mailto:support@dealerwyze.com">support@dealerwyze.com</a>.</p>
<p style="color:#888;font-size:12px">DealerWyze — Dealer Management Platform</p>`,
          })
        }
      }
      break
    }
  }

  return NextResponse.json({ received: true })
}
