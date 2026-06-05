/**
 * When a buyer showing request is confirmed: CRM calendar activity + Google Calendar.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { createCalendarEvent } from '@/lib/google/calendar'

export interface SyncConfirmedShowingParams {
  supabase: SupabaseClient
  orgId: string
  listingId: string
  showingRequestId: string
  buyerName: string
  buyerEmail: string
  buyerPhone: string | null
  address: string
  confirmedTime: string
  message?: string | null
}

export async function syncConfirmedShowingToCalendar(
  params: SyncConfirmedShowingParams,
): Promise<{ activityId: string | null; googleCalendarEventId: string | null }> {
  const {
    supabase,
    orgId,
    listingId,
    showingRequestId,
    buyerName,
    buyerEmail,
    buyerPhone,
    address,
    confirmedTime,
    message,
  } = params

  const dueAt = new Date(confirmedTime).toISOString()
  const body = [
    `Showing with ${buyerName}`,
    `Email: ${buyerEmail}`,
    buyerPhone ? `Phone: ${buyerPhone}` : null,
    `Property: ${address}`,
    message ? `Notes: ${message}` : null,
    `Request ID: ${showingRequestId}`,
  ]
    .filter(Boolean)
    .join('\n')

  const { data: existing } = await supabase
    .from('activities')
    .select('id')
    .eq('user_id', orgId)
    .eq('vehicle_id', listingId)
    .eq('type', 'appointment')
    .eq('direction', 'inbound')
    .ilike('body', `%${buyerName.replace(/[%_]/g, '')}%`)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let activityId: string | null = existing?.id ?? null

  if (activityId) {
    await supabase
      .from('activities')
      .update({
        due_at: dueAt,
        direction: null,
        outcome: 'pending',
        priority: 'high',
        body,
        completed_at: null,
      })
      .eq('id', activityId)
  } else {
    const { data: created } = await supabase
      .from('activities')
      .insert({
        user_id: orgId,
        vehicle_id: listingId,
        type: 'appointment',
        direction: null,
        outcome: 'pending',
        priority: 'high',
        body,
        due_at: dueAt,
      })
      .select('id')
      .single()
    activityId = created?.id ?? null
  }

  const { eventId } = await createCalendarEvent(
    {
      summary: `Showing — ${buyerName}`,
      description: body,
      location: address,
      startDateTimeIso: dueAt,
      durationMin: 60,
    },
    orgId,
  )

  if (eventId && activityId) {
    await supabase
      .from('activities')
      .update({ google_calendar_event_id: eventId })
      .eq('id', activityId)
  }

  return { activityId, googleCalendarEventId: eventId }
}
