/** Auto-fire pending email steps for full_auto sequences, stopping when customers reply or unsubscribe. */

import type { createServiceClient } from '@/lib/supabase/service'

export async function runFullAutoSequence(
  supabase: ReturnType<typeof createServiceClient>,
): Promise<{ fullAutoFired: number }> {
  let fullAutoFired = 0

  try {
    const nowIso = new Date().toISOString()
    const { sendSequenceEmail: sendSeqEmail } = await import('@/lib/email/sendSequenceEmail')

    const { data: dueActivities } = await supabase
      .from('activities')
      .select('id, user_id, customer_id, body, customer_sequence_id')
      .in('type', ['email_followup', 'email'])
      .eq('direction', 'outbound')
      .is('completed_at', null)
      .lte('due_at', nowIso)
      .not('customer_sequence_id', 'is', null)
      .limit(50)

    if (!dueActivities || dueActivities.length === 0) return { fullAutoFired }

    // Gate: skip activities for free-tier orgs
    const orgIds = [...new Set(dueActivities.map(a => a.user_id))]
    const { data: orgRows } = await supabase
      .from('organizations')
      .select('id, plan')
      .in('id', orgIds)
    const freeOrgIds = new Set((orgRows ?? []).filter(o => o.plan === 'free').map(o => o.id))
    const eligibleActivities = dueActivities.filter(a => !freeOrgIds.has(a.user_id))
    if (eligibleActivities.length === 0) return { fullAutoFired }

    // Batch 1: all enrollments + sequence auto_mode (replaces 1 query per activity)
    const enrollmentIds = [...new Set(eligibleActivities.map(a => a.customer_sequence_id).filter(Boolean))] as string[]
    const { data: enrollments } = await supabase
      .from('customer_sequences')
      .select('id, status, org_id, sequence:sequences(auto_mode)')
      .in('id', enrollmentIds)
    const enrollmentMap = new Map((enrollments ?? []).map(e => [e.id, e]))

    // Batch 2: customer unsubscribe status (replaces 1 query per activity)
    const customerIds = [...new Set(eligibleActivities.map(a => a.customer_id))]
    const { data: customers } = await supabase
      .from('customers')
      .select('id, unsubscribe_email, email')
      .in('id', customerIds)
    const customerMap = new Map((customers ?? []).map(c => [c.id, c as { id: string; unsubscribe_email: boolean; email: string | null }]))

    // Batch 3: any inbound reply for the affected customers (replaces 1 query per activity)
    const { data: allReplies } = await supabase
      .from('activities')
      .select('customer_id')
      .in('customer_id', Array.from(new Set(customerIds)))
      .eq('direction', 'inbound')
      .in('type', ['email', 'sms'])
    const customersWithReplies = new Set((allReplies ?? []).map(r => r.customer_id as string))

    for (const act of eligibleActivities) {
      if (!act.customer_sequence_id) continue

      const enrollment = enrollmentMap.get(act.customer_sequence_id)
      if (!enrollment || enrollment.status !== 'active') continue
      const seqData = Array.isArray(enrollment.sequence) ? enrollment.sequence[0] : enrollment.sequence
      if ((seqData as { auto_mode?: string } | null)?.auto_mode !== 'full_auto') continue

      const cust = customerMap.get(act.customer_id)

      if (cust?.unsubscribe_email) {
        await supabase
          .from('activities')
          .update({ completed_at: nowIso, outcome: 'unsubscribed' })
          .eq('id', act.id)
        continue
      }

      if (customersWithReplies.has(act.customer_id)) {
        await supabase
          .from('activities')
          .update({ completed_at: nowIso, outcome: 'cancelled' })
          .eq('customer_sequence_id', act.customer_sequence_id)
          .is('completed_at', null)
          .in('type', ['email_followup', 'sms_followup', 'email', 'sms'])
        await supabase
          .from('customer_sequences')
          .update({ status: 'cancelled', completed_at: nowIso })
          .eq('id', act.customer_sequence_id)
        continue
      }

      let parsed: { to?: string; subject?: string; body?: string; customer_name?: string } = {}
      try { parsed = JSON.parse(act.body ?? '') } catch { continue }
      if (!parsed.to || !parsed.subject || !parsed.body) continue

      const result = await sendSeqEmail({
        orgId:         enrollment.org_id,
        customerId:    act.customer_id,
        customerEmail: parsed.to,
        customerName:  parsed.customer_name ?? '',
        subject:       parsed.subject,
        body:          parsed.body,
        activityId:    act.id,
        sequenceDay:   0,
      })

      if (result.ok) {
        fullAutoFired++
      } else if (result.error === 'no_account') {
        await supabase
          .from('activities')
          .update({ completed_at: nowIso, outcome: 'cancelled' })
          .eq('id', act.id)
      }

      // Check if this enrollment is now complete (1 query per sent email, acceptable)
      const { count: remaining } = await supabase
        .from('activities')
        .select('id', { count: 'exact', head: true })
        .eq('customer_sequence_id', act.customer_sequence_id)
        .is('completed_at', null)
        .in('type', ['email_followup', 'sms_followup', 'email', 'sms'])

      if ((remaining ?? 0) === 0) {
        await supabase
          .from('customer_sequences')
          .update({ status: 'completed', completed_at: nowIso })
          .eq('id', act.customer_sequence_id)
      }
    }
  } catch (e) {
    console.error('[check-tasks] Job 12 full_auto sequence error:', e)
  }

  return { fullAutoFired }
}
