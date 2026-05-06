/**
 * Stripe webhook: dealer ACH (Connect) — separate from platform /api/stripe/webhook.
 * Configure in Stripe Dashboard → ACH account → webhook → STRIPE_BHPH_ACH_WEBHOOK_SECRET.
 */

import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServiceClient } from '@/lib/supabase/service'
import {
  finalizeBhphPaymentRpc,
  recordAchFailureLedger,
  shapeStripeError,
} from '@/lib/bhph/achPull'
import { sendTwilioSms, toE164Us } from '@/lib/bhph/twilioOutbound'

export const runtime = 'nodejs'

async function notifyDealer(orgId: string, text: string): Promise<void> {
  const supabase = createServiceClient()
  const { data: settings } = await supabase
    .from('org_settings')
    .select('dealer_cell_number, business_name')
    .eq('org_id', orgId)
    .maybeSingle()
  const raw = settings?.dealer_cell_number as string | null
  const to = raw ? toE164Us(raw) : null
  if (!to) {
    console.warn('[bhph-ach-webhook] no dealer_cell_number', { orgId })
    return
  }
  const r = await sendTwilioSms(to, text)
  if (!r.ok) console.error('[bhph-ach-webhook] dealer sms', { orgId, error: r.error })
}

export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_BHPH_ACH_WEBHOOK_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'Misconfigured' }, { status: 500 })
  }

  const body = await req.text()
  const sig = req.headers.get('stripe-signature')
  if (!sig) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = Stripe.webhooks.constructEvent(body, sig, secret)
  } catch (e) {
    const shaped = shapeStripeError(e)
    console.error('[bhph-ach-webhook] signature', shaped)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const supabase = createServiceClient()

  const { error: dedupError } = await supabase
    .from('processed_stripe_events')
    .insert({ event_id: event.id })

  if (dedupError?.code === '23505') {
    return NextResponse.json({ received: true, duplicate: true })
  }
  if (dedupError) {
    console.error('[bhph-ach-webhook] dedup', { message: dedupError.message })
    return NextResponse.json({ received: true })
  }

  try {
    switch (event.type) {
      case 'payment_intent.succeeded': {
        const pi = event.data.object as Stripe.PaymentIntent
        const tokenId = pi.metadata?.bhph_payment_token
        if (!tokenId) {
          return NextResponse.json({ received: true })
        }
        const paidAt = new Date().toISOString()
        const paymentDateYmd =
          (pi.metadata?.payment_date as string | undefined)?.slice(0, 10) ?? paidAt.slice(0, 10)

        const { data: tok } = await supabase
          .from('bhph_payment_tokens')
          .select('id, amount')
          .eq('id', tokenId)
          .maybeSingle()

        if (tok?.amount == null) {
          return NextResponse.json({ received: true })
        }
        await finalizeBhphPaymentRpc({
          supabase,
          tokenId,
          paymentIntentId: pi.id,
          paidAtIso: paidAt,
          amount: Number(tok.amount),
          paymentDateYmd,
        })
        return NextResponse.json({ received: true })
      }

      case 'payment_intent.payment_failed': {
        const pi = event.data.object as Stripe.PaymentIntent
        const bhphId = pi.metadata?.bhph_id
        const orgId = pi.metadata?.org_id
        const paymentDateYmd = (pi.metadata?.payment_date as string | undefined)?.slice(0, 10) ?? new Date().toISOString().slice(0, 10)
        const err = pi.last_payment_error
        const shaped = {
          code: err?.code,
          decline_code: (err as { decline_code?: string } | undefined)?.decline_code,
          message: err?.message,
        }
        console.error('[bhph-ach-webhook] payment_failed', shaped)

        if (bhphId && orgId) {
          const cents = typeof pi.amount === 'number' ? pi.amount : 0
          const attempted = cents / 100
          const reason =
            [shaped.decline_code, shaped.code].filter(Boolean).join(' / ') || 'ach_failed'
          await recordAchFailureLedger({
            supabase,
            contractId: bhphId,
            paymentDateYmd,
            attemptedAmount: attempted,
            stripePaymentIntentId: pi.id,
            notes: `ACH pull failed: ${reason}`,
          })
          await notifyDealer(
            orgId,
            `DealerWyze: ACH payment failed for a BHPH contract (${reason.slice(0, 80)}). Review the account and contact the customer.`,
          )
        }
        return NextResponse.json({ received: true })
      }

      case 'setup_intent.succeeded': {
        const si = event.data.object as Stripe.SetupIntent
        const contractId = si.metadata?.bhph_contract_id
        const pmId = typeof si.payment_method === 'string' ? si.payment_method : si.payment_method?.id
        if (!contractId || !pmId) return NextResponse.json({ received: true })

        const now = new Date().toISOString()
        await supabase
          .from('bhph_payments')
          .update({
            stripe_payment_method_id: pmId,
            payment_method_type: 'ach',
            bank_verification_status: 'verified',
            bank_verified_at: now,
          })
          .eq('id', contractId)
        return NextResponse.json({ received: true })
      }

      case 'setup_intent.requires_action': {
        const si = event.data.object as Stripe.SetupIntent
        const contractId = si.metadata?.bhph_contract_id
        const orgId = si.metadata?.org_id
        if (!contractId || !orgId) return NextResponse.json({ received: true })

        await supabase
          .from('bhph_payments')
          .update({ bank_verification_status: 'pending' })
          .eq('id', contractId)

        const { data: acct } = await supabase
          .from('bhph_payments')
          .select('customer:customers(primary_phone, sms_opt_out)')
          .eq('id', contractId)
          .maybeSingle()
        const c = acct?.customer as { primary_phone?: string; sms_opt_out?: boolean } | null
        if (c?.primary_phone && !c.sms_opt_out) {
          const to = toE164Us(c.primary_phone)
          if (to) {
            await sendTwilioSms(
              to,
              'DealerWyze: Complete your bank verification — check your bank statement for two small deposits, then finish setup in the link we sent.',
            )
          }
        }
        return NextResponse.json({ received: true })
      }

      default:
        return NextResponse.json({ received: true })
    }
  } catch (e) {
    console.error('[bhph-ach-webhook] handler', shapeStripeError(e))
    return NextResponse.json({ received: true })
  }
}
