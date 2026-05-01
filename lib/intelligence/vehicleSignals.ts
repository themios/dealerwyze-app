import type { SupabaseClient } from '@supabase/supabase-js'

export type DemandSignal = 'high_demand' | 'needs_price_drop' | 'needs_financing_push' | 'buy_signal' | null

function daysOnLot(createdAt: string | null, purchasedAt: string | null): number {
  const base = purchasedAt || createdAt
  if (!base) return 0
  return Math.max(0, Math.floor((Date.now() - new Date(base).getTime()) / 86_400_000))
}

/**
 * Aggregate lead/appt activity per vehicle for the last 30 days and set demand_signal.
 */
export async function refreshVehicleSignalsForOrg(
  supabase: SupabaseClient,
  orgId: string,
): Promise<{ updated: number }> {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString()

  const { data: vehicles } = await supabase
    .from('vehicles')
    .select('id, user_id, year, make, model, created_at, purchased_at, status, price')
    .eq('user_id', orgId)
    .in('status', ['available', 'pending'])

  if (!vehicles?.length) return { updated: 0 }

  const { data: orgCustomers } = await supabase
    .from('customers')
    .select('id')
    .eq('user_id', orgId)

  const custIds = (orgCustomers ?? []).map(c => c.id as string)
  if (custIds.length === 0) return { updated: 0 }

  const { data: leadActs } = await supabase
    .from('activities')
    .select('vehicle_id, customer_id, type, direction')
    .in('customer_id', custIds)
    .gte('created_at', since)
    .not('vehicle_id', 'is', null)

  const leadCount = new Map<string, number>()
  const apptCount = new Map<string, number>()
  const customerIdsByVehicle = new Map<string, Set<string>>()

  for (const a of leadActs ?? []) {
    const vid = a.vehicle_id as string
    if (a.type === 'appointment' && a.direction === 'inbound') {
      apptCount.set(vid, (apptCount.get(vid) ?? 0) + 1)
    }
    if (
      (a.type === 'email' || a.type === 'sms' || a.type === 'vehicle_match' || a.type === 'web_lead') &&
      a.direction === 'inbound'
    ) {
      leadCount.set(vid, (leadCount.get(vid) ?? 0) + 1)
    }
    if (a.customer_id) {
      if (!customerIdsByVehicle.has(vid)) customerIdsByVehicle.set(vid, new Set())
      customerIdsByVehicle.get(vid)!.add(a.customer_id as string)
    }
  }

  const allCustomerIds = [...new Set([...customerIdsByVehicle.values()].flatMap(s => [...s]))]
  const intentByCustomer = new Map<string, number>()
  if (allCustomerIds.length > 0) {
    const { data: custRows } = await supabase
      .from('customers')
      .select('id, lead_intent_score')
      .in('id', allCustomerIds)
    for (const c of custRows ?? []) {
      intentByCustomer.set(c.id as string, (c.lead_intent_score as number) ?? 0)
    }
  }

  let updated = 0
  const nowIso = new Date().toISOString()

  for (const v of vehicles) {
    const vid = v.id as string
    const leads = leadCount.get(vid) ?? 0
    const appts = apptCount.get(vid) ?? 0
    const conv = leads > 0 ? appts / leads : null

    const custSet = customerIdsByVehicle.get(vid)
    let avgIntent: number | null = null
    if (custSet && custSet.size > 0) {
      const scores = [...custSet].map(id => intentByCustomer.get(id) ?? 0).filter(s => s > 0)
      avgIntent = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length / 100 : null
    }

    const dol = daysOnLot(v.created_at as string, v.purchased_at as string | null)

    let demand: DemandSignal = null
    if (leads >= 6 && (conv == null || conv >= 0.15)) {
      demand = 'high_demand'
    } else if (leads >= 3 && avgIntent != null && avgIntent >= 0.55 && (conv != null && conv < 0.08)) {
      demand = 'needs_financing_push'
    } else if (dol >= 45 && leads <= 1) {
      demand = 'needs_price_drop'
    } else if (leads >= 4) {
      demand = 'buy_signal'
    }

    await supabase
      .from('vehicles')
      .update({
        lead_count_30d: leads,
        appt_conversion_rate: conv,
        avg_intent_score: avgIntent,
        demand_signal: demand,
        demand_updated_at: nowIso,
      })
      .eq('id', vid)
      .eq('user_id', orgId)

    updated++
  }

  return { updated }
}
