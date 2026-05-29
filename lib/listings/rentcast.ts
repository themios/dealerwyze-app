/**
 * RentCast API wrapper for RE listing intelligence.
 *
 * Docs: https://developers.rentcast.io
 * Auth: X-Api-Key header. Key is validated at call time (not module load) so
 * the build succeeds without RENTCAST_API_KEY set; callers convert the thrown
 * error into a 503 response.
 */

export interface RentCastProperty {
  address: string
  city: string
  state: string
  zipCode: string
  bedrooms?: number | null
  bathrooms?: number | null
  squareFootage?: number | null
  lotSize?: number | null
  yearBuilt?: number | null
  propertyType?: string | null
  mlsNumber?: string | null
}

export interface RentCastComparable {
  address: string
  price: number
  squareFootage?: number | null
  bedrooms?: number | null
  bathrooms?: number | null
  distance?: number | null
  correlation?: number | null
}

export interface RentCastCMA {
  price: number
  priceRangeLow: number
  priceRangeHigh: number
  comparables: RentCastComparable[]
}

/**
 * Returns the RENTCAST_API_KEY env var or throws a descriptive error.
 * Call inside exported functions (not at module level) so the build
 * succeeds without the key set. Callers catch and return 503.
 */
function getRentCastKey(): string {
  const key = process.env.RENTCAST_API_KEY
  if (!key) throw new Error('RENTCAST_API_KEY is not configured. Contact your administrator.')
  return key
}

/**
 * Builds a full address string for RentCast API calls.
 * Format: "123 Main St, Portland, OR 97201"
 * Throws if any part is missing or empty.
 */
export function buildFullAddress(parts: {
  address_line1: string
  city: string
  state: string
  zip: string
}): string {
  const { address_line1, city, state, zip } = parts
  if (!address_line1?.trim()) throw new Error('address_line1 is required to build full address')
  if (!city?.trim()) throw new Error('city is required to build full address')
  if (!state?.trim()) throw new Error('state is required to build full address')
  if (!zip?.trim()) throw new Error('zip is required to build full address')
  return `${address_line1.trim()}, ${city.trim()}, ${state.trim()} ${zip.trim()}`
}

/**
 * Looks up a property by address from the RentCast /v1/properties endpoint.
 * Returns the first match or null if nothing found.
 * Throws on non-200 response (caller should catch and return 503 or 502).
 */
export async function fetchPropertyByAddress(address: string): Promise<RentCastProperty | null> {
  const key = getRentCastKey()
  const url = `https://api.rentcast.io/v1/properties?address=${encodeURIComponent(address)}&limit=1`

  const res = await fetch(url, {
    headers: { 'X-Api-Key': key, Accept: 'application/json' },
  })

  if (!res.ok) {
    console.error(`[rentcast] property lookup failed: ${res.status}`)
    throw new Error(`RentCast lookup failed: ${res.status}`)
  }

  const json = (await res.json()) as unknown
  const items = Array.isArray(json) ? json : (json as { properties?: unknown[] })?.properties ?? []

  if (!Array.isArray(items) || items.length === 0) return null

  const raw = items[0] as Record<string, unknown>

  return {
    address:       String(raw.formattedAddress ?? raw.address ?? ''),
    city:          String(raw.city ?? ''),
    state:         String(raw.state ?? ''),
    zipCode:       String(raw.zipCode ?? ''),
    bedrooms:      raw.bedrooms != null ? Number(raw.bedrooms) : null,
    bathrooms:     raw.bathrooms != null ? Number(raw.bathrooms) : null,
    squareFootage: raw.squareFootage != null ? Number(raw.squareFootage) : null,
    lotSize:       raw.lotSize != null ? Number(raw.lotSize) : null,
    yearBuilt:     raw.yearBuilt != null ? Number(raw.yearBuilt) : null,
    propertyType:  raw.propertyType != null ? String(raw.propertyType) : null,
    mlsNumber:     raw.mlsNumber != null ? String(raw.mlsNumber) : null,
  }
}

/**
 * Calls RentCast /v1/avm/value to generate a Comparative Market Analysis.
 * Requires a full address in format "Street, City, State Zip".
 * opts are appended as query params when provided.
 * Throws on non-200 response.
 */
export async function fetchCMA(
  address: string,
  opts?: {
    bedrooms?: number | null
    bathrooms?: number | null
    sqft?: number | null
    propertyType?: string | null
  },
): Promise<RentCastCMA> {
  const key = getRentCastKey()

  const params = new URLSearchParams({
    address,
    compCount: '15',
  })
  if (opts?.bedrooms != null)     params.set('bedrooms', String(opts.bedrooms))
  if (opts?.bathrooms != null)    params.set('bathrooms', String(opts.bathrooms))
  if (opts?.sqft != null)         params.set('squareFootage', String(opts.sqft))
  if (opts?.propertyType != null) params.set('propertyType', opts.propertyType)

  const url = `https://api.rentcast.io/v1/avm/value?${params.toString()}`

  const res = await fetch(url, {
    headers: { 'X-Api-Key': key, Accept: 'application/json' },
  })

  if (!res.ok) {
    console.error(`[rentcast] CMA failed: ${res.status}`)
    throw new Error(`RentCast CMA failed: ${res.status}`)
  }

  const raw = (await res.json()) as Record<string, unknown>

  const comparables: RentCastComparable[] = Array.isArray(raw.comparables)
    ? (raw.comparables as Record<string, unknown>[]).map((c) => ({
        address:       String(c.formattedAddress ?? c.address ?? ''),
        price:         Number(c.price ?? 0),
        squareFootage: c.squareFootage != null ? Number(c.squareFootage) : null,
        bedrooms:      c.bedrooms != null ? Number(c.bedrooms) : null,
        bathrooms:     c.bathrooms != null ? Number(c.bathrooms) : null,
        distance:      c.distance != null ? Number(c.distance) : null,
        correlation:   c.correlation != null ? Number(c.correlation) : null,
      }))
    : []

  return {
    price:          Number(raw.price ?? 0),
    priceRangeLow:  Number(raw.priceRangeLow ?? 0),
    priceRangeHigh: Number(raw.priceRangeHigh ?? 0),
    comparables,
  }
}
