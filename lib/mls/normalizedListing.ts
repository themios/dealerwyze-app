/**
 * Normalized MLS listing shape used by Bridge and Repliers sync paths.
 */

export interface NormalizedMlsListing {
  mls_number: string
  address: {
    address_line1: string
    city: string
    state: string
    zip: string
  }
  price: number | null
  bedrooms: number | null
  bathrooms: number | null
  sqft: number | null
  lot_size: number | null
  description: string | null
  listing_date: string | null
  photos: Array<{ url: string; caption: string | null }>
  listing_status: 'active' | 'pending' | 'sold' | 'expired' | 'withdrawn' | 'off_market'
  dom: number | null
  property_type: string | null
  agent_email: string | null
  listing_office: string | null
  year_built: number | null
}

export function calculateDom(listingDateStr: string | null): number | null {
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

export function mapStandardStatus(
  status: string | null | undefined
): NormalizedMlsListing['listing_status'] {
  const normalized = (status ?? 'active').toLowerCase()
  if (normalized === 'active') return 'active'
  if (normalized === 'pending' || normalized === 'active under contract') return 'pending'
  if (normalized === 'closed' || normalized === 'sold') return 'sold'
  if (normalized === 'expired') return 'expired'
  if (normalized === 'withdrawn' || normalized === 'cancelled') return 'withdrawn'
  return 'off_market'
}
