/**
 * POST /api/integrations/mls/sync
 *
 * Sync listings from Bridge MLS API to vehicles table.
 * Called by:
 * - Cron job (daily, 6 AM) for all agents
 * - Directly by agent onboarding flow (first sync)
 *
 * Body:
 * - agentId: string (Bridge agent ID or email)
 * - boardId: string (MLS board ID)
 * - apiKey: string (Bridge API key, encrypted in request)
 *
 * OR uses agent's profile settings (mls_board_id, bridge_api_key)
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import { getListings, SyncResult, BridgeListing } from '@/lib/mls/bridgeClient'

const SyncRequestSchema = z.object({
  agentId: z.string().min(1).optional(),
  boardId: z.string().min(1).optional(),
  apiKey: z.string().min(1).optional(),
})

interface ListingRow {
  mls_number: string
  [key: string]: unknown
}

/**
 * Calculate days on market from listing_date
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
 * Transform Bridge listing to vehicle insert/update payload
 */
function transformBridgeListingToVehicle(
  listing: BridgeListing,
  userId: string
): Record<string, unknown> {
  return {
    user_id: userId,
    mls_number: listing.mls_number,
    mls_board_id: listing.listing_office || 'unknown',
    mls_synced_at: new Date().toISOString(),
    mls_source: 'bridge',
    listing_status: listing.listing_status,
    dom: calculateDOM(listing.listing_date),
    // Vehicle-specific fields
    year: 0,
    make: 'RE',
    model: `${listing.address.city} Property`,
    stock_no: `MLS-${listing.mls_number}-${Date.now()}`,
    status: listing.listing_status === 'active' ? 'active' : 'inactive',
    // Address fields
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
    // Photos (URLs only; actual download happens async)
    photos: listing.photos.map(p => ({ url: p.url, caption: p.caption })),
    // Price history
    price: listing.price,
    price_history: listing.price
      ? [{ price: listing.price, date: new Date().toISOString() }]
      : [],
  }
}

/**
 * Queue async photo download (stub for now)
 * TODO: Implement async photo downloader (Bull queue, Cloudflare Durable Objects, etc.)
 */
async function queuePhotoDownload(
  vehicleId: string,
  photoUrls: string[]
): Promise<void> {
  // Placeholder: in production, queue to Redis/Bull/etc.
  console.log(`[photoDownload] Queued ${photoUrls.length} photos for vehicle ${vehicleId}`)
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

    const result: SyncResult = {
      success: false,
      listings_fetched: 0,
      listings_created: 0,
      listings_updated: 0,
      errors: [],
      timestamp: new Date(),
    }

    // Fetch listings from Bridge API
    let listings: BridgeListing[] = []
    try {
      listings = await getListings(agentId, boardId, apiKey)
      result.listings_fetched = listings.length
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      result.errors.push(`Bridge API error: ${msg}`)
      // Log sync failure and return early
      await supabase.from('mls_sync_log').insert({
        agent_id: profile.id,
        mls_board_id: boardId,
        listings_synced: 0,
        listings_created: 0,
        listings_updated: 0,
        errors: msg,
        status: 'failed',
      })
      return NextResponse.json(result, { status: 400 })
    }

    // Process each listing: insert new, update existing
    const photoQueueJobs = []

    for (const listing of listings) {
      try {
        const payload = transformBridgeListingToVehicle(listing, profile.org_id)

        // Try update first, then insert if not found
        const { data: existing } = await supabase
          .from('vehicles')
          .select('id')
          .eq('mls_number', listing.mls_number)
          .eq('user_id', profile.org_id)
          .single()

        if (existing) {
          // Update existing listing
          const { error: updateError } = await supabase
            .from('vehicles')
            .update(payload)
            .eq('id', existing.id)

          if (updateError) {
            result.errors.push(`Failed to update ${listing.mls_number}: ${updateError.message}`)
          } else {
            result.listings_updated++
            // Queue photo download
            if (listing.photos.length > 0) {
              photoQueueJobs.push(queuePhotoDownload(existing.id, listing.photos.map(p => p.url)))
            }
          }
        } else {
          // Insert new listing
          const { data: newVehicle, error: insertError } = await supabase
            .from('vehicles')
            .insert(payload)
            .select('id')
            .single()

          if (insertError) {
            result.errors.push(`Failed to insert ${listing.mls_number}: ${insertError.message}`)
          } else if (newVehicle) {
            result.listings_created++
            // Queue photo download
            if (listing.photos.length > 0) {
              photoQueueJobs.push(queuePhotoDownload(newVehicle.id, listing.photos.map(p => p.url)))
            }
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        result.errors.push(`Error processing ${listing.mls_number}: ${msg}`)
      }
    }

    // Queue all photo downloads (async, don't wait)
    Promise.all(photoQueueJobs).catch(err => {
      console.error('Photo download queue error:', err)
    })

    // Log sync result
    const { error: logError } = await supabase.from('mls_sync_log').insert({
      agent_id: profile.id,
      mls_board_id: boardId,
      listings_synced: result.listings_fetched,
      listings_created: result.listings_created,
      listings_updated: result.listings_updated,
      errors: result.errors.length > 0 ? result.errors.join('; ') : null,
      status: result.errors.length === 0 ? 'success' : 'partial',
    })

    if (logError) {
      console.error('Failed to log sync result:', logError)
    }

    result.success = result.errors.length === 0

    return NextResponse.json(result, { status: result.success ? 200 : 207 })
  } catch (err) {
    console.error('[mls/sync] unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
