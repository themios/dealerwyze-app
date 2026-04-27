import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireProfile } from '@/lib/auth/profile'
import { prefixWithAuthorName } from '@/lib/utils'
import { checkQuota, incrementUsage } from '@/lib/sms/quota'
import { checkRateLimit } from '@/lib/sms/rateLimit'
import { transitionThreadState } from '@/lib/sms/threadState'

/**
 * POST /api/sms/send
 * Body: { to: string, body: string, customer_id: string, vehicle_id?: string, is_mms?: boolean }
 */
export async function POST(req: NextRequest) {
  const profile = await requireProfile()
  const supabase = await createClient()
  const orgId = profile.org_id

  // Free tier: Twilio SMS is not included — direct users to "Open Messages" instead
  const svc = createServiceClient()
  const { data: orgRow } = await svc.from('organizations').select('plan').eq('id', orgId).maybeSingle()
  if ((orgRow?.plan ?? 'free') === 'free') {
    return NextResponse.json(
      { error: 'Texting via DealerWyze requires a paid plan. Use "Open Messages" to send from your phone, or upgrade at Settings \u2192 Billing.' },
      { status: 402 }
    )
  }

  const { to, body, customer_id, vehicle_id, is_mms = false, mediaUrls = [] } = await req.json() as {
    to: string; body: string; customer_id?: string; vehicle_id?: string; is_mms?: boolean; mediaUrls?: string[]
  }

  if (!to || !body) {
    return NextResponse.json({ error: 'to and body are required' }, { status: 400 })
  }

  const hasMedia = Array.isArray(mediaUrls) && mediaUrls.length > 0

  // TCPA: check opt-out and consent status
  if (customer_id) {
    const { data: customerRow } = await supabase
      .from('customers')
      .select('sms_opt_out, sms_consent_status')
      .eq('id', customer_id)
      .single()
    if (customerRow?.sms_opt_out) {
      return NextResponse.json(
        { error: 'This customer has opted out of SMS messages (STOP). Cannot send.' },
        { status: 403 }
      )
    }
    if (customerRow?.sms_consent_status === 'pending') {
      return NextResponse.json(
        { error: 'Waiting for customer to confirm SMS opt-in. They were sent a consent request — once they reply YES you can text them.' },
        { status: 403 }
      )
    }
  }

  // Abuse: velocity caps (20/min, 300/day per org — Vector 8)
  const rateLimit = await checkRateLimit(orgId)
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: rateLimit.reason ?? 'Rate limit exceeded' }, { status: 429 })
  }

  // Quota check — MMS if has media or caller flagged it
  const quota = await checkQuota(orgId, is_mms || hasMedia)
  if (!quota.allowed) {
    return NextResponse.json({ error: quota.reason ?? 'Quota exceeded' }, { status: 402 })
  }

  const accountSid          = process.env.TWILIO_ACCOUNT_SID
  const authToken           = process.env.TWILIO_AUTH_TOKEN
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID

  if (!accountSid || !authToken) {
    return NextResponse.json({ error: 'Twilio not configured.' }, { status: 503 })
  }

  // Use org's provisioned number if available, else fall back to env var
  const { data: orgSettings } = await supabase
    .from('org_settings')
    .select('twilio_phone_number')
    .eq('org_id', orgId)
    .maybeSingle()

  const fromNumber = orgSettings?.twilio_phone_number ?? process.env.TWILIO_FROM_NUMBER

  if (!fromNumber && !messagingServiceSid) {
    return NextResponse.json({ error: 'No SMS number configured for this org.' }, { status: 503 })
  }

  const digits      = to.replace(/\D/g, '')
  const formattedTo = digits.length === 10 ? `+1${digits}` : `+${digits}`

  const twilioParams: Record<string, string> = { To: formattedTo, Body: body }
  if (messagingServiceSid) twilioParams.MessagingServiceSid = messagingServiceSid
  else twilioParams.From = fromNumber!

  // MMS media attachments (max 10 per Twilio)
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
    }
  )

  const twilioData = await twilioRes.json()

  if (!twilioRes.ok) {
    return NextResponse.json(
      { error: twilioData.message || 'Twilio error', code: twilioData.code },
      { status: twilioRes.status }
    )
  }

  // Mark the customer's pending inbound lead as addressed so it leaves the Today screen
  if (customer_id) {
    await supabase
      .from('activities')
      .update({ addressed_at: new Date().toISOString() })
      .eq('user_id', orgId)
      .eq('customer_id', customer_id)
      .eq('direction', 'inbound')
      .eq('outcome', 'pending')
      .is('completed_at', null)
  }

  // Log activity (prefixed with sender name)
  const bodyWithAuthor = prefixWithAuthorName(profile.display_name, body)
  await supabase.from('activities').insert({
    user_id: orgId,
    type: 'sms',
    direction: 'outbound',
    customer_id: customer_id || null,
    vehicle_id: vehicle_id || null,
    body: bodyWithAuthor,
    priority: 'normal',
    external_id: twilioData.sid || null,
    completed_at: new Date().toISOString(),
  })

  // Increment usage counter (fire and forget)
  incrementUsage(orgId, is_mms).catch(() => {})

  // first_response_at / response_time_seconds are stamped by DB trigger
  // trg_stamp_response_time_on_activity on activities INSERT (all outbound email/sms/call).

  // Thread state transition
  if (customer_id) {
    transitionThreadState(customer_id, 'outbound_sent').catch(() => {})
  }

  // Warn if approaching quota
  const warnings: string[] = []
  if (quota.warning_level === 'hard') warnings.push(`Warning: you have used ${quota.current_count}/${quota.quota} messages this month (95%).`)
  else if (quota.warning_level === 'soft') warnings.push(`Note: you have used ${quota.current_count}/${quota.quota} messages this month (80%).`)

  return NextResponse.json({
    success: true,
    sid: twilioData.sid,
    ...(warnings.length > 0 ? { warning: warnings[0] } : {}),
  })
}
