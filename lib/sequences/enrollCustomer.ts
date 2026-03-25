/**
 * enrollCustomer — shared enrollment helper used by both the API route
 * (POST /api/customer-sequences) and the retention-triggers cron.
 *
 * Cancels any existing active/paused enrollment for the same channel,
 * inserts the new customer_sequences row, and queues one activity per step.
 */

import { SupabaseClient } from '@supabase/supabase-js'

interface Customer {
  id: string
  name: string
  email: string | null
  primary_phone: string
  unsubscribe_email?: boolean
  unsubscribe_sms?: boolean
}

interface Sequence {
  id: string
  name: string
  channel: string
  auto_mode: string
}

interface SequenceStep {
  id: string
  sort_order: number
  day_offset: number
  send_hour: number
  template_id: string | null
  template: { id: string; name: string; subject: string | null; body: string } | null
}

interface EnrollOptions {
  supabase:   SupabaseClient
  orgId:      string
  customer:   Customer
  sequence:   Sequence
  steps:      SequenceStep[]
  startAt?:   Date    // defaults to now
  startImmediately?: boolean
}

interface EnrollResult {
  ok: boolean
  customer_sequence_id?: string
  activity_count?: number
  error?: string
  skipped?: boolean
  skip_reason?: string
}

export async function enrollCustomer({
  supabase,
  orgId,
  customer,
  sequence,
  steps,
  startAt,
  startImmediately,
}: EnrollOptions): Promise<EnrollResult> {
  // Guard: unsubscribed
  if (sequence.channel === 'email' && customer.unsubscribe_email) {
    return { ok: false, skipped: true, skip_reason: 'unsubscribed_email' }
  }
  if (sequence.channel === 'sms' && customer.unsubscribe_sms) {
    return { ok: false, skipped: true, skip_reason: 'unsubscribed_sms' }
  }
  if (steps.length === 0) {
    return { ok: false, error: 'sequence_has_no_steps' }
  }

  const now      = new Date()
  const nowIso   = now.toISOString()
  const start    = startAt ?? now

  // Cancel any existing active/paused enrollment for the same channel
  const { data: existing } = await supabase
    .from('customer_sequences')
    .select('id')
    .eq('customer_id', customer.id)
    .eq('org_id', orgId)
    .eq('channel', sequence.channel)
    .in('status', ['active', 'paused'])
    .maybeSingle()

  if (existing) {
    await supabase
      .from('activities')
      .update({ completed_at: nowIso, outcome: 'cancelled' })
      .eq('customer_sequence_id', existing.id)
      .is('completed_at', null)
    await supabase
      .from('customer_sequences')
      .update({ status: 'cancelled', stop_reason: 'manual', stopped_at: nowIso, completed_at: nowIso })
      .eq('id', existing.id)
  }

  // Insert enrollment
  const { data: enrollment, error: enrollError } = await supabase
    .from('customer_sequences')
    .insert({
      customer_id:  customer.id,
      sequence_id:  sequence.id,
      org_id:       orgId,
      channel:      sequence.channel,
      status:       'active',
      start_at:     start.toISOString(),
      enrolled_at:  nowIso,
    })
    .select()
    .single()

  if (enrollError || !enrollment) {
    console.error('[enrollCustomer] enrollment insert error:', enrollError)
    return { ok: false, error: 'enrollment_insert_failed' }
  }

  // Queue one activity per step
  function buildInserts(kind: 'followup' | 'legacy') {
    return steps.map((step, idx) => {
      const dueAt = new Date(start)
      if (!(startImmediately && idx === 0)) {
        dueAt.setUTCDate(dueAt.getUTCDate() + step.day_offset)
        dueAt.setUTCHours(step.send_hour, 0, 0, 0)
      }

      const stepLabel = step.template?.name
        ? `Day ${step.sort_order + 1} - ${step.template.name}`
        : `Day ${step.sort_order + 1}`

      const actBody = JSON.stringify({
        to:                         sequence.channel === 'email' ? customer.email : customer.primary_phone,
        subject:                    step.template?.subject ?? '',
        body:                       step.template?.body ?? '',
        sequence_day:               step.sort_order + 1,
        step_total:                 steps.length,
        sequence_name:              sequence.name,
        step_label:                 stepLabel,
        customer_name:              customer.name,
        vehicle:                    '',
        include_unsubscribe_footer: sequence.channel === 'email',
      })

      const type =
        kind === 'followup'
          ? (sequence.channel === 'email' ? 'email_followup' : 'sms_followup')
          : (sequence.channel === 'email' ? 'email' : 'sms')

      return {
        user_id:              orgId,
        customer_id:          customer.id,
        type,
        direction:            'outbound' as const,
        priority:             'normal'   as const,
        due_at:               dueAt.toISOString(),
        body:                 actBody,
        customer_sequence_id: enrollment.id,
      }
    })
  }

  let { error: actError } = await supabase.from('activities').insert(buildInserts('followup'))

  // Backward-compatible fallback if *_followup type values aren't in DB yet
  if (actError) {
    const errText = `${actError.message ?? ''} ${actError.details ?? ''}`.toLowerCase()
    const typeViolation =
      errText.includes('activities_type_check') ||
      (errText.includes('check constraint') && errText.includes('type'))
    if (typeViolation) {
      const { error: legacyErr } = await supabase.from('activities').insert(buildInserts('legacy'))
      if (!legacyErr) actError = null
    }
  }

  if (actError) {
    console.error('[enrollCustomer] activities insert error:', actError)
    await supabase.from('customer_sequences').delete().eq('id', enrollment.id)
    return { ok: false, error: 'activity_insert_failed' }
  }

  return { ok: true, customer_sequence_id: enrollment.id, activity_count: steps.length }
}
