/**
 * TEST-07: Booking and unsubscribe route tests
 *
 * Covers correct behavior, Zod validation, and abuse resistance
 * for the booking and unsubscribe public endpoints.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import crypto from 'crypto'

vi.mock('server-only', () => ({}))

// ── Hoisted mocks ─────────────────────────────────────────────────────────────
const { mockMaybeSingle, mockInsert, mockUpdate, mockBookingLimiter } = vi.hoisted(() => ({
  mockMaybeSingle: vi.fn(),
  mockInsert:      vi.fn().mockResolvedValue({ data: { id: 'appt-1' }, error: null }),
  mockUpdate:      vi.fn().mockResolvedValue({ error: null }),
  mockBookingLimiter: vi.fn().mockResolvedValue({ allowed: true }),
}))

// Chainable query stub — every method returns itself so any chain resolves
function makeChain(): Record<string, unknown> {
  const chain: Record<string, unknown> = {}
  const methods = ['select','eq','neq','ilike','or','not','limit','order','in','is','single','maybeSingle','insert','update','upsert','delete']
  methods.forEach(m => { chain[m] = vi.fn().mockReturnValue(chain) })
  chain.maybeSingle = mockMaybeSingle
  chain.single      = mockInsert
  return chain
}

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({ from: () => makeChain() }),
}))

vi.mock('@/lib/rateLimit/upstash', () => ({
  bookingLimiter: mockBookingLimiter,
  webLeadLimiter: vi.fn().mockResolvedValue({ allowed: true }),
}))

vi.mock('@/lib/email/notify', () => ({ sendNotificationEmail: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/sms/sendOutbound', () => ({ sendOutboundSms: vi.fn().mockResolvedValue({ sid: 'SM123' }) }))

const SLUG = 'test-dealer'
const VALID_BOOKING = {
  name: 'Jane Doe',
  phone: '+15551234567',
  date: '2026-05-10',
  time: '14:00',
}

function makeBookingReq(body: unknown, slug = SLUG): NextRequest {
  return new NextRequest(`https://dealerwyze.com/api/book/${slug}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockBookingLimiter.mockResolvedValue({ allowed: true })
  mockMaybeSingle.mockResolvedValue({
    data: { org_id: 'org-1', id: 'slug-1', booking_enabled: true, business_name: 'Test Dealer' },
    error: null,
  })
  mockInsert.mockResolvedValue({ data: { id: 'appt-1' }, error: null })
})

// ── Booking tests ─────────────────────────────────────────────────────────────

describe('POST /api/book/[slug] — booking route', () => {
  it('returns 200 on valid booking', async () => {
    const { POST } = await import('@/app/api/book/[slug]/route')
    const res = await POST(makeBookingReq(VALID_BOOKING), { params: Promise.resolve({ slug: SLUG }) })
    expect(res.status).toBe(200)
  })

  it('returns 400 when name is missing', async () => {
    const { POST } = await import('@/app/api/book/[slug]/route')
    const res = await POST(makeBookingReq({ ...VALID_BOOKING, name: '' }), { params: Promise.resolve({ slug: SLUG }) })
    expect(res.status).toBe(400)
  })

  it('returns 400 when date format is invalid', async () => {
    const { POST } = await import('@/app/api/book/[slug]/route')
    const res = await POST(makeBookingReq({ ...VALID_BOOKING, date: '10/05/2026' }), { params: Promise.resolve({ slug: SLUG }) })
    expect(res.status).toBe(400)
  })

  it('returns 400 when time format is invalid', async () => {
    const { POST } = await import('@/app/api/book/[slug]/route')
    const res = await POST(makeBookingReq({ ...VALID_BOOKING, time: '2pm' }), { params: Promise.resolve({ slug: SLUG }) })
    expect(res.status).toBe(400)
  })

  it('returns 400 when neither phone nor email provided', async () => {
    const { POST } = await import('@/app/api/book/[slug]/route')
    const res = await POST(makeBookingReq({ name: 'Jane', date: '2026-05-10', time: '14:00' }), { params: Promise.resolve({ slug: SLUG }) })
    expect(res.status).toBe(400)
  })

  it('returns 200 silently when honeypot website field is filled', async () => {
    const { POST } = await import('@/app/api/book/[slug]/route')
    const res = await POST(makeBookingReq({ ...VALID_BOOKING, website: 'http://spam.com' }), { params: Promise.resolve({ slug: SLUG }) })
    // Should return 200 silently without processing (bot trap)
    expect(res.status).toBe(200)
  })

  it('returns 429 when rate limited', async () => {
    mockBookingLimiter.mockResolvedValue({ allowed: false, retryAfterSeconds: 60 })
    const { POST } = await import('@/app/api/book/[slug]/route')
    const res = await POST(makeBookingReq(VALID_BOOKING), { params: Promise.resolve({ slug: SLUG }) })
    expect(res.status).toBe(429)
  })

  it('returns 404 when slug not found', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null })
    const { POST } = await import('@/app/api/book/[slug]/route')
    const res = await POST(makeBookingReq(VALID_BOOKING), { params: Promise.resolve({ slug: 'unknown' }) })
    expect(res.status).toBe(404)
  })
})

// ── Unsubscribe tests ─────────────────────────────────────────────────────────

const UNSUBSCRIBE_SECRET = 'test-secret-32-chars-xxxxxxxxxxxxxxxxxx'
const VALID_CID = '00000000-0000-0000-0000-000000000001'

function makeUnsubscribeToken(cid: string, secret = UNSUBSCRIBE_SECRET): string {
  return crypto.createHmac('sha256', secret).update(cid).digest('hex')
}

function makeUnsubReq(token: string, cid: string): NextRequest {
  return new NextRequest(`https://dealerwyze.com/api/unsubscribe?token=${token}&cid=${cid}`)
}

beforeEach(() => {
  process.env.UNSUBSCRIBE_SECRET = UNSUBSCRIBE_SECRET
  mockUpdate.mockResolvedValue({ error: null })
  // For unsubscribe, from() needs to return different chains
  // Mock the customer_sequences select
})

describe('GET /api/unsubscribe — unsubscribe route', () => {
  it('returns 400 when token is missing', async () => {
    const { GET } = await import('@/app/api/unsubscribe/route')
    const req = new NextRequest('https://dealerwyze.com/api/unsubscribe?cid=' + VALID_CID)
    const res = await GET(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 when cid is not a valid UUID', async () => {
    const { GET } = await import('@/app/api/unsubscribe/route')
    const req = new NextRequest(`https://dealerwyze.com/api/unsubscribe?token=abc&cid=not-a-uuid`)
    const res = await GET(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 when token has invalid characters', async () => {
    const { GET } = await import('@/app/api/unsubscribe/route')
    const req = makeUnsubReq('not-hex!!', VALID_CID)
    const res = await GET(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 when HMAC does not match', async () => {
    const { GET } = await import('@/app/api/unsubscribe/route')
    const wrongToken = makeUnsubscribeToken('different-cid')
    const res = await GET(makeUnsubReq(wrongToken, VALID_CID))
    expect(res.status).toBe(400)
  })
})
