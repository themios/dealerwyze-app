import type { SupabaseClient } from '@supabase/supabase-js'

export interface CommandCenterTopCall {
  customer_id: string
  name: string
  phone: string | null
  reason: string
  intent_tier: string | null
}

export interface CommandCenterVehicle {
  vehicle_id: string
  label: string
  demand_signal: string | null
  lead_count_30d: number
}

export interface CommandCenterBuyingSource {
  source: string
  buyer_count: number
}

export interface CommandCenterPayload {
  generated_at: string
  top_calls: CommandCenterTopCall[]
  vehicles_to_watch: CommandCenterVehicle[]
  at_risk_count: number
  at_risk_pending_leads_48h: number
  response_time_org_avg_minutes: number | null
  response_time_benchmark_minutes: number
  /** Last 90 days: lead sources among recorded buyer outcomes (Phase F). */
  top_buying_sources: CommandCenterBuyingSource[]
}

/**
 * Deterministic “command center” snapshot for Dealer Brief (no LLM).
 */
export async function buildCommandCenterPayload(
  supabase: SupabaseClient,
  orgId: string,
): Promise<CommandCenterPayload> {
  const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString()
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86_400_000).toISOString()

  const { count: pendingStale } = await supabase
    .from('activities')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', orgId)
    .eq('type', 'email')
    .eq('direction', 'inbound')
    .eq('outcome', 'pending')
    .is('addressed_at', null)
    .lt('created_at', fortyEightHoursAgo)

  const { data: topCustomers } = await supabase
    .from('customers')
    .select('id, name, primary_phone, lead_intent_tier, lead_intent_score, lead_intent_summary, repeat_lead, last_inbound_at')
    .eq('user_id', orgId)
    .is('merged_at', null)
    .order('lead_intent_score', { ascending: false })
    .limit(15)

  const top_calls: CommandCenterTopCall[] = (topCustomers ?? [])
    .filter(c => (c.lead_intent_score as number) >= 50 || c.repeat_lead)
    .slice(0, 5)
    .map(c => ({
      customer_id: c.id as string,
      name: (c.name as string) ?? 'Customer',
      phone: (c.primary_phone as string) ?? null,
      reason: (c.lead_intent_summary as string) ||
        (c.repeat_lead ? 'Repeat lead — high priority' : 'High intent score'),
      intent_tier: (c.lead_intent_tier as string) ?? null,
    }))

  const { data: watchVehicles } = await supabase
    .from('vehicles')
    .select('id, year, make, model, demand_signal, lead_count_30d')
    .eq('user_id', orgId)
    .in('status', ['available', 'pending'])
    .not('demand_signal', 'is', null)
    .order('lead_count_30d', { ascending: false })
    .limit(8)

  const vehicles_to_watch: CommandCenterVehicle[] = (watchVehicles ?? []).map(v => ({
    vehicle_id: v.id as string,
    label: `${v.year} ${v.make} ${v.model}`,
    demand_signal: v.demand_signal as string | null,
    lead_count_30d: (v.lead_count_30d as number) ?? 0,
  }))

  const { data: respCustomers } = await supabase
    .from('customers')
    .select('response_time_seconds')
    .eq('user_id', orgId)
    .not('response_time_seconds', 'is', null)
    .gte('created_at', sevenDaysAgo)
    .limit(400)

  const { data: buyerOutcomes } = await supabase
    .from('deal_intent_outcomes')
    .select('lead_source')
    .eq('org_id', orgId)
    .eq('is_buyer', true)
    .gte('sold_at', ninetyDaysAgo)

  const sourceCounts = new Map<string, number>()
  for (const row of buyerOutcomes ?? []) {
    const s = (row.lead_source as string)?.trim() || 'Unknown'
    sourceCounts.set(s, (sourceCounts.get(s) ?? 0) + 1)
  }
  const top_buying_sources: CommandCenterBuyingSource[] = [...sourceCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([source, buyer_count]) => ({ source, buyer_count }))

  let response_time_org_avg_minutes: number | null = null
  if (respCustomers && respCustomers.length > 0) {
    const secs = respCustomers
      .map(c => c.response_time_seconds as number)
      .filter(s => s >= 0 && s < 7 * 24 * 3600)
    if (secs.length > 0) {
      response_time_org_avg_minutes =
        Math.round((secs.reduce((a, b) => a + b, 0) / secs.length / 60) * 10) / 10
    }
  }

  return {
    generated_at: new Date().toISOString(),
    top_calls,
    vehicles_to_watch: vehicles_to_watch.slice(0, 5),
    at_risk_count: (pendingStale ?? 0) + (topCustomers ?? []).filter(c =>
      (c.lead_intent_tier === 'hot' || c.lead_intent_tier === 'warm') &&
      !c.last_inbound_at).length,
    at_risk_pending_leads_48h: pendingStale ?? 0,
    response_time_org_avg_minutes,
    response_time_benchmark_minutes: 5,
    top_buying_sources,
  }
}
