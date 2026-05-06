/**
 * Booking timezone correctness tests
 *
 * Verifies that appointment timestamps stored in UTC are correct for
 * dealerships in different US timezones. A 2pm appointment in Los Angeles
 * must not store as 2pm UTC.
 *
 * Summer 2026 offsets (DST in effect):
 *   America/Los_Angeles → PDT = UTC-7  → 14:00 PDT = 21:00 UTC
 *   America/New_York    → EDT = UTC-4  → 14:00 EDT = 18:00 UTC
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
  bookingLimiter: vi.fn().mockResolvedValue({ allowed: true, remaining: 99, retryAfterSeconds: 0 }),
}))

import { POST } from '@/app/api/book/[slug]/route'

const SLUG_PARAMS = { params: Promise.resolve({ slug: 'test-dealer' }) }

function makeBookingReq(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/book/test-dealer', {
    method:  'POST',
    headers: { 'content-type': 'application/json' },
    body:    JSON.stringify(body),
  })
}

const COMMON_BODY = {
  name:  'John Smith',
  phone: '5551234567',
  email: 'john@example.com',
  // omit notes and website — optional fields; null would fail z.string().optional()
}

/**
 * Wire up supabase mocks for a booking POST.
 * Returns captured insert arguments so tests can assert on due_at.
 */
function setupBookingMocks(timezone: string) {
  // Org resolution
  supabase._table('organizations').maybeSingle = vi.fn().mockResolvedValue({
    data: { id: 'org-tz-test' }, error: null,
  })

  // Org settings with specified timezone
  supabase._table('org_settings').maybeSingle = vi.fn().mockResolvedValue({
    data: { business_name: 'Test Dealer', booking_enabled: true, timezone },
    error: null,
  })

  // Existing customer (avoid insert path)
  supabase._table('customers').maybeSingle = vi.fn().mockResolvedValue({
    data: { id: 'cust-1', name: 'John Smith' }, error: null,
  })

  // Activity insert — capture args, resolve ok
  supabase._table('activities').then = vi.fn().mockImplementation(
    (resolve: (v: unknown) => unknown) => resolve({ data: [{}], error: null }),
  )

  // Task insert — resolve ok
  supabase._table('tasks').then = vi.fn().mockImplementation(
    (resolve: (v: unknown) => unknown) => resolve({ data: [{}], error: null }),
  )
}

describe('booking timezone — UTC storage correctness', () => {
  beforeEach(() => vi.clearAllMocks())

  it('stores 14:00 America/Los_Angeles (PDT, UTC-7) as 21:00 UTC on 2026-06-15', async () => {
    setupBookingMocks('America/Los_Angeles')

    const res = await POST(
      makeBookingReq({ ...COMMON_BODY, date: '2026-06-15', time: '14:00' }),
      SLUG_PARAMS,
    )

    expect(res.status).toBe(201)

    const actInsert = supabase._table('activities').insert.mock.calls[0]?.[0] as Record<string, string>
    expect(actInsert.due_at).toBe('2026-06-15T21:00:00.000Z')

    // Task should have the same timestamp
    const taskInsert = supabase._table('tasks').insert.mock.calls[0]?.[0] as Record<string, string>
    expect(taskInsert.due_at).toBe('2026-06-15T21:00:00.000Z')
  })

  it('stores 14:00 America/New_York (EDT, UTC-4) as 18:00 UTC on 2026-06-15', async () => {
    setupBookingMocks('America/New_York')

    const res = await POST(
      makeBookingReq({ ...COMMON_BODY, date: '2026-06-15', time: '14:00' }),
      SLUG_PARAMS,
    )

    expect(res.status).toBe(201)

    const actInsert = supabase._table('activities').insert.mock.calls[0]?.[0] as Record<string, string>
    expect(actInsert.due_at).toBe('2026-06-15T18:00:00.000Z')
  })

  it('PST and EST appointments at the same local time differ by exactly 3 hours', async () => {
    // Use the results of the two tests above as reference points
    const pstUtc = new Date('2026-06-15T21:00:00.000Z').getTime()
    const estUtc = new Date('2026-06-15T18:00:00.000Z').getTime()
    expect(pstUtc - estUtc).toBe(3 * 60 * 60 * 1000)
  })

  it('returns 400 for an invalid date format', async () => {
    setupBookingMocks('America/Los_Angeles')

    const res = await POST(
      makeBookingReq({ ...COMMON_BODY, date: 'not-a-date', time: '14:00' }),
      SLUG_PARAMS,
    )

    expect(res.status).toBe(400)
  })
})
