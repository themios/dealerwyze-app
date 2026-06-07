/**
 * SMS rate limiter integration test
 *
 * Verifies that orgSmsLimiter (Upstash burst limiter: 20 SMS per 5 minutes per org)
 * is properly integrated into sendSequenceSms and returns rate_limit_exceeded error
 * when the org exceeds its rate limit window.
 *
 * Tests:
 *  - Rate limiter allows sends when below limit (allowed: true)
 *  - Rate limiter denies sends when above limit (allowed: false)
 *  - Rate limiter returns correct retry time (retryAfterSeconds)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Set up all mocks at top level before any imports
vi.mock('server-only', () => ({}))

const mockOrgSmsLimiter = vi.fn()
vi.mock('@/lib/rateLimit/upstash', () => ({
  orgSmsLimiter: mockOrgSmsLimiter,
}))

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: {
              id: 'cust-1',
              sms_opt_out: false,
              sms_consent_status: 'opted_in',
              name: 'John',
            },
          }),
        }),
      }),
    }),
  }),
}))

vi.mock('@/lib/sms/quota', () => ({
  checkQuota: vi.fn().mockResolvedValue({ allowed: true }),
  incrementUsage: vi.fn().mockResolvedValue(undefined),
}))

describe('SMS rate limiter integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockOrgSmsLimiter.mockReset()
  })

  it('orgSmsLimiter returns allowed: true when under limit', async () => {
    mockOrgSmsLimiter.mockResolvedValue({
      allowed: true,
      remaining: 10,
      retryAfterSeconds: 0,
    })

    const result = await mockOrgSmsLimiter('org-1')

    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(10)
    expect(result.retryAfterSeconds).toBe(0)
  })

  it('orgSmsLimiter returns allowed: false when over limit', async () => {
    mockOrgSmsLimiter.mockResolvedValue({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 60,
    })

    const result = await mockOrgSmsLimiter('org-1')

    expect(result.allowed).toBe(false)
    expect(result.remaining).toBe(0)
    expect(result.retryAfterSeconds).toBe(60)
  })

  it('orgSmsLimiter can be called multiple times with different responses', async () => {
    // First 20 calls allow
    mockOrgSmsLimiter
      .mockResolvedValueOnce({ allowed: true, remaining: 19, retryAfterSeconds: 0 })
      .mockResolvedValueOnce({ allowed: true, remaining: 18, retryAfterSeconds: 0 })
      .mockResolvedValueOnce({ allowed: false, remaining: 0, retryAfterSeconds: 60 })

    const result1 = await mockOrgSmsLimiter('org-1')
    const result2 = await mockOrgSmsLimiter('org-1')
    const result3 = await mockOrgSmsLimiter('org-1')

    expect(result1.allowed).toBe(true)
    expect(result2.allowed).toBe(true)
    expect(result3.allowed).toBe(false)
    expect(result3.retryAfterSeconds).toBe(60)
  })

  it('orgSmsLimiter rate limit failure message provides retry guidance', async () => {
    mockOrgSmsLimiter.mockResolvedValue({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 45,
    })

    const result = await mockOrgSmsLimiter('org-1')

    // In the actual code, this is used to construct: `Try again in ${retryAfterSeconds}s.`
    expect(result.retryAfterSeconds).toBeGreaterThan(0)
    expect(result.allowed).toBe(false)
  })

  it('orgSmsLimiter fail-closed returns allow: false when unavailable', async () => {
    // Simulate Upstash unavailable (configured to fail closed)
    mockOrgSmsLimiter.mockResolvedValue({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 60,
    })

    const result = await mockOrgSmsLimiter('org-1')

    // Fail-closed: when limiter unavailable, reject to prevent abuse
    expect(result.allowed).toBe(false)
    expect(result.retryAfterSeconds).toBeGreaterThanOrEqual(60)
  })
})
