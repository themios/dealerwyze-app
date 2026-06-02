/**
 * Repliers MLS API client (sandbox + production).
 * Docs: https://docs.repliers.io/
 */

import { mapStandardStatus, type NormalizedMlsListing } from '@/lib/mls/normalizedListing'

const REPLIERS_API_BASE = process.env.REPLIERS_API_BASE ?? 'https://api.repliers.io'
const REPLIERS_IMAGE_BASE = process.env.REPLIERS_IMAGE_BASE ?? 'https://cdn.repliers.io/'
const REPLIERS_API_TIMEOUT = 30_000

export interface RepliersListingsOptions {
  apiKey?: string
  limit?: number
  page?: number
  city?: string
  state?: string
  standardStatus?: string
}

interface RepliersAddress {
  streetNumber?: string | null
  streetDirectionPrefix?: string | null
  streetName?: string | null
  streetSuffix?: string | null
  unitNumber?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
  addressKey?: string | null
}

interface RepliersListingRaw {
  mlsNumber?: string
  listPrice?: number | null
  standardStatus?: string | null
  listDate?: string | null
  boardId?: number | string | null
  class?: string | null
  address?: RepliersAddress
  details?: {
    numBedrooms?: number | null
    numBathrooms?: number | null
    sqft?: number | string | null
    yearBuilt?: number | string | null
    propertyType?: string | null
    description?: string | null
    lotSize?: number | string | null
  }
  images?: string[] | null
  office?: { brokerageName?: string | null }
  agents?: Array<{ email?: string | null }> | null
}

function resolveApiKey(explicit?: string): string {
  const key = explicit ?? process.env.REPLIERS_API_KEY
  if (!key) {
    throw new Error('REPLIERS_API_KEY is not configured')
  }
  return key
}

function formatAddressLine(address: RepliersAddress | undefined): string {
  if (!address) return 'Unknown Address'
  const parts = [
    address.streetNumber,
    address.streetDirectionPrefix,
    address.streetName,
    address.streetSuffix,
    address.unitNumber ? `#${address.unitNumber}` : null,
  ].filter(Boolean)
  if (parts.length > 0) return parts.join(' ').trim()
  return address.addressKey ?? 'Unknown Address'
}

function toInt(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = typeof value === 'number' ? value : parseInt(String(value), 10)
  return Number.isFinite(n) ? n : null
}

function toPhotoUrl(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  const base = REPLIERS_IMAGE_BASE.endsWith('/') ? REPLIERS_IMAGE_BASE : `${REPLIERS_IMAGE_BASE}/`
  return `${base}${path.replace(/^\//, '')}`
}

export function mapRepliersListing(raw: RepliersListingRaw): NormalizedMlsListing | null {
  if (!raw.mlsNumber) return null

  const address = raw.address ?? {}
  const details = raw.details ?? {}
  const price = raw.listPrice != null ? Math.round(Number(raw.listPrice)) : null

  return {
    mls_number: raw.mlsNumber,
    address: {
      address_line1: formatAddressLine(address),
      city: address.city ?? 'Unknown',
      state: address.state ?? 'NA',
      zip: address.zip ?? '',
    },
    price: price != null && price > 0 ? price : null,
    bedrooms: toInt(details.numBedrooms),
    bathrooms: toInt(details.numBathrooms),
    sqft: toInt(details.sqft),
    lot_size: toInt(details.lotSize),
    description: details.description ?? null,
    listing_date: raw.listDate ?? null,
    photos: (raw.images ?? []).map((url) => ({ url: toPhotoUrl(url), caption: null })),
    listing_status: mapStandardStatus(raw.standardStatus),
    dom: null,
    property_type: details.propertyType ?? raw.class ?? null,
    agent_email: raw.agents?.[0]?.email ?? null,
    listing_office: raw.office?.brokerageName ?? (raw.boardId != null ? String(raw.boardId) : null),
    year_built: toInt(details.yearBuilt),
  }
}

/**
 * Fetch active listings from Repliers (paginated).
 */
export async function getRepliersListings(
  options: RepliersListingsOptions = {}
): Promise<NormalizedMlsListing[]> {
  const apiKey = resolveApiKey(options.apiKey)
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100)
  const page = Math.max(options.page ?? 1, 1)

  const url = new URL(`${REPLIERS_API_BASE}/listings`)
  url.searchParams.set('limit', String(limit))
  url.searchParams.set('page', String(page))
  url.searchParams.set('standardStatus', options.standardStatus ?? 'Active')
  if (options.city) url.searchParams.set('city', options.city)
  if (options.state) url.searchParams.set('state', options.state)

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'REPLIERS-API-KEY': apiKey,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(REPLIERS_API_TIMEOUT),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Repliers API error (${response.status}): ${body.slice(0, 200)}`)
  }

  const data = (await response.json()) as { listings?: RepliersListingRaw[] }
  const rows = Array.isArray(data.listings) ? data.listings : []

  return rows
    .slice(0, limit)
    .map(mapRepliersListing)
    .filter((listing): listing is NormalizedMlsListing => listing !== null)
}

export async function testRepliersConnection(apiKey?: string): Promise<boolean> {
  try {
    const listings = await getRepliersListings({ apiKey, limit: 1 })
    return listings.length >= 0
  } catch (err) {
    console.error('[repliersClient] Connection test failed:', err)
    return false
  }
}
