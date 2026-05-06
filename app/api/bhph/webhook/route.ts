/**
 * Twilio inbound SMS webhook
 * Configure in Twilio Console → Phone Numbers → your number → Messaging → Webhook URL:
 *   https://dealerwyze.com/api/bhph/webhook
 *   Method: POST
 *
 * Handles: STOP → opt-out, START/UNSTOP → opt back in, HELP → auto-reply
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getOrgIdByPhone } from '@/lib/orgs/lookup'
import { sendTwilioSms, toE164Us } from '@/lib/bhph/twilioOutbound'
import crypto from 'crypto'

const STOP_KEYWORDS  = ['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT']
const START_KEYWORDS = ['START', 'UNSTOP', 'YES']
const HELP_KEYWORDS  = ['HELP', 'INFO']

/** Inbound keywords: customer says they sent Zelle/Venmo/Cash App payment */
const PAID_KEYWORDS = ['PAID', 'PAID!', 'I PAID', 'SENT']

function isPaidKeyword(raw: string): boolean {
  const norm = raw.replace(/\s+/g, ' ').trim().toUpperCase()
  return PAID_KEYWORDS.includes(norm)
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function validateTwilioSignature(
  authToken: string,
  signature: string,
  url: string,
  params: Record<string, string>
): boolean {
  const sortedParams = Object.keys(params).sort().reduce((s, k) => s + k + params[k], '')
  const expected = crypto.createHmac('sha1', authToken).update(url + sortedParams).digest('base64')
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  } catch { return false }
}

export async function POST(req: NextRequest) {
  // Twilio sends form-encoded body
  const body = await req.text()
  const params = new URLSearchParams(body)

  // Verify Twilio signature before processing
  const authToken   = process.env.TWILIO_AUTH_TOKEN ?? ''
  const signature   = req.headers.get('x-twilio-signature') ?? ''
  const webhookUrl  = `${process.env.NEXT_PUBLIC_APP_URL}/api/bhph/webhook`
  const paramObj    = Object.fromEntries(params.entries())
  if (!validateTwilioSignature(authToken, signature, webhookUrl, paramObj)) {
    return new NextResponse('Forbidden', { status: 403 })
  }
  const from = params.get('From') ?? ''
  const to   = params.get('To')   ?? ''
  const rawMsg = (params.get('Body') ?? '').trim()
  const msgBody = rawMsg.toUpperCase()

  if (!from) {
    return new NextResponse('<?xml version="1.0"?><Response/>', {
      headers: { 'Content-Type': 'text/xml' },
    })
  }

  // Resolve org from "To" number — fail-fast if unknown to prevent cross-tenant queries
  const orgId = await getOrgIdByPhone(to)
  if (!orgId) {
    console.warn('[bhph/webhook] Could not resolve org from To number:', to)
    return new NextResponse('<?xml version="1.0"?><Response/>', {
      headers: { 'Content-Type': 'text/xml' },
    })
  }

  // Normalize phone to digits
  const digits = from.replace(/\D/g, '')
  const service = createServiceClient()

  let twiml = '<Response/>'

  if (STOP_KEYWORDS.includes(msgBody)) {
    // Mark opted out — Twilio also handles blocking future sends automatically
    await service
      .from('customers')
      .update({ sms_opted_out: true, sms_opted_out_at: new Date().toISOString() })
      .eq('user_id', orgId)
      .or(`primary_phone.ilike.%${digits.slice(-10)}%,secondary_phone.ilike.%${digits.slice(-10)}%`)

    // Update BHPH contracts for this customer
    const { data: customers } = await service
      .from('customers')
      .select('id')
      .eq('user_id', orgId)
      .or(`primary_phone.ilike.%${digits.slice(-10)}%,secondary_phone.ilike.%${digits.slice(-10)}%`)

    if (customers?.length) {
      const ids = customers.map(c => c.id)
      await service
        .from('bhph_payments')
        .update({ reminder_sequence_status: 'opted_out' })
        .in('customer_id', ids)
        .eq('status', 'active')
    }

    // Twilio sends its own STOP confirmation — do NOT reply here to avoid double message
    twiml = '<Response/>'

  } else if (START_KEYWORDS.includes(msgBody)) {
    await service
      .from('customers')
      .update({ sms_opted_out: false, sms_opted_out_at: null })
      .eq('user_id', orgId)
      .or(`primary_phone.ilike.%${digits.slice(-10)}%,secondary_phone.ilike.%${digits.slice(-10)}%`)

    // Twilio sends its own re-subscribe confirmation — do NOT reply
    twiml = '<Response/>'

  } else if (HELP_KEYWORDS.includes(msgBody)) {
    twiml = `<Response>
  <Message>Payment reminders only. Approx 4-6 msg/month. Msg&amp;data rates may apply. STOP to cancel.</Message>
</Response>`

  } else if (isPaidKeyword(rawMsg)) {
    const { data: customers } = await service
      .from('customers')
      .select('id, name')
      .eq('user_id', orgId)
      .or(`primary_phone.ilike.%${digits.slice(-10)}%,secondary_phone.ilike.%${digits.slice(-10)}%`)

    const customerIds = customers?.map(c => c.id as string) ?? []

    const { data: bhphRows } = customerIds.length
      ? await service
        .from('bhph_payments')
        .select(`
          id, user_id, customer_id, monthly_payment,
          customer:customers(name),
          vehicle:vehicles(year, make, model)
        `)
        .eq('user_id', orgId)
        .eq('status', 'active')
        .in('customer_id', customerIds)
        .order('next_due_date', { ascending: true })
        .limit(1)
      : { data: null }

    const bhph = bhphRows?.[0] as {
      id: string
      monthly_payment: number
      customer_id: string
      customer: { name?: string } | { name?: string }[] | null
      vehicle: { year: number; make: string; model: string } | { year: number; make: string; model: string }[] | null
    } | undefined

    const { data: orgSettings } = await service
      .from('org_settings')
      .select('dealer_cell_number, business_phone, business_name')
      .eq('org_id', orgId)
      .maybeSingle()

    const dealerName = (orgSettings?.business_name as string | null) ?? 'the dealership'
    const settingsPhone =
      (orgSettings?.dealer_cell_number as string | null)?.trim() ||
      (orgSettings?.business_phone as string | null)?.trim() ||
      ''
    const dealerPhoneDisplay =
      settingsPhone || process.env.DEALER_PHONE || process.env.DEALERSHIP_PHONE || 'the dealership'

    if (!bhph) {
      twiml = `<Response>
  <Message>${escapeXml(
    `We couldn't find an active payment account for this number. Please call ${dealerPhoneDisplay} for assistance. Reply STOP to opt out.`,
  )}</Message>
</Response>`
    } else {
      const nowIso = new Date().toISOString()
      const monthly = Number(bhph.monthly_payment)
      await service
        .from('bhph_payments')
        .update({
          pending_manual_payment_at: nowIso,
          pending_manual_payment_amount: monthly,
        })
        .eq('id', bhph.id)
        .eq('user_id', orgId)

      const rawCust = bhph.customer as unknown
      const custName = (Array.isArray(rawCust) ? rawCust[0] : rawCust) as { name?: string } | null
      const rawVeh = bhph.vehicle as unknown
      const veh = (Array.isArray(rawVeh) ? rawVeh[0] : rawVeh) as { year: number; make: string; model: string } | null
      const vehicleLabel = veh ? `${veh.year} ${veh.make} ${veh.model}` : 'vehicle'
      const firstName = (custName?.name ?? 'there').split(/\s+/)[0] ?? 'there'

      twiml = `<Response>
  <Message>${escapeXml(
    `Thanks ${firstName}! We received your message. Your payment will be confirmed by ${dealerName} within 24 hours. Reply STOP to opt out.`,
  )}</Message>
</Response>`

      const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://dealerwyze.com'
      const confirmLink = `${base}/bhph/${bhph.id}?confirm_payment=1`
      const custDisplay = custName?.name ?? 'A customer'
      const dealerSmsBody =
        `${custDisplay} says they paid their ${vehicleLabel} payment of $${monthly.toFixed(2)} via Zelle/Venmo/Cash App. Tap to confirm: ${confirmLink}`

      const rawDealerPhone =
        (orgSettings?.dealer_cell_number as string | null)?.trim() ||
        (orgSettings?.business_phone as string | null)?.trim()

      if (rawDealerPhone) {
        const toDealer = toE164Us(rawDealerPhone)
        if (toDealer) {
          void sendTwilioSms(toDealer, dealerSmsBody).then(r => {
            if (!r.ok) console.error('[bhph/webhook] dealer notify PAID', r.error)
          })
        }
      } else {
        await service.from('activities').insert({
          user_id: orgId,
          customer_id: bhph.customer_id,
          type: 'note',
          direction: 'inbound',
          body:
            `BHPH: ${custDisplay} replied PAID for ${vehicleLabel} ($${monthly.toFixed(2)}). Dealer SMS skipped (no phone on file). Confirm: ${confirmLink}`,
          priority: 'high',
          completed_at: new Date().toISOString(),
        })
      }
    }
  }

  return new NextResponse(twiml, {
    headers: { 'Content-Type': 'text/xml' },
  })
}
