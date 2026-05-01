import { createServiceClient } from '@/lib/supabase/service'
import { refreshVehicleSignalsForOrg } from '@/lib/intelligence/vehicleSignals'
import { buildCommandCenterPayload } from '@/lib/intelligence/commandCenter'
import { batchRescoreStaleForOrg } from '@/lib/leads/conversationScore'
import { recomputeOrgLeadIntentWeights } from '@/lib/leads/dealLearning'
import { computePayload } from '@/lib/intelligence/metrics'
import { fetchMarketSignals } from '@/lib/intelligence/rss'

/**
 * Nightly job per org: vehicle demand signals, optional stale intent refresh,
 * command center cache, and (Mondays) lead-intent weight recompute.
 * Briefing generation is expensive — optional via generateBriefings flag.
 */
export async function runDailyIntelligenceJob(options: {
  generateBriefings?: boolean
} = {}): Promise<{ orgs: number; errors: string[] }> {
  const supabase = createServiceClient()
  const errors: string[] = []
  const { generateBriefings = false } = options

  const { data: orgs, error: orgErr } = await supabase
    .from('organizations')
    .select('id, name, subscription_status')
    .or(
      'subscription_status.is.null,subscription_status.eq.active,subscription_status.eq.trialing,subscription_status.eq.past_due',
    )

  if (orgErr) {
    errors.push(orgErr.message)
    return { orgs: 0, errors }
  }

  const isMondayUtc = new Date().getUTCDay() === 1

  for (const org of orgs ?? []) {
    const orgId = org.id as string
    const dealerName = (org.name as string) ?? 'Dealership'

    try {
      await refreshVehicleSignalsForOrg(supabase, orgId)
    } catch (e) {
      errors.push(`vehicleSignals ${orgId}: ${e}`)
    }

    try {
      await batchRescoreStaleForOrg(orgId, 20)
    } catch (e) {
      errors.push(`batchScore ${orgId}: ${e}`)
    }

    try {
      const cc = await buildCommandCenterPayload(supabase, orgId)
      await supabase
        .from('org_settings')
        .update({ command_center_cache: cc as unknown as Record<string, unknown> })
        .eq('org_id', orgId)
    } catch (e) {
      errors.push(`commandCenter ${orgId}: ${e}`)
    }

    if (isMondayUtc) {
      try {
        await recomputeOrgLeadIntentWeights(supabase, orgId)
      } catch (e) {
        errors.push(`learning ${orgId}: ${e}`)
      }
    }

    if (generateBriefings && process.env.GROQ_API_KEY) {
      try {
        const forDate = new Date().toISOString().slice(0, 10)
        const signals = await fetchMarketSignals(4).catch(() => [])
        const payload = await computePayload(supabase, orgId, dealerName, forDate, signals)
        const { generateBriefing } = await import('@/lib/intelligence/claude')
        const result = await generateBriefing(payload)
        await supabase
          .from('briefings')
          .delete()
          .eq('org_id', orgId)
          .eq('for_date', forDate)
          .eq('report_type', 'daily')
        await supabase.from('briefings').insert({
          org_id: orgId,
          for_date: forDate,
          report_type: 'daily',
          payload_json: payload as unknown as Record<string, unknown>,
          report_json: result.report_json as unknown as Record<string, unknown>,
          tokens_used: result.tokens_used,
          generated_at: new Date().toISOString(),
        })
      } catch (e) {
        errors.push(`briefing ${orgId}: ${e}`)
      }
    }
  }

  return { orgs: orgs?.length ?? 0, errors }
}
