/**
 * apifyScrape — wraps Apify actor calls for Zillow and Redfin listing URLs.
 *
 * Maps Apify output fields to vehicles table column names. Returns null if the
 * listing dataset is empty (listing removed or URL not found). Throws a
 * user-friendly error if APIFY_API_TOKEN is missing or the actor call fails.
 *
 * NOTE: photo_url is extracted for reference only — it is NOT included in the
 * returned prefill payload. Photos are managed via vehicle_photos upload.
 */

import { ApifyClient } from 'apify-client'

/** Fields extracted from Apify output, mapped to vehicles RE column names. */
export interface ScrapedListing {
  address_line1: string | null
  city: string | null
  state: string | null
  zip: string | null
  price: number | null
  bedrooms: number | null
  bathrooms: number | null
  sqft: number | null
  lot_size: number | null
  year_built: number | null
  property_type: string | null
  hoa_monthly: number | null
  listing_url: string | null
  import_source: 'url_scrape'
  import_raw_json: Record<string, unknown>
}

// Actor IDs
const ZILLOW_ACTOR_ID = 'ENK9p4RZHg0iVso52'
const REDFIN_ACTOR_ID = 'ecomscrape~redfin-com-property-details-page-scraper'

/**
 * Detect which actor to use based on URL domain.
 */
function detectSource(url: string): 'zillow' | 'redfin' {
  if (url.includes('redfin.com')) return 'redfin'
  return 'zillow'
}

/**
 * Parse a Zillow address string like "123 Main St, Portland, OR 97201" into parts.
 * Returns nulls if parsing fails.
 */
function parseZillowAddress(address: string | null | undefined): {
  address_line1: string | null
  city: string | null
  state: string | null
  zip: string | null
} {
  if (!address) return { address_line1: null, city: null, state: null, zip: null }

  // Format: "123 Main St, Portland, OR 97201"
  const parts = address.split(',').map(p => p.trim())

  if (parts.length < 3) {
    return { address_line1: parts[0] ?? null, city: null, state: null, zip: null }
  }

  const address_line1 = parts[0] ?? null
  const city = parts[1] ?? null

  // Last part: "OR 97201" or "OR"
  const stateZip = parts[parts.length - 1].trim()
  const stateZipMatch = stateZip.match(/^([A-Z]{2})\s*(\d{5}(?:-\d{4})?)?$/)
  const state = stateZipMatch?.[1] ?? null
  const zip = stateZipMatch?.[2] ?? null

  return { address_line1, city, state, zip }
}

/**
 * Safely coerce a value to number or null.
 */
function toNum(val: unknown): number | null {
  if (val == null) return null
  const n = Number(val)
  return Number.isFinite(n) ? n : null
}

/**
 * Map a raw Zillow Apify item to ScrapedListing shape.
 */
function mapZillowItem(item: Record<string, unknown>): ScrapedListing {
  const { address_line1, city, state, zip } = parseZillowAddress(item.address as string | null)

  return {
    address_line1,
    city,
    state,
    zip,
    price: toNum(item.price),
    bedrooms: toNum(item.bedrooms),
    bathrooms: toNum(item.bathrooms),
    sqft: toNum(item.livingArea),
    lot_size: toNum(item.lotSize),
    year_built: toNum(item.yearBuilt),
    property_type: item.homeType ? String(item.homeType) : null,
    hoa_monthly: toNum(item.hoaMonthly),
    listing_url: item.url ? String(item.url) : null,
    import_source: 'url_scrape',
    import_raw_json: item,
  }
}

/**
 * Map a raw Redfin Apify item to ScrapedListing shape.
 * Redfin may return address fields split or in a different structure.
 */
function mapRedfinItem(item: Record<string, unknown>): ScrapedListing {
  // Redfin typically returns address in a nested or combined field
  const address = (item.address as string | null) ?? (item.streetAddress as string | null)
  const { address_line1, city, state, zip } = parseZillowAddress(address)

  return {
    address_line1: address_line1 ?? (item.streetAddress ? String(item.streetAddress) : null),
    city: city ?? (item.city ? String(item.city) : null),
    state: state ?? (item.state ? String(item.state) : null),
    zip: zip ?? (item.postalCode ? String(item.postalCode) : null),
    price: toNum(item.price ?? item.listingPrice),
    bedrooms: toNum(item.bedrooms ?? item.beds),
    bathrooms: toNum(item.bathrooms ?? item.baths),
    sqft: toNum(item.sqft ?? item.squareFeet ?? item.livingArea),
    lot_size: toNum(item.lotSize),
    year_built: toNum(item.yearBuilt),
    property_type: (item.propertyType ?? item.homeType) ? String(item.propertyType ?? item.homeType) : null,
    hoa_monthly: toNum(item.hoaMonthly ?? item.hoa),
    listing_url: (item.url ?? item.listingUrl) ? String(item.url ?? item.listingUrl) : null,
    import_source: 'url_scrape',
    import_raw_json: item,
  }
}

/**
 * Call the appropriate Apify actor for the given URL and return mapped listing fields.
 *
 * Returns null if the actor dataset is empty (listing not found or removed).
 * Throws a user-friendly error on actor failure or missing token.
 */
export async function scrapeListingUrl(url: string): Promise<ScrapedListing | null> {
  const token = process.env.APIFY_API_TOKEN
  if (!token) {
    throw new Error(
      'Listing import via URL is not configured. Please paste the listing description text instead.',
    )
  }

  const source = detectSource(url)
  const actorId = source === 'redfin' ? REDFIN_ACTOR_ID : ZILLOW_ACTOR_ID

  const input =
    source === 'redfin'
      ? { urls: [url] }
      : { startUrls: [{ url }], propertyStatus: 'FOR_SALE' }

  const client = new ApifyClient({ token })

  try {
    const run = await client.actor(actorId).call(input, {
      // Reasonable timeout for a single listing — Apify cold starts can take 20-30s
      waitSecs: 90,
    })

    const { items } = await client.dataset(run.defaultDatasetId).listItems()

    if (!items.length) return null

    const raw = items[0] as Record<string, unknown>
    return source === 'redfin' ? mapRedfinItem(raw) : mapZillowItem(raw)
  } catch (err) {
    // Re-throw with a user-friendly message that doesn't expose internal details
    const message = err instanceof Error ? err.message : String(err)
    // Preserve our own descriptive errors; wrap generic ones
    if (message.includes('not configured') || message.includes('paste the listing')) {
      throw err
    }
    throw new Error(
      'Listing import unavailable — try pasting the listing description instead.',
    )
  }
}
