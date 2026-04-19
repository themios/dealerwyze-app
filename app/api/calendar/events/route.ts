/**
 * GET /api/calendar/events
 * Returns upcoming confirmed appointments for this org.
 * Query params: from (ISO, default now), days (default 30, max 365)
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'
import { getCalendarEvents } from '@/lib/google/calendar'

export async function GET(req: NextRequest) {
  const profile = await requireProfile()
  const supabase = createServiceClient()
  const orgId = profile.org_id

  const fromParam = req.nextUrl.searchParams.get('from')
  const daysParam = req.nextUrl.searchParams.get('days')

  const fromDate = fromParam ? new Date(fromParam) : new Date()
  const days = Math.min(parseInt(daysParam ?? '30', 10), 365)

  if (isNaN(fromDate.getTime())) {
    return NextResponse.json({ error: 'Invalid from date' }, { status: 400 })
  }

  const toDate = new Date(fromDate.getTime() + days * 86400000)

  // Confirmed appointments from DB: direction IS NULL = confirmed, inbound = pending request
  const { data: dbAppointments } = await supabase
    .from('activities')
    .select('id, due_at, body, google_calendar_event_id, customer:customers(id, name, primary_phone)')
    .eq('user_id', orgId)
    .eq('type', 'appointment')
    .is('direction', null)
    .is('completed_at', null)
    .gte('due_at', fromDate.toISOString())
    .lte('due_at', toDate.toISOString())
    .order('due_at', { ascending: true })
    .limit(100)

  // Google Calendar events not yet linked to a DB activity
  const gcalEvents = await getCalendarEvents(orgId, {
    fromIso:    fromDate.toISOString(),
    maxResults: 50,
  })

  const linkedGcalIds = new Set(
    (dbAppointments ?? [])
      .map(a => a.google_calendar_event_id)
      .filter(Boolean)
  )
  const gcalOnly = gcalEvents.filter(ev => !linkedGcalIds.has(ev.id))

  return NextResponse.json({
    appointments: dbAppointments ?? [],
    gcal_only:    gcalOnly,
  })
}
