import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { Ratelimit } from '@upstash/ratelimit'

// Mock Upstash modules
vi.mock('@upstash/ratelimit')
vi.mock('@upstash/redis')

// Import the limiters after mocking
import {
  orgExportLimiter,
  orgCsvImportLimiter,
  orgSmsLimiter,
} from '@/lib/rateLimit/upstash'

describe('Rate Limiter Fallback (Fail-Closed)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns fail-closed response when Upstash is not configured', async () => {
    // When env vars are missing, rate limiters are created as null
    // and the check function should return { allowed: false, remaining: 0, retryAfterSeconds: 60 }

    // Simulate calling a limiter when Upstash is not configured
    // This tests the check() function's null-limiter path by using public API
    const result = await orgExportLimiter('test-org-1')

    expect(result.allowed).toBe(false)
    expect(result.remaining).toBe(0)
    expect(result.retryAfterSeconds).toBe(60)
  })

  it('returns fail-closed response for CSV import limiter when unconfigured', async () => {
    const result = await orgCsvImportLimiter('test-org-2')

    expect(result.allowed).toBe(false)
    expect(result.remaining).toBe(0)
    expect(result.retryAfterSeconds).toBe(60)
  })

  it('returns fail-closed response for SMS limiter when unconfigured', async () => {
    const result = await orgSmsLimiter('test-org-3')

    expect(result.allowed).toBe(false)
    expect(result.remaining).toBe(0)
    expect(result.retryAfterSeconds).toBe(60)
  })

  it('returns consistent fail-closed response across multiple call attempts', async () => {
    const result1 = await orgExportLimiter('test-org-4')
    const result2 = await orgExportLimiter('test-org-4')
    const result3 = await orgExportLimiter('test-org-5')

    expect(result1).toEqual({ allowed: false, remaining: 0, retryAfterSeconds: 60 })
    expect(result2).toEqual({ allowed: false, remaining: 0, retryAfterSeconds: 60 })
    expect(result3).toEqual({ allowed: false, remaining: 0, retryAfterSeconds: 60 })
  })

  it('verify multiple limiters behave consistently under unconfigured state', async () => {
    const exportResult = await orgExportLimiter('test-org-multi')
    const csvResult = await orgCsvImportLimiter('test-org-multi')
    const smsResult = await orgSmsLimiter('test-org-multi')

    // All should fail closed with identical responses
    expect(exportResult.allowed).toBe(false)
    expect(csvResult.allowed).toBe(false)
    expect(smsResult.allowed).toBe(false)

    expect(exportResult.remaining).toBe(0)
    expect(csvResult.remaining).toBe(0)
    expect(smsResult.remaining).toBe(0)

    expect(exportResult.retryAfterSeconds).toBe(60)
    expect(csvResult.retryAfterSeconds).toBe(60)
    expect(smsResult.retryAfterSeconds).toBe(60)
  })
})
