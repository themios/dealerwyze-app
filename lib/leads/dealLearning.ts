import type { SupabaseClient } from '@supabase/supabase-js'

export interface RecordDealIntentArgs {
  orgId: string
  customerId: string | null
  vehicleId: string | null
  isBuyer: boolean
}

/**
 * Snapshot customer intent at sale time for org-level learning (Phase F).
 */
export async function recordDealIntentOutcome(
  supabase: SupabaseClient,
  args: RecordDealIntentArgs,
): Promise<void> {
  if (!args.customerId) return

  const { data: c } = await supabase
    .from('customers')
    .select('lead_intent_tier, lead_intent_score, lead_intent_flags, lead_source')
    .eq('id', args.customerId)
    .eq('user_id', args.orgId)
    .maybeSingle()

  if (!c) return

  await supabase.from('deal_intent_outcomes').insert({
    org_id: args.orgId,
    customer_id: args.customerId,
    vehicle_id: args.vehicleId,
    is_buyer: args.isBuyer,
    lead_intent_tier: c.lead_intent_tier ?? null,
    lead_intent_score: c.lead_intent_score ?? null,
    lead_intent_flags: c.lead_intent_flags ?? [],
    lead_source: c.lead_source ?? null,
  })
}

export interface LeadIntentWeights {
  hotBoost: number
  warmBoost: number
  computed_at: string
}

/**
 * Recompute simple tier lift multipliers from last 90 days of deal outcomes.
 */
export async function recomputeOrgLeadIntentWeights(
  supabase: SupabaseClient,
  orgId: string,
): Promise<LeadIntentWeights | null> {
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString()
  const { data: rows } = await supabase
    .from('deal_intent_outcomes')
    .select('lead_intent_tier, is_buyer')
    .eq('org_id', orgId)
    .gte('sold_at', since)

  if (!rows?.length) return null

  const hot = rows.filter(r => r.lead_intent_tier === 'hot')
  const warm = rows.filter(r => r.lead_intent_tier === 'warm')
  const hotRate = hot.length ? hot.filter(r => r.is_buyer).length / hot.length : 0.2
  const warmRate = warm.length ? warm.filter(r => r.is_buyer).length / warm.length : 0.12

  const hotBoost = Math.min(1.15, Math.max(0.95, 1 + (hotRate - 0.2) * 0.4))
  const warmBoost = Math.min(1.12, Math.max(0.95, 1 + (warmRate - 0.12) * 0.35))

  const weights: LeadIntentWeights = {
    hotBoost,
    warmBoost,
    computed_at: new Date().toISOString(),
  }

  await supabase
    .from('org_settings')
    .update({ lead_intent_weights: weights as unknown as Record<string, unknown> })
    .eq('org_id', orgId)

  return weights
}
