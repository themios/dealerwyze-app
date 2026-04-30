/**
 * TEST-07: Public ingestion route tests
 *
 * Verifies web lead capture:
 *   - Happy path: valid body inserts lead and returns { ok: true }
 *   - Honeypot: filled website field returns 200 without side effects
 *   - Validation: missing required fields returns 400 with field-level errors
 *   - Validation: oversized fields rejected
 *   - Org resolution: unknown slug returns 404
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { makeTestClient } from './helpers/testClient'

const { supabase } = makeTestClient()

vi.mock('server-only', () => ({}))

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => supabase,
}))

vi.mock('@/lib/rateLimit/upstash', () => ({
  webLeadLimiter: vi.fn().mockResolvedValue({ allowed: true, remaining: 99, retryAfterSeconds: 0 }),
}))

vi.mock('@/lib/vdp/notifyDealer', () => ({
  notifyDealerNewLead: vi.fn().mockResolvedValue(undefined),
}))

import { POST } from '@/app/api/leads/web/route'
import { webLeadLimiter } from '@/lib/rateLimit/upstash'

const mockedRateLimit = vi.mocked(webLeadLimiter)

function makeReq(body: unknown): NextRequest {
  return new Request('http://localhost/api/leads/web', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest
}

const VALID_BODY = {
  slug:  'apollo-auto',
  name:  'John Smith',
  phone: '5551234567',
  email: 'john@example.com',
}

describe('web lead capture — happy path', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedRateLimit.mockResolvedValue({ allowed: true, remaining: 99, retryAfterSeconds: 0 })

    // Org resolution
    supabase._table('organizations').single.mockResolvedValueOnce({
      data: { id: 'org-1', name: 'Apollo Auto', slug: 'apollo-auto', public_inventory_enabled: true },
      error: null,
    })

    // No vehicle slug in request
    supabase._table('inventory_inquiries').then = vi.fn().mockImplementation((r: (v: unknown) => void) => r({ data: {}, error: null }))
    supabase._table('activities').then = vi.fn().mockImplementation((r: (v: unknown) => void) => r({ data: {}, error: null }))
  })

  it('returns 200 with ok:true for valid submission', async () => {
    const res = await POST(makeReq(VALID_BODY))
    expect(res.status).toBe(200)
    const json = await res.json() as { ok: boolean }
    expect(json.ok).toBe(true)
  })

  it('scopes org lookup to slug, not a caller-supplied org_id', async () => {
    await POST(makeReq(VALID_BODY))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orgCalls = (supabase._table('organizations').eq as any).mock.calls as [string, unknown][]
    expect(orgCalls.some(([col, val]) => col === 'slug' && val === 'apollo-auto')).toBe(true)
    // Must not accept an org_id from the body
    expect(orgCalls.some(([col]) => col === 'id')).toBe(false)
  })
})

describe('web lead capture — honeypot', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 200 silently when honeypot field is filled', async () => {
    const res = await POST(makeReq({ ...VALID_BODY, website: 'http://spammer.com' }))
    expect(res.status).toBe(200)
    const json = await res.json() as { ok: boolean }
    expect(json.ok).toBe(true)
    // Must not have inserted anything
    expect(supabase._table('inventory_inquiries').insert).not.toHaveBeenCalled()
  })
})

describe('web lead capture — Zod validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedRateLimit.mockResolvedValue({ allowed: true, remaining: 99, retryAfterSeconds: 0 })
  })

  it('returns 400 when name is missing', async () => {
    const res = await POST(makeReq({ slug: 'apollo-auto', phone: '5551234567' }))
    expect(res.status).toBe(400)
    const json = await res.json() as { error: string; fields?: unknown[] }
    expect(json.error).toBe('Validation failed')
  })

  it('returns 400 when slug is missing', async () => {
    const res = await POST(makeReq({ name: 'John', phone: '5551234567' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when neither phone nor email provided', async () => {
    const res = await POST(makeReq({ slug: 'apollo-auto', name: 'John' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid JSON body', async () => {
    const req = new Request('http://localhost/api/leads/web', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not-json',
    }) as unknown as NextRequest
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('rejects message over 2000 characters', async () => {
    const res = await POST(makeReq({ ...VALID_BODY, message: 'x'.repeat(2001) }))
    expect(res.status).toBe(400)
  })
})

describe('web lead capture — rate limiting', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 429 when rate limit is exceeded', async () => {
    mockedRateLimit.mockResolvedValueOnce({ allowed: false, remaining: 0, retryAfterSeconds: 60 })
    const res = await POST(makeReq(VALID_BODY))
    expect(res.status).toBe(429)
  })
})

describe('web lead capture — org resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedRateLimit.mockResolvedValue({ allowed: true, remaining: 99, retryAfterSeconds: 0 })
  })

  it('returns 404 for unknown slug', async () => {
    supabase._table('organizations').single.mockResolvedValueOnce({ data: null, error: null })
    const res = await POST(makeReq(VALID_BODY))
    expect(res.status).toBe(404)
  })
})
