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

    if (!sequenceActivities || sequenceActivities.length === 0) return { sequenceSent }

    // Gate: skip activities for free-tier orgs (sequences are a paid feature)
    const orgIds = [...new Set(sequenceActivities.map(a => a.user_id))]
    const { data: orgRows } = await supabase
      .from('organizations')
      .select('id, plan')
      .in('id', orgIds)
    const freeOrgIds = new Set((orgRows ?? []).filter(o => o.plan === 'free').map(o => o.id))
    const eligible = sequenceActivities.filter(a => !freeOrgIds.has(a.user_id))
    if (eligible.length === 0) return { sequenceSent }

    // Batch 1: all enrollments (replaces 1 query per activity)
    const enrollmentIds = [...new Set(eligible.map(a => a.customer_sequence_id).filter(Boolean))] as string[]
    const { data: enrollments } = await supabase
      .from('customer_sequences')
      .select('id, enrolled_at')
      .in('id', enrollmentIds)
    const enrollmentMap = new Map((enrollments ?? []).map(e => [e.id, e.enrolled_at as string]))

    // Batch 2: all inbound replies for the affected customers (replaces 1 query per activity)
    const customerIds = [...new Set(eligible.map(a => a.customer_id))]
    const { data: allReplies } = await supabase
      .from('activities')
      .select('customer_id, created_at')
      .in('customer_id', customerIds)
      .eq('direction', 'inbound')
      .in('type', ['email', 'sms'])
    // Map: customer_id -> earliest inbound reply timestamp
    const firstReplyAt = new Map<string, string>()
    for (const r of allReplies ?? []) {
      const existing = firstReplyAt.get(r.customer_id)
      if (!existing || r.created_at < existing) firstReplyAt.set(r.customer_id, r.created_at as string)
    }

    // Batch 3: customer names (only needed for stopSequenceOnReply, fetch all upfront)
    const { data: customers } = await supabase
      .from('customers')
      .select('id, name, user_id')
      .in('id', customerIds)
    const customerMap = new Map((customers ?? []).map(c => [c.id, c as { id: string; name: string; user_id: string }]))

    const { sendSequenceEmail } = await import('@/lib/email/sendSequenceEmail')

    for (const act of eligible) {
      const enrolledAt = enrollmentMap.get(act.customer_sequence_id) ?? '1970-01-01T00:00:00Z'
      const replyAt    = firstReplyAt.get(act.customer_id)

      if (replyAt && replyAt >= enrolledAt) {
        const cData = customerMap.get(act.customer_id)
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
