/**
 * Twilio inbound SMS webhook
 * Configure in Twilio Console → Phone Numbers → your number → Messaging → Webhook URL:
 *   https://apollo-crm.vercel.app/api/bhph/webhook
 *   Method: POST
 *
 * Handles: STOP → opt-out, START/UNSTOP → opt back in, HELP → auto-reply
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

const STOP_KEYWORDS  = ['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT']
const START_KEYWORDS = ['START', 'UNSTOP', 'YES']
const HELP_KEYWORDS  = ['HELP', 'INFO']

export async function POST(req: NextRequest) {
  // Twilio sends form-encoded body
  const body = await req.text()
  const params = new URLSearchParams(body)
  const from = params.get('From') ?? ''
  const msgBody = (params.get('Body') ?? '').trim().toUpperCase()

  if (!from) {
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
      .or(`primary_phone.ilike.%${digits.slice(-10)}%,secondary_phone.ilike.%${digits.slice(-10)}%`)

    // Update BHPH contracts for this customer
    const { data: customers } = await service
      .from('customers')
      .select('id')
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
      .or(`primary_phone.ilike.%${digits.slice(-10)}%,secondary_phone.ilike.%${digits.slice(-10)}%`)

    // Twilio sends its own re-subscribe confirmation — do NOT reply
    twiml = '<Response/>'

  } else if (HELP_KEYWORDS.includes(msgBody)) {
    twiml = `<Response>
  <Message>Apollo Auto payment reminders only. Approx 4-6 msg/month. Msg&amp;data rates may apply. STOP to cancel.</Message>
</Response>`
  }

  return new NextResponse(twiml, {
    headers: { 'Content-Type': 'text/xml' },
  })
}
