/**
 * lib/cron/jobs/mlsSync.ts
 *
 * Daily MLS sync cron job for RealtyWyze
 * Runs at 6 AM UTC (before buyer matching at 7 AM)
 * Syncs MLS listings for all agents with configured MLS boards
 *
 * Flow:
 * 1. Fetch all RE org agents with MLS credentials (bridge_api_key, mls_board_id)
 * 2. For each agent: fetch listings from Bridge API
 * 3. Upsert vehicles with idempotency (mls_number + org_id)
 * 4. Preserve user-set fields (showing_count, notes)
 * 5. Append to price_history only on price change
 * 6. Log all results to mls_sync_log
 * 7. Audit log for compliance
 */

import { createServiceClient } from '@/lib/supabase/service'
import { getListings, BridgeListing } from '@/lib/mls/bridgeClient'
import { writeAuditLog } from '@/lib/audit/log'

interface AgentConfig {
  id: string
  org_id: string
  mls_board_id?: string
  bridge_api_key?: string
  bridge_agent_id?: string
}

interface PriceHistoryEntry {
  price: number
  date: string
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

  try {
    // Fetch all RE agents with MLS configuration (service role reads org context)
    const { data: agents, error: agentsError } = await supabase
      .from('profiles')
      .select(`
        id,
        org_id,
        mls_board_id,
        bridge_api_key,
        bridge_agent_id,
        organizations!inner(vertical)
      `)
      .eq('organizations.vertical', 'real_estate')
      .not('mls_board_id', 'is', null)
      .not('bridge_api_key', 'is', null)

    if (agentsError) {
      const msg = `Failed to fetch agents: ${agentsError.message}`
      result.errors.push(msg)
      console.error(`[mls-sync] ${msg}`)
      return result
    }

    if (!agents || agents.length === 0) {
      console.log('[mls-sync] No RE agents configured with MLS sync')
      return result
    }

    console.log(`[mls-sync] Starting sync for ${agents.length} agents`)

    // Process each agent's listings
    for (const agent of agents as AgentConfig[]) {
      try {
        const boardId = agent.mls_board_id
        const apiKey = agent.bridge_api_key
        const agentId = agent.bridge_agent_id || agent.id
        const orgId = agent.org_id

        if (!boardId || !apiKey) {
          console.warn(`[mls-sync] Agent ${agent.id} missing boardId or apiKey`)
          continue
        }

        console.log(`[mls-sync] Agent ${agent.id} (org ${orgId}): fetching ${boardId}`)

        // Fetch listings from Bridge API
        let listings: BridgeListing[] = []
        try {
          listings = await getListings(agentId, boardId, apiKey)
        } catch (fetchErr) {
          const msg = fetchErr instanceof Error ? fetchErr.message : 'Unknown error'
          result.errors.push(`Bridge API error for agent ${agent.id}: ${msg}`)

          // Log sync failure
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

        if (!listings || listings.length === 0) {
          console.log(`[mls-sync] Agent ${agent.id}: no listings found`)
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

        // Upsert each listing
        let agentListingsCreated = 0
        let agentListingsUpdated = 0
        const agentErrors: string[] = []

        for (const listing of listings) {
          try {
            await upsertListing(supabase, listing, orgId)
            agentListingsCreated++
          } catch (err) {
            // Check if it was an update (conflict) or insert error
            if (err instanceof Error && err.message.includes('conflict')) {
              agentListingsUpdated++
            } else {
              const msg = err instanceof Error ? err.message : 'Unknown error'
              agentErrors.push(`${listing.mls_number}: ${msg}`)
            }
          }
        }

        result.agents_synced++
        result.total_listings_fetched += listings.length
        result.total_listings_created += agentListingsCreated
        result.total_listings_updated += agentListingsUpdated

        // Log sync result for this agent
        const status = agentErrors.length === 0 ? 'success' : 'partial'
        await supabase.from('mls_sync_log').insert({
          org_id: orgId,
          agent_id: agent.id,
          mls_board_id: boardId,
          listings_synced: listings.length,
          listings_created: agentListingsCreated,
          listings_updated: agentListingsUpdated,
          status,
          errors: agentErrors.length > 0 ? agentErrors.join('; ') : null,
        })

        console.log(
          `[mls-sync] Agent ${agent.id}: ${listings.length} listings ` +
          `(${agentListingsCreated} created, ${agentListingsUpdated} updated)`
        )
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        result.errors.push(`Error syncing agent ${agent.id}: ${msg}`)
        console.error(`[mls-sync] Agent ${agent.id} error:`, err)
      }
    }

    // Audit log for compliance
    try {
      await writeAuditLog({
        orgId: null,
        action: 'mls_sync_job',
        actorType: 'user',
        actorId: null,
        entityType: 'listing_batch',
        metadata: {
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

    console.log(
      `[mls-sync] Completed: ${result.agents_synced} agents, ` +
      `${result.total_listings_fetched} listings ` +
      `(${result.total_listings_created} created, ${result.total_listings_updated} updated)`
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    result.errors.push(`Unexpected error in MLS sync: ${msg}`)
    console.error('[mls-sync] Unexpected error:', err)
  }

  return result
}

/**
 * Upsert a single listing with idempotency and conflict handling
 * Uses ON CONFLICT to handle concurrent syncs
 * Preserves user-set fields (showing_count, notes)
 */
async function upsertListing(
  supabase: any,
  listing: BridgeListing,
  orgId: string
): Promise<void> {
  // Fetch existing record if present (for price history + field preservation)
  const { data: existing } = await supabase
    .from('vehicles')
    .select('id, price, price_history, showing_count, notes_seller, notes_agent')
    .eq('mls_number', listing.mls_number)
    .eq('org_id', orgId)
    .single()

  const now = new Date().toISOString()

  // Calculate price history: only append if price changed
  let priceHistory: PriceHistoryEntry[] = []
  if (existing?.price_history) {
    priceHistory = Array.isArray(existing.price_history) ? existing.price_history : []
  }

  if (listing.price && existing?.price !== listing.price) {
    priceHistory.push({
      price: listing.price,
      date: now,
    })
  }

  // Build upsert payload
  const payload = {
    org_id: orgId,
    mls_number: listing.mls_number,
    mls_board_id: listing.listing_office || 'unknown',
    mls_synced_at: now,
    mls_source: 'bridge',
    listing_status: listing.listing_status,
    dom: calculateDOM(listing.listing_date),
    price: listing.price,
    price_history: priceHistory,

    // RE-specific vehicle mapping
    year: 0,
    make: 'RE',
    model: `${listing.address.city} Property`,
    stock_no: `MLS-${listing.mls_number}-${Date.now()}`,
    status: listing.listing_status === 'active' ? 'active' : 'inactive',

    // Address
    address_line1: listing.address.address_line1,
    city: listing.address.city,
    state: listing.address.state,
    zip: listing.address.zip,

    // Property details
    bedrooms: listing.bedrooms,
    bathrooms: listing.bathrooms,
    sqft: listing.sqft,
    lot_size: listing.lot_size,
    description: listing.description,
    property_type: listing.property_type,
    import_source: 'bridge_mls',

    // Photos (URLs only; actual download is async)
    photos: listing.photos.map(p => ({ url: p.url, caption: p.caption })),
  }

  // Preserve user-set fields
  if (existing) {
    if (existing.showing_count !== null && existing.showing_count !== undefined) {
      (payload as any).showing_count = existing.showing_count
    }
    if (existing.notes_seller) {
      (payload as any).notes_seller = existing.notes_seller
    }
    if (existing.notes_agent) {
      (payload as any).notes_agent = existing.notes_agent
    }
  }

  // ON CONFLICT: update only MLS-specific fields, preserve other data
  // This is the safe pattern for multi-tenant upserts
  const { error } = await supabase
    .from('vehicles')
    .upsert(payload, {
      onConflict: 'mls_number,org_id',
      ignoreDuplicates: false,
    })

  if (error) {
    // Mark as conflict if it's a duplicate key error
    if (error.code === '23505' || error.message.includes('conflict')) {
      const err = new Error('Conflict: listing already exists')
      ;(err as any).isConflict = true
      throw err
    }
    throw new Error(`Upsert failed: ${error.message}`)
  }

  // Queue async photo download (no-op for now)
  if (listing.photos.length > 0) {
    const photoUrls = listing.photos.map(p => p.url)
    // TODO: Queue to Redis/Bull/Durable Objects for async processing
    console.log(`[mls-sync] Queued ${photoUrls.length} photos for ${listing.mls_number}`)
  }
}

/**
 * Calculate days on market from listing date
 */
function calculateDOM(listingDateStr: string | null): number | null {
  if (!listingDateStr) return null
  try {
    const listingDate = new Date(listingDateStr)
    const now = new Date()
    const diffMs = now.getTime() - listingDate.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    return diffDays >= 0 ? diffDays : null
  } catch {
    return null
  }
}
