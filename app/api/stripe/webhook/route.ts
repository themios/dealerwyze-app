import { NextRequest, NextResponse } from 'next/server'
import { stripe, tierFromPriceId, smsTierFromPriceId, storagePackFromPriceId, PLAN_QUOTA, SMS_TIER_QUOTA, STORAGE_PACK_QUOTA } from '@/lib/stripe'
import { createServiceClient } from '@/lib/supabase/service'
import { sendNotificationEmail } from '@/lib/email/notify'
import { recordCommission } from '@/lib/stripe/commissions'
import { validationErrorFields } from '@/lib/validation/parseRequest'
import {
  StripeCheckoutSessionCompletedObjectSchema,
  StripePaymentIntentSucceededObjectSchema,
} from '@/lib/validation/stripeWebhookObjects'
import Stripe from 'stripe'
import * as Sentry from '@sentry/nextjs'

export async function POST(req: NextRequest) {
  return Sentry.startSpan(
    { name: 'stripe.webhook', op: 'http.server' },
    async () => {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')!

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch {
    // Log signature failure to security_events (fire-and-forget)
    void createServiceClient().from('security_events').insert({
      event_type: 'sig_failure',
      ip: req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? null,
      details: { provider: 'stripe' },
    })
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Durable dedup: insert event_id; unique PK rejects duplicates across all instances.
  const { error: dedupError } = await supabase
    .from('processed_stripe_events')
    .insert({ event_id: event.id })
  if (dedupError) {
    // Postgres unique_violation = 23505; any conflict means already processed
    if (dedupError.code === '23505') {
      return NextResponse.json({ received: true, duplicate: true })
    }
    // Unexpected DB error — let Stripe retry
    return NextResponse.json({ error: 'Dedup check failed' }, { status: 500 })
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const sessionChecked = StripeCheckoutSessionCompletedObjectSchema.safeParse(event.data.object)
      if (!sessionChecked.success) {
        return NextResponse.json(
          { error: 'Validation failed', fields: validationErrorFields(sessionChecked.error) },
          { status: 400 },
        )
      }
      const session = event.data.object as Stripe.Checkout.Session
      console.info('[stripe-webhook] checkout.session.completed', {
        sessionId: session.id,
        mode: session.mode,
        topupType: session.metadata?.topup_type ?? null,
        orgId: session.metadata?.org_id ?? null,
      })

      // ── One-time video render pack ───────────────────────────────────────────
      if (session.mode === 'payment' && session.metadata?.topup_type === 'video_pack') {
        const orgId  = session.metadata.org_id
        const credits = parseInt(session.metadata.credits ?? '25', 10)
        if (orgId && credits > 0) {
          const { data: existing } = await supabase
            .from('org_video_settings')
            .select('render_credits_purchased')
            .eq('org_id', orgId)
            .maybeSingle()

          const newCredits = (existing?.render_credits_purchased ?? 0) + credits
          await supabase.from('org_video_settings').upsert({
            org_id: orgId,
            render_credits_purchased: newCredits,
          }, { onConflict: 'org_id' })

          await supabase.from('admin_alerts').insert({
            org_id:     orgId,
            alert_type: 'video_pack_purchased',
            severity:   'info',
            details:    { credits_added: credits, new_total: newCredits },
          }).maybeSingle()
        }
        break
      }

      // ── One-time overage buffer top-up ──────────────────────────────────────
      if (session.mode === 'payment' && session.metadata?.topup_type === 'overage_buffer') {
        const orgId = session.metadata.org_id
        const topupCents = parseInt(session.metadata.topup_cents ?? '0', 10)
        if (orgId && topupCents > 0) {
          await supabase.rpc('add_overage_buffer', { p_org_id: orgId, p_cents: topupCents })
          // Log an admin alert so platform can see top-up activity
          await supabase.from('admin_alerts').insert({
            org_id:     orgId,
            alert_type: 'overage_buffer_topup',
            severity:   'info',
            details:    { topup_cents: topupCents },
          }).maybeSingle()
        }
        break
      }

      // ── Subscription checkout ────────────────────────────────────────────────
      if (!session.subscription) break
      const sub0 = await stripe.subscriptions.retrieve(session.subscription as string)
      const orgId = sub0.metadata?.org_id
      if (!orgId) break

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

      // Commission: record first_month or free_to_paid before updating subscription_status
      {
        const { data: orgRow } = await supabase
          .from('organizations')
          .select('affiliate_code, subscription_status')
          .eq('id', orgId)
          .maybeSingle()

        if (orgRow?.affiliate_code) {
          const { data: aff } = await supabase
            .from('affiliate_codes')
            .select('commission_first_pct, is_active')
            .eq('code', orgRow.affiliate_code)
            .maybeSingle()

          if (aff?.is_active) {
            const eventType = orgRow.subscription_status === 'free' ? 'free_to_paid' : 'first_month'
            await recordCommission({
              affiliateCode:      orgRow.affiliate_code,
              orgId,
              eventType,
              invoiceAmountCents: session.amount_total ?? 0,
              billingPeriod:      new Date().toISOString().slice(0, 7),
              stripeInvoiceId:    typeof session.invoice === 'string' ? session.invoice : '',
              commissionPct:      aff.commission_first_pct,
            })
          }

        }
      }

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
      console.info('[stripe-webhook] customer.subscription.updated', {
        subscriptionId: sub.id,
        status: sub.status,
        orgId: sub.metadata?.org_id ?? null,
      })
      const orgId = sub.metadata?.org_id
      if (!orgId) break

      let crmPriceId: string | undefined
      let smsPriceId: string | undefined
      let storagePack: string | null = null
      for (const item of sub.items.data) {
        const sp = storagePackFromPriceId(item.price.id)
        const st = smsTierFromPriceId(item.price.id)
        if (sp) { storagePack = sp }
        else if (st) { smsPriceId = item.price.id }
        else { crmPriceId = item.price.id }
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

      // Sync storage pack quota to org_settings
      if (storagePack) {
        const packKey = storagePack as '10gb' | '25gb'
        await supabase.from('org_settings').update({
          storage_pack: packKey,
          storage_quota_bytes: STORAGE_PACK_QUOTA[packKey],
          storage_pack_expires_at: null,
        }).eq('org_id', orgId)
      } else if (sub.status !== 'active') {
        // Pack removed or subscription degraded — start 90-day grace
        const { data: settings } = await supabase.from('org_settings')
          .select('storage_pack').eq('org_id', orgId).maybeSingle()
        if (settings?.storage_pack && settings.storage_pack !== 'none') {
          const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()
          await supabase.from('org_settings').update({
            storage_pack: 'none',
            storage_pack_expires_at: expiresAt,
          }).eq('org_id', orgId)
        }
      }
      break
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription
      console.info('[stripe-webhook] customer.subscription.deleted', {
        subscriptionId: sub.id,
        orgId: sub.metadata?.org_id ?? null,
      })
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

    case 'invoice.payment_succeeded': {
      // Recurring commission (month 2+) — advisor-type affiliates only
      const invoice = event.data.object as Stripe.Invoice & { billing_reason?: string; subscription?: string | null; period_start?: number; amount_paid?: number }
      console.info('[stripe-webhook] invoice.payment_succeeded', {
        invoiceId: invoice.id,
        billingReason: invoice.billing_reason ?? null,
        subscriptionId: typeof invoice.subscription === 'string' ? invoice.subscription : null,
      })
      if (invoice.billing_reason !== 'subscription_cycle' || !invoice.subscription) break

      const recSub = await stripe.subscriptions.retrieve(invoice.subscription as string)
      const orgId = recSub.metadata?.org_id
      if (!orgId) break

      const { data: orgRow } = await supabase
        .from('organizations')
        .select('affiliate_code')
        .eq('id', orgId)
        .maybeSingle()

      if (orgRow?.affiliate_code) {
        const { data: aff } = await supabase
          .from('affiliate_codes')
          .select('commission_recurring_pct, type, is_active')
          .eq('code', orgRow.affiliate_code)
          .maybeSingle()

        if (aff?.is_active && aff.type === 'advisor' && (aff.commission_recurring_pct ?? 0) > 0) {
          const periodStart = typeof (invoice as { period_start?: number }).period_start === 'number'
            ? (invoice as { period_start: number }).period_start
            : Math.floor(Date.now() / 1000)
          await recordCommission({
            affiliateCode:      orgRow.affiliate_code,
            orgId,
            eventType:          'recurring',
            invoiceAmountCents: (invoice as { amount_paid?: number }).amount_paid ?? 0,
            billingPeriod:      new Date(periodStart * 1000).toISOString().slice(0, 7),
            stripeInvoiceId:    invoice.id ?? '',
            commissionPct:      aff.commission_recurring_pct,
          })
        }
      }
      break
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice & { subscription?: string | null }
      console.info('[stripe-webhook] invoice.payment_failed', {
        invoiceId: invoice.id,
        subscriptionId: typeof invoice.subscription === 'string' ? invoice.subscription : null,
      })
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

    case 'payment_intent.succeeded': {
      const piChecked = StripePaymentIntentSucceededObjectSchema.safeParse(event.data.object)
      if (!piChecked.success) {
        return NextResponse.json(
          { error: 'Validation failed', fields: validationErrorFields(piChecked.error) },
          { status: 400 },
        )
      }
      break
    }
  }

  return NextResponse.json({ received: true })
    },
  )
}
