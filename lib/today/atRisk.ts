import type { SupabaseClient } from '@supabase/supabase-js'

export interface AtRiskLeadItem {
  activity_id: string
  customer_id: string
  customer_name: string
  created_at: string
  reason: string
}

/**
 * Pending inbound email leads not touched in 48+ hours.
 */
export async function fetchAtRiskLeads(
  supabase: SupabaseClient,
  orgId: string,
  limit = 8,
): Promise<AtRiskLeadItem[]> {
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()

  const { data: rows } = await supabase
    .from('activities')
    .select('id, customer_id, created_at, customer:customers(name, archived)')
    .eq('user_id', orgId)
    .eq('type', 'email')
    .eq('direction', 'inbound')
    .eq('outcome', 'pending')
    .is('addressed_at', null)
    .is('completed_at', null)
    .not('customer_id', 'is', null)
    .lt('created_at', cutoff)
    .order('created_at', { ascending: true })
    .limit(limit)

  return (rows ?? [])
    .filter(r => {
      const cust = r.customer as { archived?: boolean | null } | null
      return !cust?.archived
    })
    .map(r => {
    const cust = r.customer as { name?: string } | null
    return {
      activity_id: r.id as string,
      customer_id: r.customer_id as string,
      customer_name: cust?.name ?? 'Customer',
      created_at: r.created_at as string,
      reason: 'No response in 48+ hours',
    }
  })
}
