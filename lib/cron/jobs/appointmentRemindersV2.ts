/**
 * Appointment Reminders V2 — uses sendAppointmentNotification() which handles
 * both SMS and email, and uses a wider 18-30 hour window vs V1's 23-25 hours.
 * This is the preferred/current implementation.
 *
 * V1 (appointmentReminders.ts) still runs alongside this during transition.
 * See V1 for context on when to remove it.
 */

import { sendAppointmentNotification } from '@/lib/calendar/sendAppointmentNotification'
import { getLeadOutboundIdentity } from '@/lib/locations/getLeadTemplateVars'
import type { createServiceClient } from '@/lib/supabase/service'

export async function runAppointmentRemindersV2(
  supabase: ReturnType<typeof createServiceClient>,
): Promise<{ remindersQueued: number }> {
  const apptReminderWindowStart = new Date(Date.now() + 18 * 60 * 60 * 1000).toISOString()
  const apptReminderWindowEnd   = new Date(Date.now() + 30 * 60 * 60 * 1000).toISOString()

  const { data: upcomingAppts2 } = await supabase
    .from('activities')
    .select('id, due_at, body, user_id, customer_id, customer:customers(name, primary_phone, email)')
    .eq('type', 'appointment')
    .is('direction', null)
    .is('completed_at', null)
    .is('appt_reminder_sent_at', null)
    .gte('due_at', apptReminderWindowStart)
    .lte('due_at', apptReminderWindowEnd)
    .limit(100)

  let remindersQueued = 0

  type CustRow = { name: string | null; primary_phone: string | null; email: string | null }

  for (const appt of upcomingAppts2 ?? []) {
    const cust = (Array.isArray(appt.customer) ? appt.customer[0] : appt.customer) as CustRow | null
    if (!cust) continue

    const identity = await getLeadOutboundIdentity(appt.user_id, appt.customer_id, supabase)

    await sendAppointmentNotification({
      orgId:          appt.user_id,
      customerId:     appt.customer_id,
      customerName:   cust.name ?? 'Customer',
      customerPhone:  cust.primary_phone ?? '',
      customerEmail:  cust.email ?? '',
      appointmentIso: appt.due_at,
      dealerName:     identity.name?.trim() || 'the dealership',
      calendarUrl:    null,
      type:           'reminder',
    }).catch(err => console.error('[cron/reminders] notification failed:', err))

    await supabase
      .from('activities')
      .update({ appt_reminder_sent_at: new Date().toISOString() })
      .eq('id', appt.id)

    remindersQueued++
  }

  console.log(`[check-tasks] appointment reminders queued: ${remindersQueued}`)

  return { remindersQueued }
}
