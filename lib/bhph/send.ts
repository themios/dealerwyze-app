/**
 * BHPH reminder send utilities.
 * Handles SMS via Twilio (with opt-out check + 21610 handling)
 * and email via Resend (optional — only if RESEND_API_KEY is set).
 */
import { createServiceClient } from '@/lib/supabase/service'
import { ReminderType, buildSmsMessage, buildEmailSubject, buildEmailBody, MessageVars } from './messages'
import { isWithinSendHours } from './schedule'

interface SendResult {
  sms: 'sent' | 'skipped_optout' | 'skipped_hours' | 'failed' | 'unconfigured'
  email: 'sent' | 'skipped_optout' | 'skipped_noemail' | 'failed' | 'unconfigured'
  twilioSid?: string
  errorCode?: number
  errorMessage?: string
}

export async function sendBhphReminder(params: {
  bhphId: string
  userId: string
  customerId: string
  customerPhone: string
  customerEmail?: string | null
  customerSmsOptedOut: boolean
  reminderType: ReminderType
  dealerTimezone: string
  dealerPhone: string
  messageVars: MessageVars
}): Promise<SendResult> {
  const {
    bhphId, userId, customerId, customerPhone, customerEmail,
    customerSmsOptedOut, reminderType, dealerTimezone, dealerPhone,
    messageVars,
  } = params

  const service = createServiceClient()
  const result: SendResult = {
    sms: 'unconfigured',
    email: 'unconfigured',
  }

  // ── SMS ──────────────────────────────────────────────────────────────────────
  const twilioSid = process.env.TWILIO_ACCOUNT_SID
  const twilioToken = process.env.TWILIO_AUTH_TOKEN
  const twilioFrom = process.env.TWILIO_FROM_NUMBER

  if (twilioSid && twilioToken && twilioFrom) {
    if (customerSmsOptedOut) {
      result.sms = 'skipped_optout'
    } else if (!isWithinSendHours(dealerTimezone)) {
      result.sms = 'skipped_hours'
    } else {
      const digits = customerPhone.replace(/\D/g, '')
      const to = digits.length === 10 ? `+1${digits}` : `+${digits}`
      const body = buildSmsMessage(reminderType, messageVars)

      try {
        const twilioRes = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`,
          {
            method: 'POST',
            headers: {
              Authorization: `Basic ${Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64')}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({ To: to, From: twilioFrom, Body: body }),
          }
        )
        const twilioData = await twilioRes.json()

        if (twilioRes.ok) {
          result.sms = 'sent'
          result.twilioSid = twilioData.sid

          // Log as activity
          await service.from('activities').insert({
            user_id: userId,
            customer_id: customerId,
            type: 'sms',
            direction: 'outbound',
            body,
            priority: 'high',
            completed_at: new Date().toISOString(),
          })
        } else {
          result.sms = 'failed'
          result.errorCode = twilioData.code
          result.errorMessage = twilioData.message

          // Error 21610 = recipient opted out via STOP to Twilio
          if (twilioData.code === 21610) {
            await service
              .from('customers')
              .update({ sms_opted_out: true, sms_opted_out_at: new Date().toISOString() })
              .eq('id', customerId)

            await service
              .from('bhph_payments')
              .update({ reminder_sequence_status: 'opted_out' })
              .eq('id', bhphId)

            result.sms = 'skipped_optout'
          }
        }
      } catch (err) {
        result.sms = 'failed'
        result.errorMessage = String(err)
      }
    }
  }

  // ── Email via Resend ─────────────────────────────────────────────────────────
  const resendKey = process.env.RESEND_API_KEY
  if (resendKey) {
    if (!customerEmail) {
      result.email = 'skipped_noemail'
    } else {
      const subject = buildEmailSubject(reminderType, messageVars.vehicleLabel)
      const html = buildEmailBody(reminderType, messageVars)

      try {
        const resendRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: `${messageVars.dealerName} <payments@${process.env.RESEND_FROM_DOMAIN ?? 'mail.dealerwyze.com'}>`,
            to: [customerEmail],
            subject,
            html,
          }),
        })

        result.email = resendRes.ok ? 'sent' : 'failed'
      } catch {
        result.email = 'failed'
      }
    }
  }

  // ── Log to payment_reminder_log ──────────────────────────────────────────────
  await service.from('payment_reminder_log').insert([
    ...(twilioSid ? [{
      user_id: userId,
      bhph_id: bhphId,
      customer_id: customerId,
      reminder_type: reminderType,
      channel: 'sms',
      status: result.sms,
      twilio_sid: result.twilioSid ?? null,
      error_code: result.errorCode ?? null,
      error_message: result.errorMessage ?? null,
      message_body: buildSmsMessage(reminderType, messageVars),
      scheduled_for: new Date().toISOString(),
      sent_at: result.sms === 'sent' ? new Date().toISOString() : null,
    }] : []),
    ...(process.env.RESEND_API_KEY && customerEmail ? [{
      user_id: userId,
      bhph_id: bhphId,
      customer_id: customerId,
      reminder_type: reminderType,
      channel: 'email',
      status: result.email,
      scheduled_for: new Date().toISOString(),
      sent_at: result.email === 'sent' ? new Date().toISOString() : null,
    }] : []),
  ])

  return result
}
