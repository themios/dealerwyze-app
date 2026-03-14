import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  const profile = await requireProfile()
  const { id } = await params
  const service = createServiceClient()

  const { data: enrollment } = await service
    .from('customer_sequences')
    .select('id, customer_id, status')
    .eq('id', id)
    .eq('org_id', profile.org_id)
    .maybeSingle()

  if (!enrollment) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const validStatuses = ['paused', 'active', 'cancelled', 'completed']
  const newStatus = body.status as string
  if (!validStatuses.includes(newStatus)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const now = new Date().toISOString()
  const updates: Record<string, unknown> = { status: newStatus }

  if (newStatus === 'cancelled' || newStatus === 'completed') {
    updates.completed_at = now
  }

  const { error } = await service
    .from('customer_sequences')
    .update(updates)
    .eq('id', id)

  if (error) return NextResponse.json({ error: 'Failed to update' }, { status: 500 })

  if (newStatus === 'cancelled') {
    await service
      .from('activities')
      .update({ completed_at: now, outcome: 'cancelled' })
      .eq('customer_id', enrollment.customer_id)
      .eq('customer_sequence_id', id)
      .is('completed_at', null)
      .in('type', ['email_followup', 'sms_followup'])
  }

  return NextResponse.json({ ok: true })
}
