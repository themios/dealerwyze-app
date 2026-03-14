/**
 * Sends an SMS notification to a dealer when a new web inquiry arrives.
 * This is an internal dealer notification - no quota check, no opt-out check.
 * Uses the org's provisioned Twilio number or the platform fallback.
 */
import { createServiceClient } from '@/lib/supabase/service'
import { sendTelegramMessage } from '@/lib/notifications/telegram'

export async function notifyDealerNewLead(
  orgId: string,
  inquirerName: string,
  phone: string | undefined,
  message: string | undefined,
  vehicleName: string | undefined
): Promise<void> {
  const accountSid          = process.env.TWILIO_ACCOUNT_SID
  const authToken           = process.env.TWILIO_AUTH_TOKEN
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID

  if (!accountSid || !authToken) return

  const supabase = createServiceClient()

  // Get dealer's cell number and their Twilio from-number
  const { data: settings } = await supabase
    .from('org_settings')
    .select('dealer_cell_number, twilio_phone_number')
    .eq('org_id', orgId)
    .maybeSingle()

  const toNumber = settings?.dealer_cell_number
  if (!toNumber) return // no cell number configured - skip notification

  const fromNumber = settings?.twilio_phone_number ?? process.env.TWILIO_FROM_NUMBER
  if (!fromNumber && !messagingServiceSid) return

  const digits      = toNumber.replace(/\D/g, '')
  const formattedTo = digits.length === 10 ? `+1${digits}` : `+${digits}`

  const bodyParts = [`New inquiry from ${inquirerName}`]
  if (vehicleName) bodyParts.push(`re: ${vehicleName}`)
  if (phone) bodyParts.push(`Phone: ${phone}`)
  if (message) bodyParts.push(message.slice(0, 100))
  bodyParts.push('Reply via DealerWyze.')

  const smsBody = bodyParts.join(' | ')

  const twilioParams: Record<string, string> = { To: formattedTo, Body: smsBody }
  if (messagingServiceSid) twilioParams.MessagingServiceSid = messagingServiceSid
  else twilioParams.From = fromNumber!

  sendTelegramMessage(
    `<b>New Web Lead</b>${vehicleName ? ` - ${vehicleName}` : ''}\n` +
    `<b>${inquirerName}</b>\n` +
    (phone ? `Phone: ${phone}\n` : '') +
    (message ? `"${message.slice(0, 120)}"` : '')
  ).catch(() => {})

  await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(twilioParams),
    }
  ).catch(() => {}) // fire and forget - never throw
}
