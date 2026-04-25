/** Mark customers inactive for 30+ days as dormant if not already in a terminal state. */

import type { createServiceClient } from '@/lib/supabase/service'

export async function runDormantCustomers(
  supabase: ReturnType<typeof createServiceClient>,
): Promise<{ dormantMarked: number }> {
  let dormantMarked = 0

  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString()

  const { data: activeCandidates } = await supabase
    .from('customers')
    .select('id, last_inbound_at, last_outbound_at, created_at')
    .not('thread_state', 'in', '("sold","lost","dormant")')

  for (const c of activeCandidates ?? []) {
    const lastInbound  = c.last_inbound_at
    const lastOutbound = c.last_outbound_at
    const created      = c.created_at

    const lastActivity = lastInbound ?? lastOutbound ?? created

    if (lastActivity && lastActivity < thirtyDaysAgo) {
      await supabase
        .from('customers')
        .update({ thread_state: 'dormant' })
        .eq('id', c.id)
      dormantMarked++
    }
  }

  return { dormantMarked }
}
