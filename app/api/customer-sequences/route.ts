import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'

// ── GET /api/customer-sequences?customer_id=... ───────────────────────────────
// Returns per-channel enrollment status: { email: EnrollmentEntry | null, sms: EnrollmentEntry | null }
export async function GET(req: NextRequest) {
  const profile = await requireProfile()
  const service = createServiceClient()
  const customerId = req.nextUrl.searchParams.get('customer_id')

  if (!customerId) return NextResponse.json({ error: 'customer_id required' }, { status: 400 })

  const { data: rows } = await service
    .from('customer_sequences')
    .select('id, status, channel, sequence_id, stop_reason, stopped_at, enrolled_at, sequence:sequences(name)')
    .eq('customer_id', customerId)
    .eq('org_id', profile.org_id)
    .in('status', ['active', 'paused'])
    .order('enrolled_at', { ascending: false })

  const enrollments = rows ?? []
  const emailRow    = enrollments.find(e => e.channel === 'email') ?? null
  const smsRow      = enrollments.find(e => e.channel === 'sms')   ?? null

  // Fetch next pending step due_at for each active enrollment
  const activeIds = enrollments.map(e => e.id)
  const nextStepMap: Record<string, string> = {}
  if (activeIds.length > 0) {
    const { data: pending } = await service
      .from('activities')
      .select('customer_sequence_id, due_at')
      .in('customer_sequence_id', activeIds)
      .is('completed_at', null)
      .not('due_at', 'is', null)
      .order('due_at', { ascending: true })
    for (const s of pending ?? []) {
      if (s.customer_sequence_id && !nextStepMap[s.customer_sequence_id]) {
        nextStepMap[s.customer_sequence_id] = s.due_at
      }
    }
  }

  function toEntry(row: typeof enrollments[0] | null) {
    if (!row) return null
    const seq = Array.isArray(row.sequence) ? row.sequence[0] : row.sequence
    return {
      id:            row.id,
      status:        row.status,
      channel:       row.channel,
      sequence_id:   row.sequence_id,
      sequence_name: (seq as { name?: string } | null)?.name ?? '',
      stop_reason:   row.stop_reason   ?? null,
      stopped_at:    row.stopped_at    ?? null,
      next_step_due: nextStepMap[row.id] ?? null,
    }
  }

  return NextResponse.json({ email: toEntry(emailRow), sms: toEntry(smsRow) })
}

// ── POST /api/customer-sequences ──────────────────────────────────────────────
// Enrolls a customer in a sequence. Cancels any existing active/paused
// enrollment for the same channel first.
export async function POST(req: NextRequest) {
  const profile = await requireProfile()
  const service = createServiceClient()

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { customer_id, sequence_id, start_immediately, start_at } = body as {
    customer_id?:      string
    sequence_id?:      string
    start_immediately?: boolean
    start_at?:         string   // ISO — optional scheduled start; defaults to now
  }

  if (!customer_id || !sequence_id) {
    return NextResponse.json({ error: 'customer_id and sequence_id are required' }, { status: 400 })
  }

  // Verify customer belongs to org
  const { data: customer } = await service
    .from('customers')
    .select('id, name, email, primary_phone, unsubscribe_email, unsubscribe_sms')
    .eq('id', customer_id)
    .or(`user_id.eq.${profile.org_id},user_id.eq.${profile.id}`)
    .maybeSingle()

  if (!customer) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const custData = customer  // narrow to non-null for use inside closures

  // Verify sequence belongs to org
  const { data: sequence } = await service
    .from('sequences')
    .select('id, name, channel, auto_mode')
    .eq('id', sequence_id)
    .eq('org_id', profile.org_id)
    .maybeSingle()

  if (!sequence) return NextResponse.json({ error: 'Sequence not found' }, { status: 404 })
  const seqData = sequence  // narrow to non-null for use inside closures

  // Block if unsubscribed
  if (sequence.channel === 'email' && customer.unsubscribe_email) {
    return NextResponse.json({ error: 'Customer has opted out of email follow-ups.' }, { status: 422 })
  }
  if (sequence.channel === 'sms' && customer.unsubscribe_sms) {
    return NextResponse.json({ error: 'Customer has opted out of SMS follow-ups.' }, { status: 422 })
  }

  // Cap: max 500 active enrollments per org
  const { count: activeCount } = await service
    .from('customer_sequences')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', profile.org_id)
    .in('status', ['active', 'paused'])
  if ((activeCount ?? 0) >= 500) {
    return NextResponse.json(
      { error: 'Too many active sequences. Your account has reached the 500 active sequence limit. Complete or cancel existing ones before enrolling more.' },
      { status: 429 },
    )
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
  const stepsData = steps  // narrow to non-null for use inside closures

  const now       = new Date()
  const nowIso    = now.toISOString()
  const startAt   = start_at ? new Date(start_at) : now
  const enrolledAt = now

  // Cancel any existing active/paused enrollment for the same channel
  const { data: existingEnrollment } = await service
    .from('customer_sequences')
    .select('id')
    .eq('customer_id', customer_id)
    .eq('org_id', profile.org_id)
    .eq('channel', sequence.channel)
    .in('status', ['active', 'paused'])
    .maybeSingle()

  if (existingEnrollment) {
    await service
      .from('activities')
      .update({ completed_at: nowIso, outcome: 'cancelled' })
      .eq('customer_sequence_id', existingEnrollment.id)
      .is('completed_at', null)
    await service
      .from('customer_sequences')
      .update({ status: 'cancelled', stop_reason: 'manual', stopped_at: nowIso, completed_at: nowIso })
      .eq('id', existingEnrollment.id)
  }

  // Create enrollment record
  const { data: enrollment, error: enrollError } = await service
    .from('customer_sequences')
    .insert({
      customer_id,
      sequence_id,
      org_id:    profile.org_id,
      channel:   sequence.channel,
      status:    'active',
      start_at:  startAt.toISOString(),
      enrolled_at: enrolledAt.toISOString(),
    })
    .select()
    .single()

  if (enrollError || !enrollment) {
    console.error('[customer-sequences] enrollment insert error:', enrollError)
    return NextResponse.json({ error: 'Failed to create enrollment' }, { status: 500 })
  }

  // Queue one activity per step — anchored to startAt
  type StepRow = {
    id: string
    sort_order: number
    day_offset: number
    send_hour: number
    template_id: string | null
    template: { id: string; name: string; subject: string | null; body: string } | null
  }

  function buildActivityInserts(kind: 'followup' | 'legacy') {
    return (stepsData as unknown as StepRow[]).map((step, idx) => {
      const dueAt = new Date(startAt)
      // First step: fire immediately if start_immediately (or start_at is now)
      if (!(start_immediately && idx === 0)) {
        dueAt.setUTCDate(dueAt.getUTCDate() + step.day_offset)
        dueAt.setUTCHours(step.send_hour, 0, 0, 0)
      }

      // Label: "Day N - {template name}" so the timeline shows it's automated
      const stepLabel = step.template?.name
        ? `Day ${step.sort_order + 1} - ${step.template.name}`
        : `Day ${step.sort_order + 1}`

      const actBody = JSON.stringify({
        to:                       seqData.channel === 'email' ? custData.email : custData.primary_phone,
        subject:                  step.template?.subject ?? '',
        body:                     step.template?.body ?? '',
        sequence_day:             step.sort_order + 1,
        step_total:               stepsData.length,
        sequence_name:            seqData.name,
        step_label:               stepLabel,
        customer_name:            custData.name,
        vehicle:                  '',
        include_unsubscribe_footer: seqData.channel === 'email',
      })

      const type =
        kind === 'followup'
          ? (seqData.channel === 'email' ? 'email_followup' : 'sms_followup')
          : (seqData.channel === 'email' ? 'email' : 'sms')

      return {
        user_id:              profile.org_id,
        customer_id,
        type,
        direction:            'outbound' as const,
        priority:             'normal' as const,
        due_at:               dueAt.toISOString(),
        body:                 actBody,
        customer_sequence_id: enrollment.id,
      }
    })
  }

  const activityInserts = buildActivityInserts('followup')
  let { error: actError } = await service.from('activities').insert(activityInserts)

  // Backward-compatible fallback for DBs without *_followup type values
  if (actError) {
    const errText = `${actError.message ?? ''} ${actError.details ?? ''} ${actError.hint ?? ''}`.toLowerCase()
    const typeConstraintViolation =
      errText.includes('activities_type_check') ||
      (errText.includes('check constraint') && errText.includes('type'))

    if (typeConstraintViolation) {
      const { error: legacyError } = await service.from('activities').insert(buildActivityInserts('legacy'))
      if (!legacyError) actError = null
      else console.error('[customer-sequences] legacy activities insert error:', legacyError)
    }
  }

  if (actError) {
    console.error('[customer-sequences] activities insert error:', actError)
    await service.from('customer_sequences').delete().eq('id', enrollment.id)
    return NextResponse.json({ error: 'Failed to queue sequence steps' }, { status: 500 })
  }

  // Enrolling = action taken — address customer's pending inbound lead
  await service
    .from('activities')
    .update({ addressed_at: nowIso })
    .eq('user_id', profile.org_id)
    .eq('customer_id', customer_id)
    .eq('direction', 'inbound')
    .eq('outcome', 'pending')
    .is('completed_at', null)

  return NextResponse.json(
    { ok: true, customer_sequence_id: enrollment.id, activity_count: activityInserts.length },
    { status: 201 },
  )
}
