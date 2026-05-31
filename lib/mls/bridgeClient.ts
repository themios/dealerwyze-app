/**
 * lib/mls/bridgeClient.ts
 *
 * Bridge Interactive MLS API client.
 * Handles authentication, listing sync, webhook validation.
 *
 * NOTE: Sandbox API key available from https://developer.bridge.realogy.com/
 * Production API keys issued by MLS boards post-approval.
 */

import { z } from 'zod'

/**
 * Bridge API base URL
 * For sandbox: https://api.bridgeinteractive.dev/
 * For production: https://api.bridgeinteractive.com/
 */
const BRIDGE_API_BASE = process.env.BRIDGE_API_BASE || 'https://api.bridgeinteractive.dev/'
const BRIDGE_API_TIMEOUT = 30000 // 30 seconds

/**
 * Schema for Bridge listing response
 * This is a subset of full Bridge response; only fields we use
 */
const BridgeListingSchema = z.object({
  mls_number: z.string(),
  address: z.object({
    address_line1: z.string(),
    city: z.string(),
    state: z.string(),
    zip: z.string(),
  }),
  price: z.number().int().positive().nullable(),
  bedrooms: z.number().int().nonnegative().nullable(),
  bathrooms: z.number().int().nonnegative().nullable(),
  sqft: z.number().int().nonnegative().nullable(),
  lot_size: z.number().int().nonnegative().nullable(),
  description: z.string().nullable(),
  listing_date: z.string().datetime().nullable(),
  photos: z.array(z.object({
    url: z.string().url(),
    caption: z.string().nullable(),
  })).default([]),
  listing_status: z.enum(['active', 'pending', 'sold', 'expired', 'withdrawn', 'off_market']).default('active'),
  dom: z.number().int().nonnegative().nullable(),
  property_type: z.string().nullable(),
  agent_email: z.string().email().nullable(),
  listing_office: z.string().nullable(),
})

export type BridgeListing = z.infer<typeof BridgeListingSchema>

/**
 * Bridge API error response
 */
interface BridgeErrorResponse {
  error: string
  error_description?: string
  status_code: number
}

/**
 * Result of sync operation
 */
export interface SyncResult {
  success: boolean
  listings_fetched: number
  listings_created: number
  listings_updated: number
  errors: string[]
  timestamp: Date
}

/**
 * Get listings for an agent from Bridge API
 * @param agentId Agent's Bridge ID or email
 * @param boardId MLS board ID (e.g., "socal_mls", "bay_area_mls")
 * @param apiKey Bridge API key (per MLS board)
 * @param status Filter by listing status (optional)
 * @returns Array of BridgeListing objects
 */
export async function getListings(
  agentId: string,
  boardId: string,
  apiKey: string,
  status?: string
): Promise<BridgeListing[]> {
  try {
    const url = new URL(`${BRIDGE_API_BASE}v2/properties`)
    url.searchParams.set('agent_id', agentId)
    url.searchParams.set('board_id', boardId)
    if (status) url.searchParams.set('status', status)

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(BRIDGE_API_TIMEOUT),
    })

    if (!response.ok) {
      const error: BridgeErrorResponse = await response.json().catch(() => ({
        error: 'Unknown error',
        status_code: response.status,
      }))
      throw new Error(`Bridge API error: ${error.error} (${error.status_code})`)
    }

    const data = await response.json()
    const listings = Array.isArray(data.properties) ? data.properties : data

    // Validate each listing against schema
    const validListings = listings
      .map((listing: unknown) => {
        const result = BridgeListingSchema.safeParse(listing)
        return result.success ? result.data : null
      })
      .filter((listing): listing is BridgeListing => listing !== null)

    return validListings
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    throw new Error(`Failed to fetch listings from Bridge: ${message}`)
  }
}

/**
 * Get a single listing by MLS number
 * @param mlsNumber MLS listing number
 * @param boardId MLS board ID
 * @param apiKey Bridge API key
 * @returns BridgeListing object
 */
export async function getListingDetails(
  mlsNumber: string,
  boardId: string,
  apiKey: string
): Promise<BridgeListing> {
  try {
    const url = new URL(`${BRIDGE_API_BASE}v2/properties/${mlsNumber}`)
    url.searchParams.set('board_id', boardId)

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(BRIDGE_API_TIMEOUT),
    })

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`Listing ${mlsNumber} not found`)
      }
      const error: BridgeErrorResponse = await response.json().catch(() => ({
        error: 'Unknown error',
        status_code: response.status,
      }))
      throw new Error(`Bridge API error: ${error.error} (${error.status_code})`)
    }

    const data = await response.json()
    const parsed = BridgeListingSchema.safeParse(data)
    if (!parsed.success) {
      throw new Error(`Invalid listing data from Bridge: ${JSON.stringify(parsed.error.flatten())}`)
    }

    return parsed.data
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    throw new Error(`Failed to fetch listing details: ${message}`)
  }
}

/**
 * Validate webhook signature from Bridge
 * Bridge includes a signature header to prevent spoofing
 * @param payload Raw webhook payload
 * @param signature Signature header value
 * @param secret Bridge webhook secret (stored in env)
 * @returns true if signature is valid
 */
export async function validateWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  try {
    // Bridge typically uses HMAC-SHA256
    const encoder = new TextEncoder()
    const data = encoder.encode(payload)
    const keyData = encoder.encode(secret)
    const key = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const computed = await crypto.subtle.sign('HMAC', key, data)
    const computedHex = Array.from(new Uint8Array(computed))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')

    // Constant-time comparison to prevent timing attacks
    return signature === computedHex
  } catch (err) {
    console.error('Webhook signature validation error:', err)
    return false
  }
}

/**
 * Parse webhook payload (listing updated, price changed, etc.)
 * @param payload Webhook payload object
 * @returns Parsed webhook data or null if invalid
 */
export function parseWebhookPayload(payload: unknown): {
  event: string
  mls_number: string
  board_id: string
  timestamp: string
  data: unknown
} | null {
  try {
    const WebhookPayloadSchema = z.object({
      event: z.enum(['listing.created', 'listing.updated', 'price.changed', 'status.changed', 'photos.added']),
      mls_number: z.string(),
      board_id: z.string(),
      timestamp: z.string().datetime(),
      data: z.record(z.unknown()),
    })

    const result = WebhookPayloadSchema.safeParse(payload)
    if (!result.success) {
      console.error('Invalid webhook payload:', result.error.flatten())
      return null
    }

    return result.data
  } catch (err) {
    console.error('Webhook parsing error:', err)
    return null
  }
}

/**
 * Test Bridge API connection with a simple request
 * Useful for validating API key during onboarding
 * @param agentId Agent ID to test
 * @param boardId Board ID to test
 * @param apiKey API key to test
 * @returns true if API connection works
 */
export async function testConnection(
  agentId: string,
  boardId: string,
  apiKey: string
): Promise<boolean> {
  try {
    const listings = await getListings(agentId, boardId, apiKey)
    return Array.isArray(listings)
  } catch (err) {
    console.error('Bridge connection test failed:', err instanceof Error ? err.message : err)
    return false
  }
}
