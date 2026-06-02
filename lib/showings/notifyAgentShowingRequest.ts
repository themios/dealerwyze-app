/**
 * Notify agent when a new showing request arrives.
 * Sends SMS and logs as activity.
 */
import { createServiceClient } from '@/lib/supabase/service'
import { sendNotificationEmail } from '@/lib/email/notify'

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

export async function notifyAgentShowingRequest(
  params: NotifyAgentParams
) {
  const {
    orgId,
    agentId,
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

  const supabase = createServiceClient()

  // SMS to agent
  if (agentPhone) {
    const timesList =
      requestedTimes.length > 0
        ? requestedTimes
            .map((t) => new Date(t).toLocaleString())
            .join(', ')
        : 'flexible'

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://realtywyze.us'
    const smsBody = `New showing request from ${buyerName} for ${address}. Times: ${timesList}. Respond at ${appUrl}/showings/${showingId}`

    try {
      await fetch('/api/twilio/send-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: agentPhone,
          body: smsBody,
          org_id: orgId,
        }),
      })
    } catch (err) {
      console.error('Failed to send SMS to agent:', err)
    }
  }

  // Email to agent
  // RealtyWyze ops routing: send showing-request notifications to the shared inbox.
  // This avoids dependency on per-profile auth email hygiene for critical alerts.
  const routedAgentEmail = process.env.SHOWINGS_AGENT_NOTIFICATION_TO || 'noreply@realtywyze.us'
  if (routedAgentEmail || agentEmail) {
    const appUrl = process.env.REALTYWYZE_APP_URL || 'https://realtywyze.us'
    const showingLink = `${appUrl.replace(/\/$/, '')}/showings/${showingId}`
    const emailBody = `Hi ${agentName},

You have a new showing request!

**Buyer:** ${buyerName}
**Email:** ${buyerEmail}${buyerPhone ? `\n**Phone:** ${buyerPhone}` : ''}
**Property:** ${address}
**Preferred times:** ${requestedTimes.length > 0 ? requestedTimes.map((t) => new Date(t).toLocaleString()).join(', ') : 'Flexible'}

Review and confirm in dashboard: ${showingLink}

Best regards,
RealtyWyze`

    sendNotificationEmail({
      to: routedAgentEmail || agentEmail!,
      subject: `New Showing Request from ${buyerName}`,
      html: emailBody.replace(/\n/g, '<br/>'),
      org_id: orgId,
      email_type: 'showing_request_agent',
      vertical: 'real_estate',
    }).catch((err) => console.error('Failed to send email to agent:', err))
  }
}
