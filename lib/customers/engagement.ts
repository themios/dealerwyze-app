import type { SupabaseClient } from '@supabase/supabase-js'

const REPLY_SAMPLE_LIMIT = 80

/**
 * Recompute engagement fields from activities + sold vehicles.
 * Call after inbound SMS/email and periodically from cron.
 */
export async function refreshCustomerEngagement(
  supabase: SupabaseClient,
  customerId: string,
): Promise<void> {
  const { data: customer, error: cErr } = await supabase
    .from('customers')
    .select('id, user_id')
    .eq('id', customerId)
    .maybeSingle()

  if (cErr || !customer) return

  const orgId = customer.user_id as string

  const { count: inboundCount } = await supabase
    .from('activities')
    .select('*', { count: 'exact', head: true })
    .eq('customer_id', customerId)
    .eq('direction', 'inbound')
    .in('type', ['sms', 'email', 'call'])

  const { data: lastInbound } = await supabase
    .from('activities')
    .select('created_at')
    .eq('customer_id', customerId)
    .eq('direction', 'inbound')
    .in('type', ['sms', 'email', 'call'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: acts } = await supabase
    .from('activities')
    .select('id, type, direction, created_at')
    .eq('customer_id', customerId)
    .in('type', ['sms', 'email', 'call'])
    .order('created_at', { ascending: true })
    .limit(REPLY_SAMPLE_LIMIT)

  const deltas: number[] = []
  let lastOutboundAt: number | null = null
  for (const row of acts ?? []) {
    const t = new Date(row.created_at as string).getTime()
    if (row.direction === 'outbound') {
      lastOutboundAt = t
    } else if (row.direction === 'inbound' && lastOutboundAt != null) {
      const mins = (t - lastOutboundAt) / 60_000
      if (mins >= 0 && mins < 7 * 24 * 60) deltas.push(mins)
      lastOutboundAt = null
    }
  }

  const avgReply =
    deltas.length > 0 ? Math.round((deltas.reduce((a, b) => a + b, 0) / deltas.length) * 10) / 10 : null

  const { count: soldCount } = await supabase
    .from('vehicles')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', orgId)
    .eq('sold_to_customer_id', customerId)

  await supabase
    .from('customers')
    .update({
      inbound_message_count: inboundCount ?? 0,
      last_inbound_at: lastInbound?.created_at ?? null,
      avg_reply_speed_minutes: avgReply,
      prior_purchase_count: soldCount ?? 0,
    })
    .eq('id', customerId)
}
