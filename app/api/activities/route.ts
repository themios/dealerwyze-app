import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'
import { dispatchWebhook } from '@/lib/webhooks/dispatch'

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

  const supabase = createServiceClient()

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

  if (type === 'appointment') {
    dispatchWebhook(profile.org_id, 'appointment_created', {
      customer_id: activity.customer_id ?? null,
      activity_id: activity.id,
      due_at: activity.due_at ?? null,
      body: activity.body ?? null,
      source: 'manual',
    }).catch(() => {})
  }

  return NextResponse.json({ activity }, { status: 201 })
}
