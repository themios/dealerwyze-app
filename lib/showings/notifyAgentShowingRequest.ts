/**
 * Notify agent when a new showing request arrives.
 * SMS (Twilio), email (Resend), and Telegram alert.
 */
import { createServiceClient } from '@/lib/supabase/service'
import { sendNotificationEmail } from '@/lib/email/notify'
import { sendTelegramMessage } from '@/lib/notifications/telegram'
import { sendTwilioSms, toE164Us } from '@/lib/bhph/twilioOutbound'

interface NotifyAgentParams {
  orgId: string
  agentId: string
  agentName: string
  agentPhone: string | null
  agentEmail: string | null
  buyerName: string
  buyerEmail: string
  buyerPhone: string | null
  address: string
  showingId: string
  requestedTimes: string[]
}

export async function notifyAgentShowingRequest(params: NotifyAgentParams) {
  const {
    orgId,
    agentName,
    agentPhone,
    agentEmail,
    buyerName,
    buyerEmail,
    buyerPhone,
    address,
    showingId,
    requestedTimes,
  } = params

  const timesList =
    requestedTimes.length > 0
      ? requestedTimes.map((t) => new Date(t).toLocaleString('en-US')).join(', ')
      : 'flexible'

  const appUrl = (process.env.REALTYWYZE_APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://realtywyze.us').replace(
    /\/$/,
    '',
  )
  const showingLink = `${appUrl}/showings/${showingId}`

  const supabase = createServiceClient()
  const { data: settings } = await supabase
    .from('org_settings')
    .select('dealer_cell_number')
    .eq('org_id', orgId)
    .maybeSingle()

  const smsTargets = new Set<string>()
  const agentE164 = agentPhone ? toE164Us(agentPhone) : null
  if (agentE164) smsTargets.add(agentE164)
  const orgCell = settings?.dealer_cell_number ? toE164Us(settings.dealer_cell_number) : null
  if (orgCell) smsTargets.add(orgCell)

  const smsBody = `RealtyWyze: New showing request from ${buyerName} for ${address}. Times: ${timesList}. Open: ${showingLink}`

  for (const to of smsTargets) {
    try {
      await sendTwilioSms(to, smsBody)
    } catch (err) {
      console.error('Failed to send SMS for showing request:', err)
    }
  }

  const notifyTo = agentEmail || process.env.SHOWINGS_AGENT_NOTIFICATION_TO
  if (notifyTo) {
    const emailBody = `Hi ${agentName},

You have a new showing request on your public listing.

**Buyer:** ${buyerName}
**Email:** ${buyerEmail}${buyerPhone ? `\n**Phone:** ${buyerPhone}` : ''}
**Property:** ${address}
**Preferred times:** ${timesList}

Review and confirm in your dashboard: ${showingLink}

Best regards,
RealtyWyze`

    sendNotificationEmail({
      to: notifyTo,
      subject: `New showing request — ${address}`,
      html: emailBody.replace(/\n/g, '<br/>'),
      org_id: orgId,
      email_type: 'showing_request_agent',
      vertical: 'real_estate',
    }).catch((err) => console.error('Failed to send email to agent:', err))
  }

  void sendTelegramMessage(
    `<b>New Showing Request</b>\n` +
      `<b>${buyerName}</b> — ${address}\n` +
      (buyerPhone ? `Phone: ${buyerPhone}\n` : '') +
      `Email: ${buyerEmail}\n` +
      `Times: ${timesList}\n` +
      `<a href="${showingLink}">Open in RealtyWyze</a>`,
  ).catch(() => {})
}
