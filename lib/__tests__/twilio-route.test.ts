/**
 * Route-level Twilio inbound webhook tests (TEST-06 route coverage)
 *
 * Tests that the actual POST handler rejects requests with invalid
 * X-Twilio-Signature and accepts valid ones — not just the math.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import crypto from 'crypto'

vi.mock('server-only', () => ({}))

// ── Hoist mocks ──────────────────────────────────────────────────────────────
const { mockGetOrgIdByPhone, mockFrom } = vi.hoisted(() => ({
  mockGetOrgIdByPhone: vi.fn().mockResolvedValue(null),
  mockFrom: vi.fn().mockReturnValue({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null }),
    insert: vi.fn().mockResolvedValue({ error: null }),
    update: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockResolvedValue({ error: null }),
  }),
}))

vi.mock('@/lib/orgs/lookup', () => ({ getOrgIdByPhone: mockGetOrgIdByPhone }))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => ({ from: mockFrom }) }))
vi.mock('@/lib/push/send', () => ({ sendLeadNotification: vi.fn() }))
vi.mock('@/lib/notifications/telegram', () => ({ sendTelegramMessage: vi.fn() }))
vi.mock('@/lib/sms/detectAppointment', () => ({ detectAppointment: vi.fn().mockResolvedValue(null) }))
vi.mock('@/lib/sms/quota', () => ({ incrementUsage: vi.fn().mockResolvedValue(true) }))
vi.mock('@/lib/sms/threadState', () => ({ transitionThreadState: vi.fn().mockResolvedValue(null) }))
vi.mock('@/lib/sms/parseDealerCommand', () => ({ parseDealerAppointment: vi.fn().mockReturnValue(null) }))
vi.mock('@/lib/leads/parseOfferUpSms', () => ({ isOfferUpLead: vi.fn().mockReturnValue(false), parseOfferUpLead: vi.fn() }))
vi.mock('@/lib/google/calendar', () => ({ createCalendarEvent: vi.fn() }))
vi.mock('@/lib/sequences/stopSequenceOnReply', () => ({ stopSequenceOnReply: vi.fn(), cancelSequenceOnUnsubscribe: vi.fn() }))
vi.mock('@/lib/webhooks/dispatch', () => ({ dispatchWebhook: vi.fn() }))
vi.mock('@/lib/utils/phone', () => ({ normalizePhone: (p: string) => p }))

import { POST } from '@/app/api/twilio/inbound/route'

// ── Helpers ──────────────────────────────────────────────────────────────────

const AUTH_TOKEN = 'test-auth-token'
const WEBHOOK_URL = 'https://dealerwyze.com/api/twilio/inbound'

function sign(params: Record<string, string>): string {
  const sorted = Object.keys(params).sort().reduce((s, k) => s + k + params[k], '')
  return crypto.createHmac('sha1', AUTH_TOKEN).update(WEBHOOK_URL + sorted).digest('base64')
}

function makeRequest(params: Record<string, string>, signature: string): NextRequest {
  return new NextRequest(WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'x-twilio-signature': signature,
    },
    body: new URLSearchParams(params).toString(),
  })
}

const baseParams = { From: '+15551234567', To: '+15559876543', Body: 'Hello', MessageSid: 'SM123' }

beforeEach(() => {
  vi.clearAllMocks()
  process.env.TWILIO_AUTH_TOKEN = AUTH_TOKEN
  process.env.NEXT_PUBLIC_APP_URL = 'https://dealerwyze.com'
  process.env.TWILIO_LEGACY_FALLBACK_ENABLED = 'false'
})

// ── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/twilio/inbound — signature enforcement', () => {
  it('returns 403 when X-Twilio-Signature header is missing', async () => {
    const req = new NextRequest(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(baseParams).toString(),
    })
    const res = await POST(req)
    expect(res.status).toBe(403)
  })

  it('returns 403 when signature is incorrect', async () => {
    const res = await POST(makeRequest(baseParams, 'bad-signature'))
    expect(res.status).toBe(403)
  })

  it('returns 403 when signature is for different params', async () => {
    const wrongSig = sign({ ...baseParams, Body: 'tampered' })
    const res = await POST(makeRequest(baseParams, wrongSig))
    expect(res.status).toBe(403)
  })

  it('returns 200 TwiML when signature is valid', async () => {
    const sig = sign(baseParams)
    const res = await POST(makeRequest(baseParams, sig))
    // Valid sig → processes message → 200 with TwiML (even if org lookup returns null)
    expect(res.status).toBe(200)
  })

  it('returns 200 TwiML for opt-out keyword with valid sig', async () => {
    const params = { ...baseParams, Body: 'STOP' }
    const sig = sign(params)
    const res = await POST(makeRequest(params, sig))
    expect(res.status).toBe(200)
  })
})
