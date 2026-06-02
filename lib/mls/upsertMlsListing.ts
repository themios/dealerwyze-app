/**
 * Shared MLS listing upsert for manual sync route and daily cron.
 */

import { calculateDom, type NormalizedMlsListing } from '@/lib/mls/normalizedListing'

interface PriceHistoryEntry {
  price: number
  date: string
}

export interface UpsertMlsListingParams {
  supabase: any
  listing: NormalizedMlsListing
  orgId: string
  agentId: string
  mlsSource: 'repliers' | 'bridge'
}

export async function upsertMlsListing(
  params: UpsertMlsListingParams
): Promise<{ action: 'created' | 'updated'; vehicleId: string }> {
  const { supabase, listing, orgId, agentId, mlsSource } = params

  const { data: existing } = await supabase
    .from('vehicles')
    .select('id, price, price_history, showing_count, agent_notes, stock_no')
    .eq('mls_number', listing.mls_number)
    .eq('org_id', orgId)
    .maybeSingle()

  const now = new Date().toISOString()

  let priceHistory: PriceHistoryEntry[] = []
  if (existing?.price_history && Array.isArray(existing.price_history)) {
    priceHistory = existing.price_history as PriceHistoryEntry[]
  }

  if (listing.price && existing?.price !== listing.price) {
    priceHistory.push({ price: listing.price, date: now })
  }

  const vehicleStatus =
    listing.listing_status === 'active' ? 'available' : listing.listing_status === 'pending' ? 'pending' : 'sold'

  const payload: Record<string, unknown> = {
    user_id: agentId,
    org_id: orgId,
    listing_agent_id: agentId,
    mls_number: listing.mls_number,
    mls_board_id: listing.listing_office ?? 'repliers',
    mls_synced_at: now,
    mls_source: mlsSource,
    listing_status: listing.listing_status,
    dom: calculateDom(listing.listing_date),
    price: listing.price,
    price_history: priceHistory,
    year: listing.year_built ?? 0,
    make: 'RE',
    model: `${listing.address.city} Property`,
    stock_no: existing?.stock_no ?? `MLS-${listing.mls_number}`,
    status: vehicleStatus,
    address_line1: listing.address.address_line1,
    city: listing.address.city,
    state: listing.address.state,
    zip: listing.address.zip,
    bedrooms: listing.bedrooms,
    bathrooms: listing.bathrooms,
    sqft: listing.sqft,
    lot_size: listing.lot_size != null ? String(listing.lot_size) : null,
    year_built: listing.year_built,
    ai_description: listing.description,
    property_type: listing.property_type,
    import_source: mlsSource === 'repliers' ? 'repliers_mls' : 'bridge_mls',
    photo_url: listing.photos[0]?.url ?? null,
  }

  if (existing) {
    if (existing.showing_count !== null && existing.showing_count !== undefined) {
      payload.showing_count = existing.showing_count
    }
    if (existing.agent_notes) payload.agent_notes = existing.agent_notes
  }

  if (existing?.id) {
    const { data, error } = await supabase
      .from('vehicles')
      .update(payload)
      .eq('id', existing.id)
      .select('id')
      .single()

    if (error) throw new Error(`Update failed: ${error.message}`)
    if (!data?.id) throw new Error('Update returned no ID')
    return { action: 'updated', vehicleId: data.id }
  }

  const { data, error } = await supabase.from('vehicles').insert(payload).select('id').single()

  if (error) {
    throw new Error(`Insert failed: ${error.message}`)
  }
  if (!data?.id) {
    throw new Error('Insert returned no ID')
  }

  return { action: 'created', vehicleId: data.id }
}
