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

    for (const act of dueActivities ?? []) {
      if (!act.customer_sequence_id) continue

      const { data: enrollment } = await supabase
        .from('customer_sequences')
        .select('id, status, org_id, sequence:sequences(auto_mode)')
        .eq('id', act.customer_sequence_id)
        .maybeSingle()

      if (!enrollment || enrollment.status !== 'active') continue
      const seqData = Array.isArray(enrollment.sequence) ? enrollment.sequence[0] : enrollment.sequence
      if ((seqData as { auto_mode?: string } | null)?.auto_mode !== 'full_auto') continue

      const { data: cust } = await supabase
        .from('customers')
        .select('unsubscribe_email, email')
        .eq('id', act.customer_id)
        .maybeSingle()

      if (cust?.unsubscribe_email) {
        await supabase
          .from('activities')
          .update({ completed_at: nowIso, outcome: 'unsubscribed' })
          .eq('id', act.id)
        continue
      }

      const { data: reply } = await supabase
        .from('activities')
        .select('id')
        .eq('customer_id', act.customer_id)
        .eq('direction', 'inbound')
        .in('type', ['email', 'sms'])
        .limit(1)
        .maybeSingle()

      if (reply) {
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
        orgId: enrollment.org_id,
        customerId: act.customer_id,
        customerEmail: parsed.to,
        customerName: parsed.customer_name ?? '',
        subject: parsed.subject,
        body: parsed.body,
        activityId: act.id,
        sequenceDay: 0,
      })

      if (result.ok) {
        fullAutoFired++
      } else if (result.error === 'no_account') {
        await supabase
          .from('activities')
          .update({ completed_at: nowIso, outcome: 'cancelled' })
          .eq('id', act.id)
      }

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
