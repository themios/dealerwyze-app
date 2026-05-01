import { describe, expect, it, vi } from 'vitest'

import { makeTestClient } from './helpers/testClient'

vi.mock('server-only', () => ({}))

const { supabase, ORG_ID } = makeTestClient()

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => supabase,
}))

describe('buildCoachingDigestForOrg', () => {
  it('renders without error on empty week', async () => {
    supabase._table('organizations').then = vi.fn().mockImplementation(
      (resolve: (value: unknown) => unknown) => resolve({ data: { id: ORG_ID, name: 'Test Dealer' }, error: null }),
    )
    supabase._table('org_settings').then = vi.fn().mockImplementation(
      (resolve: (value: unknown) => unknown) => resolve({ data: { org_id: ORG_ID, performance_cache: {} }, error: null }),
    )
    supabase._table('lost_lead_audit').then = vi.fn().mockImplementation(
      (resolve: (value: unknown) => unknown) => resolve({ data: [], error: null }),
    )
    supabase._table('v_rep_reply_rates').then = vi.fn().mockImplementation(
      (resolve: (value: unknown) => unknown) => resolve({ data: [], error: null }),
    )

    const { buildCoachingDigestForOrg } = await import('@/lib/intelligence/coachingDigest')
    const result = await buildCoachingDigestForOrg({ orgId: ORG_ID, supabase })
    expect(result.ok).toBe(true)
    expect(result.text).toContain('Weekly Coaching Digest')
  })

  it('does not include rep names in output', async () => {
    supabase._table('organizations').then = vi.fn().mockImplementation(
      (resolve: (value: unknown) => unknown) => resolve({ data: { id: ORG_ID, name: 'Test Dealer' }, error: null }),
    )
    supabase._table('org_settings').then = vi.fn().mockImplementation(
      (resolve: (value: unknown) => unknown) => resolve({ data: { org_id: ORG_ID, performance_cache: {} }, error: null }),
    )
    supabase._table('lost_lead_audit').then = vi.fn().mockImplementation(
      (resolve: (value: unknown) => unknown) => resolve({
        data: [{
          root_cause_needs_review: false,
          root_cause_json: {
            failure_mode: 'no_response_first_touch',
            inflection_activity_index: 1,
            rep_controllable: true,
            coaching_note: 'Customer never replied after the first message.',
            confidence: 0.8,
          },
          root_cause_ran_at: '2026-05-01T00:00:00.000Z',
        }],
        error: null,
      }),
    )
    supabase._table('v_rep_reply_rates').then = vi.fn().mockImplementation(
      (resolve: (value: unknown) => unknown) => resolve({ data: [], error: null }),
    )

    const { buildCoachingDigestForOrg } = await import('@/lib/intelligence/coachingDigest')
    const result = await buildCoachingDigestForOrg({ orgId: ORG_ID, supabase })
    expect(result.ok).toBe(true)
    expect(result.text).not.toContain('Rep One')
    // Allow the word "rep" generically; enforce that no individual names appear.
    expect(result.text).not.toContain('Peer')
  })

  it('excludes pattern insights with N < 10', async () => {
    supabase._table('organizations').then = vi.fn().mockImplementation(
      (resolve: (value: unknown) => unknown) => resolve({ data: { id: ORG_ID, name: 'Test Dealer' }, error: null }),
    )
    supabase._table('org_settings').then = vi.fn().mockImplementation(
      (resolve: (value: unknown) => unknown) => resolve({
        data: {
          org_id: ORG_ID,
          performance_cache: {
            messagingPatterns: {
              responseTimeBuckets: [{ hour: 10, sampleSize: 9, replyRate: 90 }],
              sequenceStepDropoff: [{ sequenceId: 's', sequenceName: 'Seq', stepNumber: 1, sampleSize: 9, silenceRate: 80 }],
            },
          },
        },
        error: null,
      }),
    )
    supabase._table('lost_lead_audit').then = vi.fn().mockImplementation(
      (resolve: (value: unknown) => unknown) => resolve({ data: [], error: null }),
    )
    supabase._table('v_rep_reply_rates').then = vi.fn().mockImplementation(
      (resolve: (value: unknown) => unknown) => resolve({ data: [], error: null }),
    )

    const { buildCoachingDigestForOrg } = await import('@/lib/intelligence/coachingDigest')
    const result = await buildCoachingDigestForOrg({ orgId: ORG_ID, supabase })
    expect(result.ok).toBe(true)
    expect(result.text).not.toContain('10am')
    expect(result.text).not.toContain('Seq')
  })
})

