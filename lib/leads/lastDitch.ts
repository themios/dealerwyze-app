import type { SupabaseClient } from '@supabase/supabase-js'

export type LastDitchResult =
  | 'sent'
  | 'skipped_consent'
  | 'skipped_sequence'
  | 'skipped_cooldown'
  | 'skipped_no_phone'
  | 'failed'

const COOLDOWN_DAYS = 30
const MESSAGE_TEMPLATE = (name: string) =>
  `Hey ${name}, I don't want to keep bothering you. If you're still in the market for a vehicle, I'm here — otherwise no worries at all. Just reply anytime if things change!`

export async function sendLastDitchMessage(
  supabase: SupabaseClient,
  args: {
    orgId: string
    customerId: string
    customerName: string
    customerPhone: string | null
    smsConsent: boolean
    smsOptOut: boolean
    lastDitchSentAt: string | null
    activityId: string
  },
): Promise<LastDitchResult> {
  const { orgId, customerId, customerName, customerPhone, smsConsent, smsOptOut, lastDitchSentAt, activityId } = args

  if (!customerPhone) return 'skipped_no_phone'
  if (!smsConsent || smsOptOut) return 'skipped_consent'

  // Cooldown: don't re-send within 30 days
  if (lastDitchSentAt) {
    const daysSince = (Date.now() - new Date(lastDitchSentAt).getTime()) / 86_400_000
    if (daysSince < COOLDOWN_DAYS) return 'skipped_cooldown'
  }

  // Don't fire if an active sequence is already running for this customer
  const { data: activeSeq } = await supabase
    .from('customer_sequences')
    .select('id')
    .eq('org_id', orgId)
    .eq('customer_id', customerId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()

  if (activeSeq) return 'skipped_sequence'

  const twilioSid = process.env.TWILIO_ACCOUNT_SID
  const twilioToken = process.env.TWILIO_AUTH_TOKEN
  const twilioFrom = process.env.TWILIO_FROM_NUMBER
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''

  if (!twilioSid || !twilioToken || !twilioFrom) return 'failed'

  const digits = customerPhone.replace(/\D/g, '')
  const to = digits.length === 10 ? `+1${digits}` : `+${digits}`
  const body = MESSAGE_TEMPLATE(customerName.split(' ')[0] || customerName)

  const params = new URLSearchParams({
    To: to,
    From: twilioFrom,
    Body: body,
    StatusCallback: `${appUrl}/api/twilio/status`,
  })

  let twiSid: string | null = null
  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params,
      },
    )
    if (!res.ok) {
      console.error('[lastDitch] Twilio error:', res.status, await res.text())
      return 'failed'
    }
    const json = await res.json() as { sid?: string }
    twiSid = json.sid ?? null
  } catch (e) {
    console.error('[lastDitch] fetch error:', e)
    return 'failed'
  }

  const now = new Date().toISOString()

  // Log as outbound activity
  await supabase.from('activities').insert({
    user_id: orgId,
    customer_id: customerId,
    type: 'sms',
    direction: 'outbound',
    body,
    twilio_sid: twiSid,
    created_at: now,
  })

  // Stamp cooldown on customer
  await supabase
    .from('customers')
    .update({ last_ditch_sent_at: now })
    .eq('id', customerId)
    .eq('user_id', orgId)

  // Park the source activity for 48h so it stays in low_roi while waiting
  await supabase
    .from('activities')
    .update({
      today_section_override: 'low_roi',
      today_park_until: new Date(Date.now() + 48 * 3_600_000).toISOString(),
    })
    .eq('id', activityId)
    .eq('user_id', orgId)

  return 'sent'
}
