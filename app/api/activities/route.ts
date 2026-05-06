import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import { createCalendarEvent } from '@/lib/google/calendar'
import { dispatchWebhook } from '@/lib/webhooks/dispatch'
import { emitEvent } from '@/lib/intelligence/emitEvent'

const ALLOWED_TYPES = [
  'appointment', 'note', 'call', 'sms', 'email', 'task',
  'email_followup', 'sms_followup', 'web_lead',
]

export async function POST(req: NextRequest) {
  const profile = await requireProfile()

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const type = typeof body.type === 'string' ? body.type : ''
  if (!type || !ALLOWED_TYPES.includes(type)) {
    return NextResponse.json({ error: 'Invalid or missing type' }, { status: 400 })
  }

  const supabase = await createClient()

  // If customer_id provided, verify it belongs to this org
  if (body.customer_id) {
    const { data: cust } = await supabase
      .from('customers')
      .select('id')
      .eq('id', body.customer_id as string)
      .eq('user_id', profile.org_id)
      .maybeSingle()
    if (!cust) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
  }

  if (body.vehicle_id) {
    const { data: vehicle } = await supabase
      .from('vehicles')
      .select('id')
      .eq('id', body.vehicle_id as string)
      .eq('user_id', profile.org_id)
      .maybeSingle()
    if (!vehicle) return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 })
  }

  const insert: Record<string, unknown> = {
    user_id: profile.org_id,
    type,
    direction: body.direction ?? null,
    outcome: body.outcome ?? null,
    priority: body.priority ?? 'normal',
    body: typeof body.body === 'string' ? body.body : null,
    due_at: body.due_at ?? null,
    completed_at: body.completed_at ?? null,
    customer_id: body.customer_id ?? null,
    vehicle_id: body.vehicle_id ?? null,
    created_by: profile.id,
  }

  const { data: activity, error } = await supabase
    .from('activities')
    .insert(insert)
    .select('id, type, customer_id, due_at, body')
    .single()

  if (error) return NextResponse.json({ error: 'Failed to create activity' }, { status: 500 })

  let calendarUrl: string | null = null
  if (type === 'appointment' && insert.direction === null && typeof insert.due_at === 'string') {
    const dueAt = new Date(insert.due_at)
    if (!isNaN(dueAt.getTime())) {
      const customerId = typeof body.customer_id === 'string' ? body.customer_id : null
      const vehicleId = typeof body.vehicle_id === 'string' ? body.vehicle_id : null

      const [{ data: customer }, { data: vehicle }] = await Promise.all([
        customerId
          ? supabase
              .from('customers')
              .select('name, primary_phone')
              .eq('id', customerId)
              .eq('user_id', profile.org_id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        vehicleId
          ? supabase
              .from('vehicles')
              .select('year, make, model, trim')
              .eq('id', vehicleId)
              .eq('user_id', profile.org_id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ])

      const vehicleLabel = vehicle
        ? [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(' ')
        : null
      const details = [
        customer?.name ? `Customer: ${customer.name}` : '',
        customer?.primary_phone ? `Phone: ${customer.primary_phone}` : '',
        vehicleLabel ? `Vehicle: ${vehicleLabel}` : '',
        activity.body ? `Notes: ${activity.body}` : '',
      ].filter(Boolean).join('\n')

      const result = await createCalendarEvent(
        {
          summary: customer?.name ? `Appointment - ${customer.name}` : 'Appointment',
          description: details,
          startDateTimeIso: dueAt.toISOString(),
          durationMin: 60,
        },
        profile.org_id,
      )
      calendarUrl = result.htmlLink

      if (result.eventId) {
        await supabase
          .from('activities')
          .update({ google_calendar_event_id: result.eventId })
          .eq('id', activity.id)
      }
    }
  }

  // When a rep logs any outbound action, mark the customer's pending inbound leads as addressed
  // so they leave the Today queue. Covers manual call logs, notes, emails, SMS logged via this route.
  const direction = typeof body.direction === 'string' ? body.direction : null
  const customerId = typeof body.customer_id === 'string' ? body.customer_id : null
  if (direction === 'outbound' && customerId) {
    await supabase
      .from('activities')
      .update({ addressed_at: new Date().toISOString() })
      .eq('user_id', profile.org_id)
      .eq('customer_id', customerId)
      .eq('direction', 'inbound')
      .eq('outcome', 'pending')
      .is('completed_at', null)
      .is('addressed_at', null)
  }

  if (type === 'appointment') {
    dispatchWebhook(profile.org_id, 'appointment_created', {
      customer_id: activity.customer_id ?? null,
      activity_id: activity.id,
      due_at: activity.due_at ?? null,
      body: activity.body ?? null,
      source: 'manual',
    }).catch(() => {})
  }

  const direction2 = typeof body.direction === 'string' ? body.direction : null
  const customerId2 = typeof body.customer_id === 'string' ? body.customer_id : null
  const MESSAGING_TYPES = new Set(['sms', 'sms_followup', 'email', 'email_followup', 'call'])
  if (MESSAGING_TYPES.has(type) && customerId2) {
    const channelMap: Record<string, 'sms' | 'email' | 'call'> = {
      sms: 'sms', sms_followup: 'sms',
      email: 'email', email_followup: 'email',
      call: 'call',
    }
    emitEvent({
      orgId:      profile.org_id,
      eventType:  direction2 === 'inbound' ? 'message_received' : 'message_sent',
      entityType: 'activity',
      entityId:   activity.id,
      actorId:    profile.id,
      channel:    channelMap[type] ?? null,
      direction:  (direction2 === 'inbound' || direction2 === 'outbound') ? direction2 : null,
      metadata: {
        customer_id: customerId2,
        hour_of_day: new Date().getUTCHours(),
        day_of_week: new Date().getUTCDay(),
      },
    }).catch(() => {})
  }

  return NextResponse.json({ activity, calendar_url: calendarUrl }, { status: 201 })
}
