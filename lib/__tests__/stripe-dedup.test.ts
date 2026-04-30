/**
 * Stripe webhook durable deduplication tests
 *
 * Verifies that:
 *   - Invalid signatures are rejected (400)
 *   - First delivery of an event is processed (200 { received: true })
 *   - Duplicate events (23505 unique violation) are silently acknowledged (200 { duplicate: true })
 *   - Unexpected DB errors cause a 500 so Stripe retries
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { makeTestClient } from './helpers/testClient'

const { supabase } = makeTestClient()

vi.mock('server-only', () => ({}))

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => supabase,
}))

// vi.hoisted ensures the variable is available when the vi.mock factory is evaluated
const mockConstructEvent = vi.hoisted(() => vi.fn())

vi.mock('@/lib/stripe', () => ({
  stripe: {
    webhooks:      { constructEvent: mockConstructEvent },
    subscriptions: { retrieve: vi.fn() },
  },
  tierFromPriceId:        vi.fn().mockReturnValue('growth'),
  smsTierFromPriceId:     vi.fn().mockReturnValue(null),
  storagePackFromPriceId: vi.fn().mockReturnValue(null),
  PLAN_QUOTA:             { growth: 500, starter: 200, pro: 1000, elite: 2000 },
  SMS_TIER_QUOTA:         {},
  STORAGE_PACK_QUOTA:     {},
}))

vi.mock('@/lib/email/notify', () => ({
  sendNotificationEmail: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/stripe/commissions', () => ({
  recordCommission: vi.fn().mockResolvedValue(undefined),
}))

import { POST } from '@/app/api/stripe/webhook/route'

/** Fake event with a type that has no handler — falls through switch with no side effects. */
const FAKE_EVENT = {
  id:   'evt_test_abc123',
  type: 'payment_method.attached',
  data: { object: {} },
}

function makeReq(body = 'raw-body', sig = 'stripe-sig') {
  return new NextRequest('http://localhost/api/stripe/webhook', {
    method:  'POST',
    headers: { 'stripe-signature': sig, 'content-type': 'text/plain' },
    body,
  })
}

describe('Stripe webhook deduplication', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 400 for an invalid signature', async () => {
    mockConstructEvent.mockImplementationOnce(() => { throw new Error('Signature verification failed') })

    // Security events insert happens fire-and-forget
    supabase._table('security_events').then = vi.fn().mockImplementation(
      (resolve: (v: unknown) => unknown) => resolve({ data: null, error: null }),
    )

    const res = await POST(makeReq())
    expect(res.status).toBe(400)
    const json = await res.json() as { error: string }
    expect(json.error).toBe('Invalid signature')
  })

  it('processes a new event and returns { received: true }', async () => {
    mockConstructEvent.mockReturnValueOnce(FAKE_EVENT)

    // Dedup insert succeeds (no conflict) → event is new
    supabase._table('processed_stripe_events').then = vi.fn().mockImplementation(
      (resolve: (v: unknown) => unknown) => resolve({ data: [{ event_id: FAKE_EVENT.id }], error: null }),
    )

    const res = await POST(makeReq())
    expect(res.status).toBe(200)
    const json = await res.json() as { received: boolean; duplicate?: boolean }
    expect(json.received).toBe(true)
    expect(json.duplicate).toBeUndefined()
  })

  it('returns 200 { duplicate: true } when the event was already processed (23505)', async () => {
    mockConstructEvent.mockReturnValueOnce(FAKE_EVENT)

    // Dedup insert returns unique_violation — already processed
    supabase._table('processed_stripe_events').then = vi.fn().mockImplementation(
      (resolve: (v: unknown) => unknown) =>
        resolve({ data: null, error: { code: '23505', message: 'duplicate key value' } }),
    )

    const res = await POST(makeReq())
    expect(res.status).toBe(200)
    const json = await res.json() as { received: boolean; duplicate: boolean }
    expect(json.received).toBe(true)
    expect(json.duplicate).toBe(true)

    // Verify the insert was attempted with the correct event_id
    const insertArg = supabase._table('processed_stripe_events').insert.mock.calls[0]?.[0] as Record<string, string>
    expect(insertArg?.event_id).toBe(FAKE_EVENT.id)
  })

  it('returns 500 for unexpected DB errors so Stripe retries', async () => {
    mockConstructEvent.mockReturnValueOnce(FAKE_EVENT)

    supabase._table('processed_stripe_events').then = vi.fn().mockImplementation(
      (resolve: (v: unknown) => unknown) =>
        resolve({ data: null, error: { code: '08006', message: 'connection failure' } }),
    )

    const res = await POST(makeReq())
    expect(res.status).toBe(500)
  })
})
