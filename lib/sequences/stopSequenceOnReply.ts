/**
 * stopSequenceOnReply — called whenever a customer sends an inbound message
 * (SMS via Twilio, email via pollReplies) while an active autoresponder sequence
 * is running.
 *
 * What it does:
 *  1. Pauses all active/paused sequences for the customer (optionally filtered by channel).
 *  2. Cancels their pending queued activity steps.
 *  3. Creates a deduped "take over" task so the rep knows to jump in.
 */

import { SupabaseClient } from '@supabase/supabase-js'

interface StopOptions {
  supabase:    SupabaseClient
  orgId:       string
  customerId:  string
  customerName: string
  channel?:    'email' | 'sms'   // if provided, only stops sequences for that channel
}

export async function stopSequenceOnReply({
  supabase,
  orgId,
  customerId,
  customerName,
  channel,
}: StopOptions): Promise<void> {
  const now = new Date().toISOString()

  // Find active or paused enrollments for this customer
  let seqQuery = supabase
    .from('customer_sequences')
    .select('id, channel')
    .eq('customer_id', customerId)
    .in('status', ['active', 'paused'])

  if (channel) seqQuery = seqQuery.eq('channel', channel)

  const { data: enrollments } = await seqQuery
  if (!enrollments || enrollments.length === 0) return

  const enrollmentIds = enrollments.map(e => e.id)

  // 1. Pause enrollment(s) with stop_reason = 'replied'
  //    (paused, not cancelled — so the rep can restart)
  await supabase
    .from('customer_sequences')
    .update({ status: 'paused', stop_reason: 'replied', stopped_at: now })
    .in('id', enrollmentIds)

  // 2. Cancel all pending queued steps
  await supabase
    .from('activities')
    .update({ completed_at: now, outcome: 'cancelled' })
    .in('customer_sequence_id', enrollmentIds)
    .is('completed_at', null)
    .in('type', ['email_followup', 'sms_followup', 'email', 'sms'])

  // 3. Create a deduped takeover task
  //    Only create if no open lead_followup task already exists for this customer.
  const { data: existing } = await supabase
    .from('tasks')
    .select('id')
    .eq('user_id', orgId)
    .eq('linked_customer_id', customerId)
    .eq('task_type', 'lead_followup')
    .eq('status', 'open')
    .limit(1)
    .maybeSingle()

  if (!existing) {
    const firstName = customerName.split(' ')[0]
    await supabase.from('tasks').insert({
      user_id:            orgId,
      title:              `${firstName} replied - take over the conversation`,
      task_type:          'lead_followup',
      priority:           'must',
      status:             'open',
      linked_customer_id: customerId,
      due_at:             now,
    })
  }
}

/**
 * cancelSequenceOnUnsubscribe — called when a customer sends STOP/UNSUBSCRIBE.
 * Fully cancels (not paused) so it won't restart until the customer opts back in.
 */
export async function cancelSequenceOnUnsubscribe({
  supabase,
  customerId,
  channel,
}: {
  supabase:   SupabaseClient
  customerId: string
  channel?:   'email' | 'sms'
}): Promise<void> {
  const now = new Date().toISOString()

  let seqQuery = supabase
    .from('customer_sequences')
    .select('id')
    .eq('customer_id', customerId)
    .in('status', ['active', 'paused'])

  if (channel) seqQuery = seqQuery.eq('channel', channel)

  const { data: enrollments } = await seqQuery
  if (!enrollments || enrollments.length === 0) return

  const enrollmentIds = enrollments.map(e => e.id)

  await supabase
    .from('customer_sequences')
    .update({ status: 'cancelled', stop_reason: 'unsubscribed', stopped_at: now, completed_at: now })
    .in('id', enrollmentIds)

  await supabase
    .from('activities')
    .update({ completed_at: now, outcome: 'cancelled' })
    .in('customer_sequence_id', enrollmentIds)
    .is('completed_at', null)
    .in('type', ['email_followup', 'sms_followup', 'email', 'sms'])
}
