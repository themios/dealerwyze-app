/** Auto-send pending email sequence activities that are due, stopping sequences when customers have replied. */

import { stopSequenceOnReply } from '@/lib/sequences/stopSequenceOnReply'
import type { createServiceClient } from '@/lib/supabase/service'

export async function runSequenceDelivery(
  supabase: ReturnType<typeof createServiceClient>,
): Promise<{ sequenceSent: number }> {
  let sequenceSent = 0

  try {
    const nowIso = new Date().toISOString()

    const { data: sequenceActivities } = await supabase
      .from('activities')
      .select('id, user_id, customer_id, body, sequence_day, customer_sequence_id')
      .in('type', ['email', 'email_followup'])
      .eq('direction', 'outbound')
      .is('completed_at', null)
      .not('customer_sequence_id', 'is', null)
      .lte('due_at', nowIso)
      .limit(100)

    const { sendSequenceEmail } = await import('@/lib/email/sendSequenceEmail')

    for (const act of sequenceActivities ?? []) {
      const { data: enrollment } = await supabase
        .from('customer_sequences')
        .select('enrolled_at')
        .eq('id', act.customer_sequence_id)
        .maybeSingle()
      const enrolledAt = enrollment?.enrolled_at ?? '1970-01-01T00:00:00Z'

      const { data: replies } = await supabase
        .from('activities')
        .select('id')
        .eq('customer_id', act.customer_id)
        .eq('direction', 'inbound')
        .in('type', ['email', 'sms'])
        .gte('created_at', enrolledAt)
        .limit(1)

      if (replies && replies.length > 0) {
        const { data: cData } = await supabase
          .from('customers')
          .select('name, user_id')
          .eq('id', act.customer_id)
          .maybeSingle()
        await stopSequenceOnReply({
          supabase,
          orgId:        act.user_id,
          customerId:   act.customer_id,
          customerName: cData?.name ?? 'Customer',
        })
        continue
      }

      let parsed: { to?: string; subject?: string; body?: string; step_label?: string; customer_name?: string } = {}
      try { parsed = JSON.parse(act.body ?? '') } catch { continue }
      if (!parsed.to || !parsed.subject || !parsed.body) continue

      const result = await sendSequenceEmail({
        orgId:         act.user_id,
        customerId:    act.customer_id,
        customerEmail: parsed.to,
        customerName:  parsed.customer_name ?? '',
        subject:       parsed.subject,
        body:          parsed.body,
        activityId:    act.id,
        sequenceDay:   act.sequence_day ?? 0,
        stepLabel:     parsed.step_label,
      })

      if (result.ok) {
        sequenceSent++
      } else {
        await supabase
          .from('activities')
          .update({ completed_at: nowIso, outcome: result.error === 'no_account' ? 'cancelled' : 'failed' })
          .eq('id', act.id)
      }
    }
  } catch (e) {
    console.error('[check-tasks] Job 11 sequence send error:', e)
  }

  return { sequenceSent }
}
