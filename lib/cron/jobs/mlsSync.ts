/**
 * lib/cron/jobs/mlsSync.ts
 *
 * Daily MLS sync cron job for RealtyWyze.
 * Prefers Repliers when REPLIERS_API_KEY is set; falls back to Bridge per-agent credentials.
 */

import { getListings, type BridgeListing } from '@/lib/mls/bridgeClient'
import type { NormalizedMlsListing } from '@/lib/mls/normalizedListing'
import { getRepliersListings } from '@/lib/mls/repliersClient'
import { upsertMlsListing } from '@/lib/mls/upsertMlsListing'
import { writeAuditLog } from '@/lib/audit/log'

interface AgentConfig {
  id: string
  org_id: string
  mls_board_id?: string | null
  bridge_api_key?: string | null
  bridge_agent_id?: string | null
}

function bridgeToNormalized(listing: BridgeListing): NormalizedMlsListing {
  return { ...listing, year_built: null }
}

export async function runMlsSync(supabase: any): Promise<{
  agents_synced: number
  total_listings_fetched: number
  total_listings_created: number
  total_listings_updated: number
  errors: string[]
}> {
  const result = {
    agents_synced: 0,
    total_listings_fetched: 0,
    total_listings_created: 0,
    total_listings_updated: 0,
    errors: [] as string[],
  }

  const useRepliers = Boolean(process.env.REPLIERS_API_KEY)

  try {
    const { data: agents, error: agentsError } = await supabase
      .from('profiles')
      .select(`
        id,
        org_id,
        mls_board_id,
        bridge_api_key,
        bridge_agent_id,
        organizations!profiles_org_id_fkey!inner(vertical)
      `)
      .eq('organizations.vertical', 'real_estate')
      .not('org_id', 'is', null)

    if (agentsError) {
      const msg = `Failed to fetch agents: ${agentsError.message}`
      result.errors.push(msg)
      console.error(`[mls-sync] ${msg}`)
      return result
    }

    const reAgents = (agents ?? []).filter((a: AgentConfig) => {
      if (useRepliers) return true
      return a.mls_board_id && a.bridge_api_key
    }) as AgentConfig[]

    if (reAgents.length === 0) {
      console.log('[mls-sync] No RE agents configured for MLS sync')
      return result
    }

    console.log(`[mls-sync] Starting sync for ${reAgents.length} agents (${useRepliers ? 'repliers' : 'bridge'})`)

    for (const agent of reAgents) {
      try {
        const orgId = agent.org_id
        const boardId = useRepliers ? 'repliers' : agent.mls_board_id!
        let listings: NormalizedMlsListing[] = []

        try {
          if (useRepliers) {
            listings = await getRepliersListings({ limit: 25 })
          } else {
            const bridgeListings = await getListings(
              agent.bridge_agent_id || agent.id,
              agent.mls_board_id!,
              agent.bridge_api_key!
            )
            listings = bridgeListings.map(bridgeToNormalized)
          }
        } catch (fetchErr) {
          const msg = fetchErr instanceof Error ? fetchErr.message : 'Unknown error'
          result.errors.push(`${useRepliers ? 'Repliers' : 'Bridge'} API error for agent ${agent.id}: ${msg}`)
          await supabase.from('mls_sync_log').insert({
            org_id: orgId,
            agent_id: agent.id,
            mls_board_id: boardId,
            listings_synced: 0,
            listings_created: 0,
            listings_updated: 0,
            status: 'failed',
            errors: msg,
          })
          continue
        }

        if (listings.length === 0) {
          await supabase.from('mls_sync_log').insert({
            org_id: orgId,
            agent_id: agent.id,
            mls_board_id: boardId,
            listings_synced: 0,
            listings_created: 0,
            listings_updated: 0,
            status: 'success',
          })
          continue
        }

        let agentListingsCreated = 0
        let agentListingsUpdated = 0
        const agentErrors: string[] = []

        for (const listing of listings) {
          try {
            const upsertResult = await upsertMlsListing({
              supabase,
              listing,
              orgId,
              agentId: agent.id,
              mlsSource: useRepliers ? 'repliers' : 'bridge',
            })
            if (upsertResult.action === 'created') agentListingsCreated++
            else agentListingsUpdated++
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Unknown error'
            agentErrors.push(`${listing.mls_number}: ${msg}`)
          }
        }

        result.agents_synced++
        result.total_listings_fetched += listings.length
        result.total_listings_created += agentListingsCreated
        result.total_listings_updated += agentListingsUpdated

        await supabase.from('mls_sync_log').insert({
          org_id: orgId,
          agent_id: agent.id,
          mls_board_id: boardId,
          listings_synced: listings.length,
          listings_created: agentListingsCreated,
          listings_updated: agentListingsUpdated,
          status: agentErrors.length === 0 ? 'success' : 'partial',
          errors: agentErrors.length > 0 ? agentErrors.join('; ') : null,
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        result.errors.push(`Error syncing agent ${agent.id}: ${msg}`)
        console.error(`[mls-sync] Agent ${agent.id} error:`, err)
      }
    }

    try {
      await writeAuditLog({
        orgId: null,
        action: 'mls_sync_job',
        actorType: 'user',
        actorId: null,
        entityType: 'listing_batch',
        metadata: {
          source: useRepliers ? 'repliers' : 'bridge',
          agents_synced: result.agents_synced,
          total_listings: result.total_listings_fetched,
          created: result.total_listings_created,
          updated: result.total_listings_updated,
          error_count: result.errors.length,
        },
      })
    } catch (auditErr) {
      console.error('[mls-sync] Audit log error:', auditErr)
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    result.errors.push(`Unexpected error in MLS sync: ${msg}`)
    console.error('[mls-sync] Unexpected error:', err)
  }

  return result
}
