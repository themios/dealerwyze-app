import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getTwilioWebhookBase, validateTwilioSignature } from '@/lib/twilio/signature'

type DeliveryStatus =
  | 'queued'
  | 'accepted'
  | 'scheduled'
  | 'sending'
  | 'sent'
  | 'delivered'
  | 'undelivered'
  | 'failed'
  | 'read'
  | 'canceled'
  | 'unknown'

function normalizeDeliveryStatus(value: string | null): DeliveryStatus {
  switch ((value ?? '').toLowerCase()) {
    case 'queued':
    case 'accepted':
    case 'scheduled':
    case 'sending':
    case 'sent':
    case 'delivered':
    case 'undelivered':
    case 'failed':
    case 'read':
    case 'canceled':
      return value!.toLowerCase() as DeliveryStatus
    default:
      return 'unknown'
  }
}

export async function POST(req: NextRequest) {
  const text = await req.text()
  const params = Object.fromEntries(new URLSearchParams(text))

  const authToken = process.env.TWILIO_AUTH_TOKEN ?? ''
  const signature = req.headers.get('x-twilio-signature') ?? ''
  const webhookUrl = `${getTwilioWebhookBase()}/api/twilio/status`

  if (!authToken || !signature || !validateTwilioSignature(authToken, signature, webhookUrl, params)) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  const messageSid = params.MessageSid ?? ''
  if (!messageSid) {
    return new NextResponse(null, { status: 204 })
  }

  const deliveryStatus = normalizeDeliveryStatus(params.MessageStatus ?? null)
  const now = new Date().toISOString()
  const updatePayload: Record<string, unknown> = {
    delivery_status: deliveryStatus,
    delivery_error_code: params.ErrorCode || null,
    delivery_error_message: params.ErrorMessage || null,
  }

  if (deliveryStatus === 'delivered' || deliveryStatus === 'read') {
    updatePayload.delivered_at = now
  }

  if (deliveryStatus === 'failed' || deliveryStatus === 'undelivered') {
    updatePayload.status = 'failed'
    updatePayload.error_message = params.ErrorMessage || `Twilio status: ${deliveryStatus}`
  }

  const supabase = createServiceClient()
  await supabase
    .from('payment_reminder_log')
    .update(updatePayload)
    .eq('twilio_sid', messageSid)
    // Don't overwrite a confirmed delivered state with a late failed callback
    .not('delivery_status', 'eq', 'delivered')

  return new NextResponse(null, { status: 204 })
}
