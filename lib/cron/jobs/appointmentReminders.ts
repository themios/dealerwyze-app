/** Send SMS reminders for appointments due in 23-25 hours where reminder_sent_at is null. */

import type { createServiceClient } from '@/lib/supabase/service'

export async function runAppointmentReminders(
  supabase: ReturnType<typeof createServiceClient>,
): Promise<{ remindersent: number }> {
  let remindersent = 0

  const reminderWindowStart = new Date(Date.now() + 23 * 60 * 60 * 1000).toISOString()
  const reminderWindowEnd   = new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString()

  const { data: upcomingAppts } = await supabase
    .from('activities')
    .select('id, user_id, customer_id, body, due_at, customers(name, primary_phone, secondary_phone, sms_opt_out)')
    .eq('type', 'appointment')
    .is('reminder_sent_at', null)
    .gte('due_at', reminderWindowStart)
    .lte('due_at', reminderWindowEnd)

  const twilioSid   = process.env.TWILIO_ACCOUNT_SID
  const twilioToken = process.env.TWILIO_AUTH_TOKEN
  const twilioFrom  = process.env.TWILIO_FROM_NUMBER

  for (const appt of upcomingAppts ?? []) {
    const customer = Array.isArray(appt.customers) ? appt.customers[0] : appt.customers
    if (!customer || customer.sms_opt_out) continue

    const rawPhone = customer.primary_phone || customer.secondary_phone
    if (!rawPhone) continue
    const digits = rawPhone.replace(/\D/g, '')
    const toNumber = digits.length === 10 ? `+1${digits}` : `+${digits}`

    const apptTime = appt.due_at
      ? new Date(appt.due_at).toLocaleString('en-US', {
          weekday: 'short', month: 'short', day: 'numeric',
          hour: 'numeric', minute: '2-digit',
          timeZone: 'America/Los_Angeles',
        })
      : 'your upcoming appointment'

    const { data: apptOrgSettings } = await supabase
      .from('org_settings')
      .select('business_name, dealer_cell_number')
      .eq('org_id', appt.user_id)
      .maybeSingle()
    const apptBizName  = apptOrgSettings?.business_name  ?? 'the dealership'
    const apptBizPhone = apptOrgSettings?.dealer_cell_number ?? ''

    const firstName = customer.name?.split(' ')[0] || ''
    const greeting  = firstName ? `Hi ${firstName}! ` : ''
    const reschedule = apptBizPhone ? ` Call ${apptBizPhone} to reschedule.` : ''
    const msgBody   = `${greeting}Reminder: You have an appointment at ${apptBizName} tomorrow — ${apptTime}.${reschedule} Reply STOP to opt out.`

    if (twilioSid && twilioToken && twilioFrom) {
      try {
        await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`,
          {
            method:  'POST',
            headers: {
              Authorization:  `Basic ${Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64')}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({ To: toNumber, From: twilioFrom, Body: msgBody }),
          }
        )

        await supabase
          .from('activities')
          .update({ reminder_sent_at: new Date().toISOString() })
          .eq('id', appt.id)

        remindersent++
      } catch {
        // non-fatal — will retry next cron run
      }
    }
  }

  return { remindersent }
}
