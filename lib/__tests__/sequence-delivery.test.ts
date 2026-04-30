/**
 * Sequence delivery idempotency tests
 *
 * Verifies the atomic claim-before-send pattern:
 *   - When the DB claim UPDATE returns rows, the email is sent
 *   - When the DB claim UPDATE returns 0 rows (another instance claimed it first),
 *     the email is NOT sent (prevents double-delivery on overlapping cron runs)
 *   - When sendSequenceEmail fails, the activity is marked failed and sequenceSent=0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeTestClient } from './helpers/testClient'

const { supabase } = makeTestClient()

vi.mock('server-only', () => ({}))

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => supabase,
}))

vi.mock('@/lib/sequences/stopSequenceOnReply', () => ({
  stopSequenceOnReply: vi.fn().mockResolvedValue(undefined),
}))

const mockSendEmail = vi.fn()
vi.mock('@/lib/email/sendSequenceEmail', () => ({
  sendSequenceEmail: mockSendEmail,
}))

import { runSequenceDelivery } from '@/lib/cron/jobs/sequenceDelivery'

/** An activity row with valid JSON body for sequence email dispatch. */
const ACT_ROW = {
  id:                   'act-1',
  user_id:              'org-1',
  customer_id:          'cust-1',
  sequence_day:         1,
  customer_sequence_id: 'cs-1',
  body: JSON.stringify({
    to:            'customer@example.com',
    subject:       'Follow up',
    body:          'Hi {firstName}, checking in.',
    step_label:    'Day 1',
    customer_name: 'John Smith',
  }),
}

/**
 * Wire up the mock supabase stubs for a single sequence activity.
 * Returns the activities stub for further configuration of the claim call.
 */
function setupMocks(claimResult: { data: { id: string }[] | null; error: null }) {
  // Main activities select (call 1)
  // Inbound replies select (call 2)
  // Claim update (call 3)
  supabase._table('activities').then = vi.fn()
    .mockImplementationOnce((resolve: (v: unknown) => unknown) =>
      resolve({ data: [ACT_ROW], error: null }))
    .mockImplementationOnce((resolve: (v: unknown) => unknown) =>
      resolve({ data: [], error: null }))          // no inbound replies
    .mockImplementationOnce((resolve: (v: unknown) => unknown) =>
      resolve(claimResult))

  // Orgs plan check — active plan (not free)
  supabase._table('organizations').then = vi.fn().mockImplementation(
    (resolve: (v: unknown) => unknown) =>
      resolve({ data: [{ id: 'org-1', plan: 'active' }], error: null }),
  )

  // Enrollment data
  supabase._table('customer_sequences').then = vi.fn().mockImplementation(
    (resolve: (v: unknown) => unknown) =>
      resolve({ data: [{ id: 'cs-1', enrolled_at: '2026-01-01T00:00:00Z' }], error: null }),
  )

  // Customer data
  supabase._table('customers').then = vi.fn().mockImplementation(
    (resolve: (v: unknown) => unknown) =>
      resolve({ data: [{ id: 'cust-1', name: 'John Smith', user_id: 'org-1' }], error: null }),
  )
}

describe('sequence delivery — atomic claim', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSendEmail.mockResolvedValue({ ok: true })
  })

  it('sends the email when the DB claim succeeds (rows returned)', async () => {
    setupMocks({ data: [{ id: 'act-1' }], error: null })

    const result = await runSequenceDelivery(supabase as unknown as Parameters<typeof runSequenceDelivery>[0])

    expect(mockSendEmail).toHaveBeenCalledOnce()
    expect(result.sequenceSent).toBe(1)
  })

  it('skips the email when the DB claim returns 0 rows (already claimed by another instance)', async () => {
    setupMocks({ data: [], error: null })

    const result = await runSequenceDelivery(supabase as unknown as Parameters<typeof runSequenceDelivery>[0])

    expect(mockSendEmail).not.toHaveBeenCalled()
    expect(result.sequenceSent).toBe(0)
  })

  it('marks the activity as failed and does not count as sent when sendSequenceEmail errors', async () => {
    // Set up 4 sequential activities.then responses:
    //   1. main select → activity list
    //   2. inbound replies → none
    //   3. claim update → claimed (1 row)
    //   4. failure update → ok
    supabase._table('activities').then = vi.fn()
      .mockImplementationOnce((resolve: (v: unknown) => unknown) =>
        resolve({ data: [ACT_ROW], error: null }))
      .mockImplementationOnce((resolve: (v: unknown) => unknown) =>
        resolve({ data: [], error: null }))
      .mockImplementationOnce((resolve: (v: unknown) => unknown) =>
        resolve({ data: [{ id: 'act-1' }], error: null }))
      .mockImplementationOnce((resolve: (v: unknown) => unknown) =>
        resolve({ data: null, error: null }))

    supabase._table('organizations').then = vi.fn().mockImplementation(
      (resolve: (v: unknown) => unknown) =>
        resolve({ data: [{ id: 'org-1', plan: 'active' }], error: null }),
    )
    supabase._table('customer_sequences').then = vi.fn().mockImplementation(
      (resolve: (v: unknown) => unknown) =>
        resolve({ data: [{ id: 'cs-1', enrolled_at: '2026-01-01T00:00:00Z' }], error: null }),
    )
    supabase._table('customers').then = vi.fn().mockImplementation(
      (resolve: (v: unknown) => unknown) =>
        resolve({ data: [{ id: 'cust-1', name: 'John Smith', user_id: 'org-1' }], error: null }),
    )
    mockSendEmail.mockResolvedValueOnce({ ok: false, error: 'gmail_send_failed' })

    const result = await runSequenceDelivery(supabase as unknown as Parameters<typeof runSequenceDelivery>[0])

    expect(mockSendEmail).toHaveBeenCalledOnce()
    expect(result.sequenceSent).toBe(0)
    const updateCalls = supabase._table('activities').update.mock.calls as Array<[Record<string, unknown>]>
    expect(updateCalls.some(([arg]) => arg.outcome === 'failed')).toBe(true)
  })
})
