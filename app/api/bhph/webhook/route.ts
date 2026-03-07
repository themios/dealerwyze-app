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
import crypto from 'crypto'

const STOP_KEYWORDS  = ['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT']
const START_KEYWORDS = ['START', 'UNSTOP', 'YES']
const HELP_KEYWORDS  = ['HELP', 'INFO']

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
  const msgBody = (params.get('Body') ?? '').trim().toUpperCase()

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
  }

  return new NextResponse(twiml, {
    headers: { 'Content-Type': 'text/xml' },
  })
}
