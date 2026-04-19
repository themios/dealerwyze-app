/**
 * sendAppointmentNotification
 *
 * Sends the customer an SMS and/or email about their appointment.
 * type: 'confirmation' | 'reminder'
 * Never throws — all errors are logged.
 */
import { google } from 'googleapis'
import { createServiceClient } from '@/lib/supabase/service'

interface NotifyInput {
  orgId:          string
  customerId:     string
  customerName:   string
  customerPhone:  string
  customerEmail:  string
  appointmentIso: string   // ISO datetime of appointment
  dealerName:     string
  calendarUrl:    string | null
  type:           'confirmation' | 'reminder'
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles',
  })
}

export async function sendAppointmentNotification(input: NotifyInput): Promise<void> {
  const {
    orgId, customerId, customerPhone, customerEmail, customerName,
    appointmentIso, dealerName, calendarUrl, type,
  } = input

  const supabase = createServiceClient()
  const formattedTime = formatDateTime(appointmentIso)
  const calendarLine  = calendarUrl ? `\nCalendar invite: ${calendarUrl}` : ''

  const smsBody = type === 'confirmation'
    ? `Hi ${customerName}, your appointment with ${dealerName} is confirmed for ${formattedTime}.${calendarLine} Reply STOP to opt out.`
    : `Hi ${customerName}, reminder: your appointment with ${dealerName} is tomorrow at ${formattedTime}. Reply STOP to opt out.`

  // ── SMS ──────────────────────────────────────────────────────────────────────
  if (customerPhone) {
    const { data: customer } = await supabase
      .from('customers')
      .select('sms_opt_out, sms_consent_status')
      .eq('id', customerId)
      .maybeSingle()

    const canSms = customer &&
      !customer.sms_opt_out &&
      customer.sms_consent_status === 'opted_in'

    if (canSms) {
      const { data: settings } = await supabase
        .from('org_settings')
        .select('twilio_phone_number')
        .eq('org_id', orgId)
        .maybeSingle()

      const accountSid = process.env.TWILIO_ACCOUNT_SID
      const authToken  = process.env.TWILIO_AUTH_TOKEN
      const from       = settings?.twilio_phone_number ?? process.env.TWILIO_FROM_NUMBER

      if (accountSid && authToken && from) {
        try {
          await fetch(
            `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
            {
              method: 'POST',
              headers: {
                Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
                'Content-Type': 'application/x-www-form-urlencoded',
              },
              body: new URLSearchParams({ To: customerPhone, From: from, Body: smsBody }),
            }
          )

          await supabase.from('activities').insert({
            user_id:      orgId,
            customer_id:  customerId,
            type:         'sms',
            direction:    'outbound',
            body:         smsBody,
            completed_at: new Date().toISOString(),
          })
        } catch (err) {
          console.error('[sendAppointmentNotification] SMS failed:', err)
        }
      }
    }
  }

  // ── Email ─────────────────────────────────────────────────────────────────────
  if (customerEmail) {
    const { data: custRow } = await supabase
      .from('customers')
      .select('unsubscribe_email')
      .eq('id', customerId)
      .maybeSingle()

    if (!custRow?.unsubscribe_email) {
      const subject = type === 'confirmation'
        ? `Your appointment at ${dealerName} is confirmed`
        : `Reminder: your appointment at ${dealerName} is tomorrow`

      const htmlBody = `<!DOCTYPE html><html><body style="font-family:sans-serif;font-size:15px;color:#111;max-width:600px;margin:0 auto;padding:16px">
<p>Hi ${customerName},</p>
<p>${type === 'confirmation' ? 'Your appointment is confirmed' : 'This is a reminder about your upcoming appointment'} at ${dealerName}.</p>
<p><strong>Date &amp; Time:</strong> ${formattedTime}</p>
${calendarUrl ? `<p><a href="${calendarUrl}">View calendar invite</a></p>` : ''}
<p>See you then!</p>
</body></html>`

      const { data: account } = await supabase
        .from('email_accounts')
        .select('id, email, oauth_refresh_token')
        .eq('org_id', orgId)
        .eq('enabled', true)
        .limit(1)
        .maybeSingle()

      if (account?.oauth_refresh_token && account.email) {
        try {
          const auth = new google.auth.OAuth2(
            process.env.GMAIL_CLIENT_ID,
            process.env.GMAIL_CLIENT_SECRET,
          )
          auth.setCredentials({ refresh_token: account.oauth_refresh_token })
          const gmail = google.gmail({ version: 'v1', auth })

          // Build RFC 2822 MIME message
          const mime = [
            `From: "${dealerName}" <${account.email}>`,
            `To: ${customerEmail}`,
            `Subject: ${subject}`,
            'MIME-Version: 1.0',
            'Content-Type: text/html; charset=UTF-8',
            '',
            htmlBody,
          ].join('\r\n')

          const encodedMessage = Buffer.from(mime).toString('base64url')

          await gmail.users.messages.send({
            userId:      'me',
            requestBody: { raw: encodedMessage },
          })

          await supabase.from('activities').insert({
            user_id:      orgId,
            customer_id:  customerId,
            type:         'email',
            direction:    'outbound',
            body:         subject,
            completed_at: new Date().toISOString(),
          })
        } catch (err) {
          console.error('[sendAppointmentNotification] Email failed:', err)
        }
      }
    }
  }
}
