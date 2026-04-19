/**
 * POST /api/appointments/confirm
 * Body: { activity_id, datetime, customer_id, customer_name, customer_phone, customer_email, original_body }
 *
 * Confirms an appointment request: updates DB, creates GCal event, sends customer notification.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'
import { confirmAppointment } from '@/lib/calendar/confirmAppointment'

export async function POST(req: NextRequest) {
  const profile = await requireProfile()
  const supabase = createServiceClient()

  const body = await req.json() as {
    activity_id:    string
    datetime:       string
    customer_id:    string
    customer_name:  string
    customer_phone: string
    customer_email: string
    original_body:  string
  }

  const {
    activity_id, datetime, customer_id,
    customer_name = '', customer_phone = '', customer_email = '', original_body = '',
  } = body

  if (!activity_id || !datetime || !customer_id) {
    return NextResponse.json(
      { error: 'activity_id, datetime, and customer_id are required' },
      { status: 400 }
    )
  }

  // Verify this activity belongs to the caller's org (cross-tenant guard)
  const { data: activity } = await supabase
    .from('activities')
    .select('id')
    .eq('id', activity_id)
    .eq('user_id', profile.org_id)
    .maybeSingle()

  if (!activity) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const result = await confirmAppointment({
    activityId:    activity_id,
    orgId:         profile.org_id,
    datetimeIso:   datetime,
    customerId:    customer_id,
    customerName:  customer_name,
    customerPhone: customer_phone,
    customerEmail: customer_email,
    originalBody:  original_body,
  })

  return NextResponse.json({ ok: true, calendar_url: result.calendarUrl })
}
