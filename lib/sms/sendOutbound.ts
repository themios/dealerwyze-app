import { createServiceClient } from '@/lib/supabase/service'
import { prefixWithAuthorName } from '@/lib/utils'
import { checkQuota, incrementUsage } from '@/lib/sms/quota'
import { checkRateLimit } from '@/lib/sms/rateLimit'
import { transitionThreadState } from '@/lib/sms/threadState'
import { assertCanUseFeature, BillingError } from '@/lib/billing/assertFeature'
import { formatPhoneForTel } from '@/lib/utils/phone'
import { orgSmsLimiter } from '@/lib/rateLimit/upstash'

export class SmsSendError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'SmsSendError'
    this.status = status
  }
}

interface SendOutboundSmsInput {
  orgId: string
  to: string
  body: string
  customerId?: string | null
  vehicleId?: string | null
  senderDisplayName?: string | null
  isMms?: boolean
  mediaUrls?: string[]
  markInboundAddressed?: boolean
}

interface SendOutboundSmsResult {
  sid: string | null
  warning?: string
}

export async function sendOutboundSms({
  orgId,
  to,
  body,
  customerId,
  vehicleId,
  senderDisplayName,
  isMms = false,
  mediaUrls = [],
  markInboundAddressed = true,
}: SendOutboundSmsInput): Promise<SendOutboundSmsResult> {
  const svc = createServiceClient()
  const trimmedBody = body.trim()
  const hasMedia = Array.isArray(mediaUrls) && mediaUrls.length > 0

  if (!to || !trimmedBody) {
    throw new SmsSendError('to and body are required', 400)
  }

  try {
    await assertCanUseFeature(orgId, 'sms')
  } catch (err) {
    if (err instanceof BillingError) {
      throw new SmsSendError(err.message, 402)
    }
    throw err
  }

  if (customerId) {
    const { data: customerRow } = await svc
      .from('customers')
      .select('sms_opt_out, sms_consent_status')
      .eq('id', customerId)
      .eq('user_id', orgId)
      .single()

    if (customerRow?.sms_opt_out) {
      throw new SmsSendError('This customer has opted out of SMS messages (STOP). Cannot send.', 403)
    }
    if (customerRow?.sms_consent_status === 'pending') {
      throw new SmsSendError(
        'Waiting for customer to confirm SMS opt-in. They were sent a consent request — once they reply YES you can text them.',
        403,
      )
    }
  }

  const rateLimit = await checkRateLimit(orgId)
  if (!rateLimit.allowed) {
    throw new SmsSendError(rateLimit.reason ?? 'Rate limit exceeded', 429)
  }

  // Burst protection: Upstash rate limiter (20 SMS per 5 minutes per org)
  // This is checked BEFORE quota and is independent of daily/monthly limits
  const burstLimit = await orgSmsLimiter(orgId)
  if (!burstLimit.allowed) {
    throw new SmsSendError(
      `Rate limit: too many SMS sends. Try again in ${burstLimit.retryAfterSeconds}s.`,
      429,
    )
  }

  const quota = await checkQuota(orgId, isMms || hasMedia)
  if (!quota.allowed) {
    throw new SmsSendError(quota.reason ?? 'Quota exceeded', 402)
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID

  if (!accountSid || !authToken) {
    throw new SmsSendError('Twilio not configured.', 503)
  }

  const { data: orgSettings } = await svc
    .from('org_settings')
    .select('twilio_phone_number')
    .eq('org_id', orgId)
    .maybeSingle()

  const fromNumber = orgSettings?.twilio_phone_number ?? process.env.TWILIO_FROM_NUMBER

  if (!fromNumber && !messagingServiceSid) {
    throw new SmsSendError('No SMS number configured for this org.', 503)
  }

  const formattedTo = formatPhoneForTel(to)
  const twilioParams: Record<string, string> = { To: formattedTo, Body: trimmedBody }
  if (messagingServiceSid) twilioParams.MessagingServiceSid = messagingServiceSid
  else twilioParams.From = fromNumber!

  mediaUrls.slice(0, 10).forEach((url, i) => {
    twilioParams[`MediaUrl${i}`] = url
  })

  const twilioRes = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(twilioParams),
    },
  )

  const twilioData = await twilioRes.json() as { sid?: string; message?: string; code?: number }

  if (!twilioRes.ok) {
    throw new SmsSendError(twilioData.message || 'Twilio error', twilioRes.status)
  }

  if (customerId && markInboundAddressed) {
    await svc
      .from('activities')
      .update({ addressed_at: new Date().toISOString() })
      .eq('user_id', orgId)
      .eq('customer_id', customerId)
      .eq('direction', 'inbound')
      .eq('outcome', 'pending')
      .is('completed_at', null)
  }

  const bodyWithAuthor = prefixWithAuthorName(senderDisplayName, trimmedBody)
  await svc.from('activities').insert({
    user_id: orgId,
    type: 'sms',
    direction: 'outbound',
    customer_id: customerId ?? null,
    vehicle_id: vehicleId ?? null,
    body: bodyWithAuthor,
    priority: 'normal',
    external_id: twilioData.sid ?? null,
    completed_at: new Date().toISOString(),
  })

  await incrementUsage(orgId, isMms || hasMedia).catch(err =>
    console.error('[sms/sendOutbound] incrementUsage failed — quota may be understated:', err),
  )

  if (customerId) {
    transitionThreadState(customerId, 'outbound_sent').catch(() => {})
  }

  const warnings: string[] = []
  if (quota.warning_level === 'hard') warnings.push(`Warning: you have used ${quota.current_count}/${quota.quota} messages this month (95%).`)
  else if (quota.warning_level === 'soft') warnings.push(`Note: you have used ${quota.current_count}/${quota.quota} messages this month (80%).`)

  return {
    sid: twilioData.sid ?? null,
    ...(warnings.length > 0 ? { warning: warnings[0] } : {}),
  }
}
