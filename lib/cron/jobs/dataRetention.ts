/** Hard-delete data for organizations canceled 90+ days ago, keeping anonymized org row and audit logs. */

import type { createServiceClient } from '@/lib/supabase/service'

export async function runDataRetention(
  supabase: ReturnType<typeof createServiceClient>,
): Promise<{ purgedOrgs: number }> {
  let purgedOrgs = 0

  const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString()

  const { data: expiredCanceledOrgs } = await supabase
    .from('organizations')
    .select('id')
    .eq('subscription_status', 'canceled')
    .not('canceled_at', 'is', null)
    .lt('canceled_at', ninetyDaysAgo)

  for (const expOrg of expiredCanceledOrgs ?? []) {
    const oid = expOrg.id
    await supabase.from('activities').delete().eq('user_id', oid)
    await supabase.from('voice_calls').delete().eq('user_id', oid)
    await supabase.from('tasks').delete().eq('user_id', oid)
    await supabase.from('receipts').delete().eq('user_id', oid)
    await supabase.from('vehicles').delete().eq('user_id', oid)
    await supabase.from('customers').delete().eq('user_id', oid)
    await supabase.from('support_tickets').delete().eq('org_id', oid)
    await supabase.from('organizations').update({
      name: '[deleted]',
      slug: `deleted-${oid.slice(0, 8)}`,
      updated_at: new Date().toISOString(),
    }).eq('id', oid)
    purgedOrgs++
  }

  return { purgedOrgs }
}
