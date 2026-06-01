/**
 * POST /api/integrations/mls/sync
 *
 * Sync listings from Bridge MLS API to vehicles table.
 * Multi-tenant aware, uses idempotency to prevent duplicate processing.
 *
 * Called by:
 * - Agent onboarding flow (manual sync request)
 * - Dashboard "Sync now" button
 * - Cron job indirectly (cron calls upsert logic directly)
 *
 * Request body:
 * - agentId: string (Bridge agent ID, optional)
 * - boardId: string (MLS board ID, optional)
 * - apiKey: string (Bridge API key, optional)
 *
 * If not provided in body, uses agent's profile settings.
 *
 * Response:
 * {
 *   success: boolean,
 *   listings_synced: number,
 *   listings_created: number,
 *   listings_updated: number,
 *   errors: string[]
 * }
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import { getListings, BridgeListing } from '@/lib/mls/bridgeClient'
import { writeAuditLog } from '@/lib/audit/log'

const SyncRequestSchema = z.object({
  agentId: z.string().min(1).optional(),
  boardId: z.string().min(1).optional(),
  apiKey: z.string().min(1).optional(),
})

interface PriceHistoryEntry {
  price: number
  date: string
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

/**
 * Generate idempotency key for webhook deduplication
 * Prevents re-processing the same sync multiple times
 */
function generateIdempotencyKey(agentId: string, boardId: string, syncTimestamp: string): string {
  return `mls-sync:${agentId}:${boardId}:${syncTimestamp}`
}

/**
 * Upsert a single listing with idempotency and conflict handling
 * Uses ON CONFLICT to handle concurrent syncs safely
 * Preserves user-set fields (showing_count, notes_seller, notes_agent)
 */
async function upsertListing(
  supabase: any,
  listing: BridgeListing,
  orgId: string
): Promise<{ action: 'created' | 'updated'; vehicleId: string }> {
  // Fetch existing record if present (for price history + field preservation)
  const { data: existing } = await supabase
    .from('vehicles')
    .select('id, price, price_history, showing_count, notes_seller, notes_agent')
    .eq('mls_number', listing.mls_number)
    .eq('org_id', orgId)
    .maybeSingle()

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
  const payload: Record<string, any> = {
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

    // Photos (URLs only; async download is TODO)
    photos: listing.photos.map(p => ({ url: p.url, caption: p.caption })),
  }

  // Preserve user-set fields if this is an update
  if (existing) {
    if (existing.showing_count !== null && existing.showing_count !== undefined) {
      payload.showing_count = existing.showing_count
    }
    if (existing.notes_seller) {
      payload.notes_seller = existing.notes_seller
    }
    if (existing.notes_agent) {
      payload.notes_agent = existing.notes_agent
    }
  }

  // Upsert with ON CONFLICT on (mls_number, org_id) unique index
  const { data, error } = await supabase
    .from('vehicles')
    .upsert(payload, {
      onConflict: 'mls_number,org_id',
      ignoreDuplicates: false,
    })
    .select('id')
    .single()

  if (error) {
    throw new Error(`Upsert failed: ${error.message}`)
  }

  if (!data?.id) {
    throw new Error('Upsert returned no ID')
  }

  // Queue async photo download (no-op for now)
  if (listing.photos.length > 0) {
    console.log(`[mls-sync] Queued ${listing.photos.length} photos for ${listing.mls_number}`)
    // TODO: Implement async photo downloader (Bull queue, Redis, etc.)
  }

  return {
    action: existing ? 'updated' : 'created',
    vehicleId: data.id,
  }
}

/**
 * GET /api/integrations/mls/sync?status=pending|success|failed&limit=50
 * Fetch sync logs for the authenticated agent
 */
export async function GET(req: NextRequest) {
  try {
    const profile = await requireProfile()
    const supabase = await createClient()

    const status = req.nextUrl.searchParams.get('status')
    const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') || '50'), 500)

    let query = supabase
      .from('mls_sync_log')
      .select('id, synced_at, listings_synced, listings_created, listings_updated, status, errors, mls_board_id')
      .eq('agent_id', profile.id)
      .order('synced_at', { ascending: false })
      .limit(limit)

    if (status) {
      query = query.eq('status', status)
    }

    const { data: logs, error } = await query

    if (error) {
      return NextResponse.json(
        { error: `Failed to fetch sync logs: ${error.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({
      logs: logs || [],
      count: logs?.length || 0,
    })
  } catch (err) {
    console.error('[mls/sync GET] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const profile = await requireProfile()
    const supabase = await createClient()

    // Verify agent is on a RE org
    const { data: org } = await supabase
      .from('organizations')
      .select('vertical')
      .eq('id', profile.org_id)
      .single()

    if (org?.vertical !== 'real_estate') {
      return NextResponse.json(
        { error: 'MLS sync only available for real estate agents' },
        { status: 403 }
      )
    }

    // Parse request body
    const rawBody = await req.json().catch(() => ({}))
    const parsed = SyncRequestSchema.safeParse(rawBody)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    let { agentId, boardId, apiKey } = parsed.data

    // If not provided in request, read from agent's profile
    if (!boardId || !apiKey) {
      const { data: agentProfile } = await supabase
        .from('profiles')
        .select('bridge_agent_id, mls_board_id, bridge_api_key')
        .eq('id', profile.id)
        .single()

      if (!agentProfile?.mls_board_id || !agentProfile?.bridge_api_key) {
        return NextResponse.json(
          { error: 'MLS credentials not configured. Set up MLS in your profile settings.' },
          { status: 400 }
        )
      }

      agentId = agentProfile.bridge_agent_id || profile.id
      boardId = agentProfile.mls_board_id
      apiKey = agentProfile.bridge_api_key
    }

    // Idempotency check: prevent duplicate syncs within same minute
    const syncTimestamp = new Date().toISOString().substring(0, 16) // YYYY-MM-DDTHH:MM
    const idempotencyKey = generateIdempotencyKey(agentId!, boardId!, syncTimestamp)

    const { data: existingSync } = await supabase
      .from('webhook_idempotency')
      .select('id, processed_at')
      .eq('key', idempotencyKey)
      .eq('provider', 'mls_bridge')
      .maybeSingle()

    if (existingSync) {
      const processedTime = new Date(existingSync.processed_at)
      const nowTime = new Date()
      const diffMs = nowTime.getTime() - processedTime.getTime()

      // Skip if already processed within last 5 minutes
      if (diffMs < 5 * 60 * 1000) {
        return NextResponse.json({
          success: true,
          listings_synced: 0,
          listings_created: 0,
          listings_updated: 0,
          errors: ['Sync already in progress, skipping'],
        })
      }
    }

    // Mark this sync in progress
    await supabase.from('webhook_idempotency').upsert({
      key: idempotencyKey,
      provider: 'mls_bridge',
      processed_at: new Date().toISOString(),
    })

    // Ensure all required params are set
    if (!agentId || !boardId || !apiKey) {
      return NextResponse.json(
        { error: 'Missing required MLS parameters: agentId, boardId, apiKey' },
        { status: 400 }
      )
    }

    // Fetch listings from Bridge API
    let listings: BridgeListing[] = []
    try {
      listings = await getListings(agentId, boardId, apiKey)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      const errors = [`Bridge API error: ${msg}`]

      // Log sync failure
      await supabase.from('mls_sync_log').insert({
        org_id: profile.org_id,
        agent_id: profile.id,
        mls_board_id: boardId,
        listings_synced: 0,
        listings_created: 0,
        listings_updated: 0,
        errors: msg,
        status: 'failed',
      })

      return NextResponse.json(
        {
          success: false,
          listings_synced: 0,
          listings_created: 0,
          listings_updated: 0,
          errors,
        },
        { status: 400 }
      )
    }

    // Process each listing
    let created = 0
    let updated = 0
    const syncErrors: string[] = []

    for (const listing of listings) {
      try {
        const result = await upsertListing(supabase, listing, profile.org_id)
        if (result.action === 'created') {
          created++
        } else {
          updated++
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        syncErrors.push(`${listing.mls_number}: ${msg}`)
      }
    }

    // Log sync result
    const status = syncErrors.length === 0 ? 'success' : 'partial'
    await supabase.from('mls_sync_log').insert({
      org_id: profile.org_id,
      agent_id: profile.id,
      mls_board_id: boardId,
      listings_synced: listings.length,
      listings_created: created,
      listings_updated: updated,
      errors: syncErrors.length > 0 ? syncErrors.join('; ') : null,
      status,
    })

    // Audit log
    await writeAuditLog({
      action: 'mls_sync_manual',
      actorType: 'user',
      actorId: profile.id,
      entityType: 'listing_batch',
      orgId: profile.org_id,
      metadata: {
        boardId: boardId,
        listingsSynced: listings.length,
        created,
        updated,
        errors: syncErrors.length,
      },
    })

    const success = syncErrors.length === 0

    return NextResponse.json(
      {
        success,
        listings_synced: listings.length,
        listings_created: created,
        listings_updated: updated,
        errors: syncErrors,
      },
      { status: success ? 200 : 207 }
    )
  } catch (err) {
    console.error('[mls/sync] unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
