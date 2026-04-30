/** Alert once per lead if voice lead > 5 min or email lead > 10 min without first response. */

import { sendLeadNotification } from '@/lib/push/send'
import type { createServiceClient } from '@/lib/supabase/service'

const VOICE_LIMIT_MS  = 5  * 60 * 1000
const EMAIL_LIMIT_MS  = 10 * 60 * 1000

export async function runResponseTimeAlerts(
  supabase: ReturnType<typeof createServiceClient>,
): Promise<{ responseAlerts: number }> {
  try {
  let responseAlerts = 0

  const nowMs = Date.now()

  const { data: unresponded } = await supabase
    .from('customers')
    .select('id, user_id, name, lead_source, created_at')
    .is('first_response_at', null)
    .not('thread_state', 'in', '("sold","lost","dormant")')
    .not('lead_source', 'is', null)
    .limit(200)

  if ((unresponded?.length ?? 0) >= 200) {
    console.warn('[responseTimeAlerts] hit 200 row limit — consider cursor pagination for scale')
  }

  for (const c of unresponded ?? []) {
    const ageMs   = nowMs - new Date(c.created_at).getTime()
    const src     = (c.lead_source ?? '').toLowerCase()
    const isVoice = src.includes('voice') || src.includes('call')
    const limitMs = isVoice ? VOICE_LIMIT_MS : EMAIL_LIMIT_MS

    if (ageMs < limitMs) continue

    const { data: existingAlert } = await supabase
      .from('tasks')
      .select('id')
      .eq('linked_customer_id', c.id)
      .eq('task_type', 'response_alert')
      .maybeSingle()

    if (existingAlert) continue

    const mins = Math.round(ageMs / 60000)
    await sendLeadNotification({
      title: `No response: ${c.name}`,
      body:  `${isVoice ? 'Voice' : 'Email'} lead — ${mins}m without first contact`,
      url:   `/customers/${c.id}`,
    }, c.user_id)

    await supabase.from('tasks').insert({
      user_id:            c.user_id,
      linked_customer_id: c.id,
      task_type:          'response_alert',
      title:              `Unresponded ${isVoice ? 'voice' : 'email'} lead: ${c.name}`,
      status:             'open',
      priority:           isVoice ? 'must' : 'high',
      auto_generated:     true,
      source_event:       'response_alert',
    })

    responseAlerts++
  }

  return { responseAlerts }
  } catch (err) {
    console.error('[responseTimeAlerts] unhandled error:', err)
    throw err
  }
}
