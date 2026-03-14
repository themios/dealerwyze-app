import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET(req: NextRequest) {
  const profile = await requireProfile()
  const service = createServiceClient()
  const customerId = req.nextUrl.searchParams.get('customer_id')

  if (!customerId) return NextResponse.json({ error: 'customer_id required' }, { status: 400 })

  const { data } = await service
    .from('customer_sequences')
    .select('*, sequence:sequences(name, channel)')
    .eq('customer_id', customerId)
    .eq('org_id', profile.org_id)
    .in('status', ['active', 'paused'])
    .order('enrolled_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return NextResponse.json({ enrollment: data ?? null })
}

export async function POST(req: NextRequest) {
  const profile = await requireProfile()
  const service = createServiceClient()

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { customer_id, sequence_id } = body as { customer_id?: string; sequence_id?: string }

  if (!customer_id || !sequence_id) {
    return NextResponse.json({ error: 'customer_id and sequence_id are required' }, { status: 400 })
  }

  // Verify customer belongs to org — customers uses user_id, not org_id
  const { data: customer } = await service
    .from('customers')
    .select('id, name, email, primary_phone, unsubscribe_email, unsubscribe_sms')
    .eq('id', customer_id)
    .or(`user_id.eq.${profile.org_id},user_id.eq.${profile.id}`)
    .maybeSingle()

  if (!customer) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Verify sequence belongs to org
  const { data: sequence } = await service
    .from('sequences')
    .select('id, name, channel, auto_mode')
    .eq('id', sequence_id)
    .eq('org_id', profile.org_id)
    .maybeSingle()

  if (!sequence) return NextResponse.json({ error: 'Sequence not found' }, { status: 404 })

  // Block if unsubscribed
  if (sequence.channel === 'email' && customer.unsubscribe_email) {
    return NextResponse.json({ error: 'Customer has opted out of email follow-ups.' }, { status: 422 })
  }
  if (sequence.channel === 'sms' && customer.unsubscribe_sms) {
    return NextResponse.json({ error: 'Customer has opted out of SMS follow-ups.' }, { status: 422 })
  }

  // Fetch steps
  const { data: steps } = await service
    .from('sequence_steps')
    .select('id, sort_order, day_offset, send_hour, template_id, template:templates(id, name, subject, body)')
    .eq('sequence_id', sequence_id)
    .order('sort_order', { ascending: true })

  if (!steps || steps.length === 0) {
    return NextResponse.json({ error: 'This sequence has no steps. Add at least one step before enrolling.' }, { status: 422 })
  }

  const enrolledAt = new Date()

  // Create enrollment record
  const { data: enrollment, error: enrollError } = await service
    .from('customer_sequences')
    .insert({
      customer_id,
      sequence_id,
      org_id: profile.org_id,
      status: 'active',
      enrolled_at: enrolledAt.toISOString(),
    })
    .select()
    .single()

  if (enrollError || !enrollment) {
    return NextResponse.json({ error: 'Failed to create enrollment' }, { status: 500 })
  }

  // Queue one activity per step
  type StepRow = {
    id: string
    sort_order: number
    day_offset: number
    send_hour: number
    template_id: string | null
    template: { id: string; name: string; subject: string | null; body: string } | null
  }

  const activityInserts = (steps as unknown as StepRow[]).map(step => {
    const dueAt = new Date(enrolledAt)
    dueAt.setUTCDate(dueAt.getUTCDate() + step.day_offset)
    dueAt.setUTCHours(step.send_hour, 0, 0, 0)

    const actBody = JSON.stringify({
      to: sequence.channel === 'email' ? customer.email : customer.primary_phone,
      subject: step.template?.subject ?? '',
      body: step.template?.body ?? '',
      sequence_day: step.sort_order + 1,
      step_total: steps.length,
      sequence_name: sequence.name,
      customer_name: customer.name,
      vehicle: '',
      include_unsubscribe_footer: sequence.channel === 'email',
    })

    return {
      user_id: profile.org_id,
      customer_id,
      type: sequence.channel === 'email' ? 'email_followup' : 'sms_followup',
      direction: 'outbound' as const,
      priority: 'normal' as const,
      due_at: dueAt.toISOString(),
      body: actBody,
      customer_sequence_id: enrollment.id,
    }
  })

  const { error: actError } = await service.from('activities').insert(activityInserts)

  if (actError) {
    // Rollback enrollment
    await service.from('customer_sequences').delete().eq('id', enrollment.id)
    return NextResponse.json({ error: 'Failed to queue sequence steps' }, { status: 500 })
  }

  return NextResponse.json(
    { ok: true, customer_sequence_id: enrollment.id, activity_count: activityInserts.length },
    { status: 201 },
  )
}
