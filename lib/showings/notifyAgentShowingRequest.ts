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

    const smsBody = `New showing request from ${buyerName} for ${address}. Times: ${timesList}. Respond at https://dealerwyze.com/showings/${showingId}`

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
  if (agentEmail) {
    const emailBody = `Hi ${agentName},

You have a new showing request!

**Buyer:** ${buyerName}${buyerPhone ? `\n**Phone:** ${buyerPhone}` : ''}
**Property:** ${address}
**Preferred times:** ${requestedTimes.length > 0 ? requestedTimes.map((t) => new Date(t).toLocaleString()).join(', ') : 'Flexible'}

Respond at: https://dealerwyze.com/showings/${showingId}

Best regards,
RealtyWyze`

    sendNotificationEmail({
      to: agentEmail,
      subject: `New Showing Request from ${buyerName}`,
      html: emailBody.replace(/\n/g, '<br/>'),
    }).catch((err) => console.error('Failed to send email to agent:', err))
  }
}
