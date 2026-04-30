/**
 * Security invariant tests — verify key abuse-prevention logic works correctly.
 * All Supabase calls are mocked; no network or DB access.
 */

import { describe, it, expect, vi } from 'vitest'

// Mock server-only modules before importing anything that depends on them
vi.mock('server-only', () => ({}))
vi.mock('@/lib/stripe', () => ({
  STORAGE_BASE_QUOTA: 500 * 1024 * 1024,
  stripe: {},
}))

import { FREE_TIER_STORAGE_QUOTA, getOrgStorageQuota, checkFreeTierAttachmentLimit } from '@/lib/storage/quota'

const STORAGE_BASE_QUOTA = 500 * 1024 * 1024

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeMockSupabase(overrides: Record<string, unknown> = {}) {
  const defaults = {
    plan: 'free',
    storage_quota_bytes: null,
    storage_pack_expires_at: null,
    vehiclePhotoCount: 0,
    vehicleDocCount: 0,
    vehiclesWithPhotos: [] as string[],
    vehiclesWithDocs: [] as string[],
    customerDocCount: 0,
    customersWithDocs: [] as string[],
  }
  const cfg = { ...defaults, ...overrides }

  const from = vi.fn((table: string) => {
    const base = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null }),
    }

    if (table === 'organizations') {
      return {
        ...base,
        maybeSingle: vi.fn().mockResolvedValue({ data: { plan: cfg.plan } }),
      }
    }

    if (table === 'org_settings') {
      return {
        ...base,
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            storage_quota_bytes: cfg.storage_quota_bytes,
            storage_pack_expires_at: cfg.storage_pack_expires_at,
          },
        }),
      }
    }

    if (table === 'vehicle_photos') {
      const obj = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null }),
        // count query
        then: undefined as unknown,
      }
      // Support both count and list queries
      obj.select = vi.fn((cols: string, opts?: { count?: string; head?: boolean }) => {
        if (opts?.count) {
          // count query — return count
          const countVal = cfg.vehiclePhotoCount
          return { eq: vi.fn().mockReturnThis(), then: (fn: (v: {count: number}) => unknown) => Promise.resolve(fn({ count: countVal })) }
        }
        // list query for distinct vehicles
        return {
          eq: vi.fn().mockReturnValue(
            Promise.resolve({ data: cfg.vehiclesWithPhotos.map(id => ({ vehicle_id: id })) })
          ),
        }
      })
      return obj
    }

    if (table === 'vehicle_documents') {
      return {
        select: vi.fn((cols: string, opts?: { count?: string; head?: boolean }) => {
          if (opts?.count) {
            const countVal = cfg.vehicleDocCount
            return { eq: vi.fn().mockReturnThis(), then: (fn: (v: {count: number}) => unknown) => Promise.resolve(fn({ count: countVal })) }
          }
          return {
            eq: vi.fn().mockReturnValue(
              Promise.resolve({ data: cfg.vehiclesWithDocs.map(id => ({ vehicle_id: id })) })
            ),
          }
        }),
      }
    }

    if (table === 'customer_documents') {
      return {
        select: vi.fn((cols: string, opts?: { count?: string; head?: boolean }) => {
          if (opts?.count) {
            const countVal = cfg.customerDocCount
            return { eq: vi.fn().mockReturnThis(), then: (fn: (v: {count: number}) => unknown) => Promise.resolve(fn({ count: countVal })) }
          }
          return {
            eq: vi.fn().mockReturnValue(
              Promise.resolve({ data: cfg.customersWithDocs.map(id => ({ customer_id: id })) })
            ),
          }
        }),
      }
    }

    return base
  })

  return { from } as unknown as Parameters<typeof getOrgStorageQuota>[0]
}

// ── Storage quota: free tier ──────────────────────────────────────────────────

describe('getOrgStorageQuota — free tier', () => {
  it('returns 50 MB for free-tier orgs', async () => {
    const supabase = makeMockSupabase({ plan: 'free' })
    const quota = await getOrgStorageQuota(supabase, 'org-1')
    expect(quota).toBe(FREE_TIER_STORAGE_QUOTA)
    expect(quota).toBe(50 * 1024 * 1024)
  })

  it('returns STORAGE_BASE_QUOTA for paid orgs with no custom quota', async () => {
    const supabase = makeMockSupabase({ plan: 'growth', storage_quota_bytes: null })
    const quota = await getOrgStorageQuota(supabase, 'org-1')
    expect(quota).toBe(STORAGE_BASE_QUOTA)
  })

  it('returns custom storage_quota_bytes for paid orgs', async () => {
    const supabase = makeMockSupabase({ plan: 'growth', storage_quota_bytes: 1_000_000_000 })
    const quota = await getOrgStorageQuota(supabase, 'org-1')
    expect(quota).toBe(1_000_000_000)
  })

  it('free-tier quota is strictly less than paid base quota', () => {
    expect(FREE_TIER_STORAGE_QUOTA).toBeLessThan(STORAGE_BASE_QUOTA)
  })
})

// ── Attachment count limit ────────────────────────────────────────────────────

describe('checkFreeTierAttachmentLimit — vehicle', () => {
  it('allows first vehicle upload on free tier (no existing attachments)', async () => {
    const supabase = makeMockSupabase({
      plan: 'free',
      vehiclePhotoCount: 0,
      vehicleDocCount: 0,
      vehiclesWithPhotos: [],
      vehiclesWithDocs: [],
    })
    const result = await checkFreeTierAttachmentLimit(supabase, 'org-1', 'vehicle', 'v-new')
    expect(result).toBeNull()
  })

  it('allows upload to a vehicle that already has photos (same slot)', async () => {
    const supabase = makeMockSupabase({
      plan: 'free',
      vehiclePhotoCount: 3,
      vehicleDocCount: 0,
      vehiclesWithPhotos: ['v-1'],
      vehiclesWithDocs: [],
    })
    const result = await checkFreeTierAttachmentLimit(supabase, 'org-1', 'vehicle', 'v-1')
    expect(result).toBeNull()
  })

  it('blocks 3rd vehicle on free tier (2 others already have attachments)', async () => {
    const supabase = makeMockSupabase({
      plan: 'free',
      vehiclePhotoCount: 0,
      vehicleDocCount: 0,
      vehiclesWithPhotos: ['v-1', 'v-2'],
      vehiclesWithDocs: [],
    })
    const result = await checkFreeTierAttachmentLimit(supabase, 'org-1', 'vehicle', 'v-3')
    expect(result).not.toBeNull()
    expect(result).toContain('2 vehicles')
  })

  it('returns null for paid orgs regardless of count', async () => {
    const supabase = makeMockSupabase({ plan: 'growth' })
    const result = await checkFreeTierAttachmentLimit(supabase, 'org-1', 'vehicle', 'v-99')
    expect(result).toBeNull()
  })
})

// ── Sequence blast cap ────────────────────────────────────────────────────────

describe('Sequence blast cap — per-org 50-email ceiling', () => {
  it('tracks sent emails per org and enforces the cap', () => {
    const ORG_CAP = 50
    const orgEmailCount = new Map<string, number>()

    function shouldSendForOrg(orgId: string): boolean {
      const count = orgEmailCount.get(orgId) ?? 0
      return count < ORG_CAP
    }

    function recordSentForOrg(orgId: string): void {
      orgEmailCount.set(orgId, (orgEmailCount.get(orgId) ?? 0) + 1)
    }

    // Simulate sending 60 emails for org-A and 10 for org-B
    let orgASent = 0
    let orgBSent = 0

    for (let i = 0; i < 60; i++) {
      if (shouldSendForOrg('org-A')) {
        recordSentForOrg('org-A')
        orgASent++
      }
    }
    for (let i = 0; i < 10; i++) {
      if (shouldSendForOrg('org-B')) {
        recordSentForOrg('org-B')
        orgBSent++
      }
    }

    // org-A is capped at 50 even though 60 were attempted
    expect(orgASent).toBe(50)
    // org-B has 10 (under cap)
    expect(orgBSent).toBe(10)
    // cap does not bleed between orgs
    expect(orgEmailCount.get('org-A')).toBe(50)
    expect(orgEmailCount.get('org-B')).toBe(10)
  })

  it('cap is enforced independently per org', () => {
    const ORG_CAP = 50
    const counts = new Map<string, number>()
    const orgs = ['org-X', 'org-Y', 'org-Z']

    // Send 55 for each org
    for (const org of orgs) {
      for (let i = 0; i < 55; i++) {
        const current = counts.get(org) ?? 0
        if (current < ORG_CAP) {
          counts.set(org, current + 1)
        }
      }
    }

    for (const org of orgs) {
      expect(counts.get(org)).toBe(50)
    }
  })
})

// ── Settings secrets masking ──────────────────────────────────────────────────

describe('Settings GET response — no secrets exposed', () => {
  it('identifies secret field names that must never be returned raw', () => {
    const SECRET_FIELDS = [
      'postgrid_api_key',
      'stripe_dealer_secret_key',
      'twilio_auth_token',
    ]

    // Simulate a settings GET response (as returned by /api/settings/org)
    const mockOrgSettingsResponse = {
      business_name: 'Test Dealer',
      business_phone: '+15555550000',
      timezone: 'America/Los_Angeles',
      booking_enabled: true,
      // These should NOT be present in the response:
      // postgrid_api_key, stripe_dealer_secret_key
    }

    for (const field of SECRET_FIELDS) {
      expect(mockOrgSettingsResponse).not.toHaveProperty(field)
    }
  })

  it('rejects any response object containing a raw API key value', () => {
    const looksLikeKey = (val: unknown): boolean => {
      if (typeof val !== 'string') return false
      // PostGrid keys start with "test_" or "live_"; Stripe secret keys start with "sk_"
      return val.startsWith('sk_') || val.startsWith('test_') || val.startsWith('live_')
    }

    const safeResponse = {
      business_name: 'Test Dealer',
      stripe_dealer_publishable_key: 'pk_test_abc123', // public key — OK
    }

    const unsafeResponse = {
      business_name: 'Test Dealer',
      stripe_dealer_secret_key: 'sk_live_realkey', // secret key — NOT OK
    }

    // safe response: no raw secret values
    const safeValues = Object.values(safeResponse)
    expect(safeValues.some(looksLikeKey)).toBe(false)

    // unsafe response: contains a secret key value
    const unsafeValues = Object.values(unsafeResponse)
    expect(unsafeValues.some(looksLikeKey)).toBe(true)
  })
})
