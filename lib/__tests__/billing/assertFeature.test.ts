/**
 * Unit tests for assertCanUseFeature billing gate.
 *
 * Critical edges verified:
 *   - Suspended org is always blocked, even if trial is active (suspended check fires first)
 *   - Canceled org is always blocked, even if trial is active (canceled check fires second)
 *   - Active trial bypasses plan check for any feature
 *   - Expired trial + free plan is blocked for paid-tier features (not public_website — included on free)
 *   - Expired trial + paid plan is allowed
 *   - Unknown org throws BillingError
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeTestClient } from '../helpers/testClient'
import { BillingError } from '@/lib/billing/assertFeature'

const { supabase } = makeTestClient()

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => supabase,
}))

// Import after mocks are registered
const { assertCanUseFeature } = await import('@/lib/billing/assertFeature')

const FUTURE  = new Date(Date.now() + 30 * 24 * 3_600_000).toISOString()
const PAST    = new Date(Date.now() - 1 * 24 * 3_600_000).toISOString()

function mockOrg(row: Record<string, unknown> | null) {
  supabase._table('organizations').maybeSingle.mockResolvedValueOnce(
    row ? { data: row, error: null } : { data: null, error: null }
  )
}

describe('assertCanUseFeature', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('throws BillingError when org is not found', async () => {
    mockOrg(null)
    const err = await assertCanUseFeature('unknown-org', 'sms').catch(e => e)
    expect(err).toBeInstanceOf(BillingError)
    expect(err.message).toMatch(/account not found/i)
  })

  it('blocks suspended org even when trial is still active', async () => {
    mockOrg({ plan: 'free', suspended_at: PAST, canceled_at: null, trial_ends_at: FUTURE })
    await expect(assertCanUseFeature('org-1', 'public_website')).rejects.toThrow('suspended')
  })

  it('blocks canceled org even when trial is still active', async () => {
    mockOrg({ plan: 'free', suspended_at: null, canceled_at: PAST, trial_ends_at: FUTURE })
    await expect(assertCanUseFeature('org-1', 'public_website')).rejects.toThrow('canceled')
  })

  it('allows all features during active trial regardless of plan', async () => {
    mockOrg({ plan: 'free', suspended_at: null, canceled_at: null, trial_ends_at: FUTURE })
    await expect(assertCanUseFeature('org-1', 'public_website')).resolves.toBeUndefined()
  })

  it('allows paid features during active trial even for gated features', async () => {
    mockOrg({ plan: 'free', suspended_at: null, canceled_at: null, trial_ends_at: FUTURE })
    await expect(assertCanUseFeature('org-1', 'ai_reanalyze')).resolves.toBeUndefined()
  })

  it('blocks free plan after trial expires for paid-tier features', async () => {
    mockOrg({ plan: 'free', suspended_at: null, canceled_at: null, trial_ends_at: PAST })
    await expect(assertCanUseFeature('org-1', 'ai_reanalyze')).rejects.toThrow(BillingError)
  })

  it('allows public_website on free plan after trial expires', async () => {
    mockOrg({ plan: 'free', suspended_at: null, canceled_at: null, trial_ends_at: PAST })
    await expect(assertCanUseFeature('org-1', 'public_website')).resolves.toBeUndefined()
  })

  it('blocks free plan with no trial at all', async () => {
    mockOrg({ plan: 'free', suspended_at: null, canceled_at: null, trial_ends_at: null })
    await expect(assertCanUseFeature('org-1', 'ai_reanalyze')).rejects.toThrow(BillingError)
  })

  it('allows public_website on paid starter plan after trial expires', async () => {
    mockOrg({ plan: 'starter', suspended_at: null, canceled_at: null, trial_ends_at: PAST })
    await expect(assertCanUseFeature('org-1', 'public_website')).resolves.toBeUndefined()
  })

  it('allows ai_reanalyze on paid growth plan after trial expires', async () => {
    mockOrg({ plan: 'growth', suspended_at: null, canceled_at: null, trial_ends_at: PAST })
    await expect(assertCanUseFeature('org-1', 'ai_reanalyze')).resolves.toBeUndefined()
  })

  it('error message for free plan mentions upgrading', async () => {
    mockOrg({ plan: 'free', suspended_at: null, canceled_at: null, trial_ends_at: null })
    const err = await assertCanUseFeature('org-1', 'video').catch(e => e)
    expect(err).toBeInstanceOf(BillingError)
    expect(err.message).toMatch(/upgrade/i)
  })

  it('error message does not leak the org id', async () => {
    mockOrg({ plan: 'free', suspended_at: null, canceled_at: null, trial_ends_at: null })
    const err = await assertCanUseFeature('secret-org-id', 'video').catch(e => e)
    expect(err).toBeInstanceOf(BillingError)
    expect(err.message).not.toContain('secret-org-id')
  })
})
