import { createServiceClient } from '@/lib/supabase/service'

const DEFAULT_CONSENT_TEMPLATE =
  'Hi {first_name}! This is {business_name}. You recently inquired about {vehicle}. ' +
  'Reply YES to receive text updates on your inquiry. ' +
  'Msg & data rates may apply. Reply STOP to opt out.'

const DEFAULT_CONSENT_TEMPLATE_NO_VEHICLE =
  'Hi {first_name}! This is {business_name}. You recently submitted an inquiry with us. ' +
  'Reply YES to receive text updates. ' +
  'Msg & data rates may apply. Reply STOP to opt out.'

/**
 * Send the SMS double opt-in consent request to a new lead.
 * Bypasses /api/sms/send (which itself checks consent) — sends directly via Twilio.
 * Only sends to NEW customers (sms_consent_status IS NULL) with a valid phone.
 */
export async function sendSmsConsentRequest(opts: {
  customerId: string
  orgId: string
  customerName: string
  phone: string
  vehicle?: string | null
}): Promise<{ sent: boolean; reason?: string }> {
  const { customerId, orgId, customerName, phone, vehicle } = opts

  const supabase = createServiceClient()

  // Fetch org settings + org name in parallel
  const [{ data: settings }, { data: org }] = await Promise.all([
    supabase
      .from('org_settings')
      .select('business_name, twilio_phone_number, sms_consent_message')
      .eq('org_id', orgId)
      .maybeSingle(),
    supabase
      .from('organizations')
      .select('name')
      .eq('id', orgId)
      .maybeSingle(),
  ])

  const businessName = settings?.business_name?.trim() || org?.name?.trim() || 'our dealership'
  const fromNumber = settings?.twilio_phone_number || process.env.TWILIO_FROM_NUMBER

  if (!fromNumber) return { sent: false, reason: 'no_twilio_number' }

  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken  = process.env.TWILIO_AUTH_TOKEN
  if (!accountSid || !authToken) return { sent: false, reason: 'twilio_not_configured' }

  const firstName = customerName.split(' ')[0] || customerName

  // Build message body
  const template = settings?.sms_consent_message ||
    (vehicle ? DEFAULT_CONSENT_TEMPLATE : DEFAULT_CONSENT_TEMPLATE_NO_VEHICLE)

  const messageBody = template
    .replace('{first_name}', firstName)
    .replace('{business_name}', businessName)
    .replace('{vehicle}', vehicle ? `the ${vehicle}` : 'your vehicle inquiry')

  // Normalise phone to E.164
  const digits = phone.replace(/\D/g, '')
  const to = digits.length === 10 ? `+1${digits}` : `+${digits}`

  const twilioRes = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: to, From: fromNumber, Body: messageBody }),
    }
  )

  if (!twilioRes.ok) {
    const err = await twilioRes.json().catch(() => ({}))
    console.error('[sendConsent] Twilio error:', err)
    return { sent: false, reason: 'twilio_error' }
  }

  const twilioData = await twilioRes.json()

  // Mark consent as pending + log activity
  await Promise.all([
    supabase
      .from('customers')
      .update({
        sms_consent_status:  'pending',
        sms_consent_sent_at: new Date().toISOString(),
      })
      .eq('id', customerId),

    supabase.from('activities').insert({
      user_id:      orgId,
      customer_id:  customerId,
      type:         'sms',
      direction:    'outbound',
      outcome:      'pending',
      body:         `[Consent Request] ${messageBody}`,
      priority:     'normal',
      external_id:  twilioData.sid || null,
      completed_at: new Date().toISOString(),
    }),
  ])

  return { sent: true }
}
