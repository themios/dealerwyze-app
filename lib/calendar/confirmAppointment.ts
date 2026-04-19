/**
 * confirmAppointment
 *
 * Called when a dealer clicks "Add to Calendar" on an appointment request card.
 * 1. Updates the activity in DB (sets due_at, clears direction so it becomes a confirmed appt)
 * 2. Creates a Google Calendar event
 * 3. Sends customer SMS/email confirmation
 *
 * Returns { calendarUrl } - null if GCal is not configured (non-fatal).
 * Never throws.
 */
import { createServiceClient } from '@/lib/supabase/service'
import { createCalendarEvent } from '@/lib/google/calendar'
import { sendAppointmentNotification } from '@/lib/calendar/sendAppointmentNotification'

export interface ConfirmAppointmentInput {
  activityId: string
  orgId: string
  datetimeIso: string // "YYYY-MM-DDTHH:mm" or full ISO
  customerId: string
  customerName: string
  customerPhone: string
  customerEmail: string
  originalBody: string // the customer's original message
}

export async function confirmAppointment(
  input: ConfirmAppointmentInput
): Promise<{ calendarUrl: string | null }> {
  const {
    activityId,
    orgId,
    datetimeIso,
    customerId,
    customerName,
    customerPhone,
    customerEmail,
    originalBody,
  } = input

  const supabase = createServiceClient()

  // Normalise to "YYYY-MM-DD HH:mm" for createCalendarEvent (expects space-separated, no seconds)
  const startIso = datetimeIso.replace('T', ' ').substring(0, 16)

  // 1. Update activity: mark confirmed (clear direction, set due_at, high priority)
  await supabase
    .from('activities')
    .update({
      due_at: new Date(datetimeIso).toISOString(),
      direction: null,
      outcome: 'pending',
      priority: 'high',
      body: `Test drive / appointment with ${customerName}\n\nRequested: "${originalBody}"`,
    })
    .eq('id', activityId)

  // 2. Create Google Calendar event
  const calendarUrl = await createCalendarEvent(
    {
      summary: `Appointment - ${customerName}`,
      description: `Customer requested: "${originalBody}"\n\nCustomer phone: ${customerPhone}`,
      startIso,
      durationMin: 60,
    },
    orgId
  )

  // 3. Fetch dealer name for notification
  const { data: settings } = await supabase
    .from('org_settings')
    .select('business_name')
    .eq('org_id', orgId)
    .maybeSingle()
  const dealerName = settings?.business_name ?? 'the dealership'

  // 4. Send customer confirmation - non-blocking
  sendAppointmentNotification({
    orgId,
    customerId,
    customerName,
    customerPhone,
    customerEmail,
    appointmentIso: new Date(datetimeIso).toISOString(),
    dealerName,
    calendarUrl,
    type: 'confirmation',
  }).catch((err) =>
    console.error('[confirmAppointment] notification failed:', err)
  )

  return { calendarUrl }
}
