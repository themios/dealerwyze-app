import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock next/server before importing the module under test
vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) => ({
      _isMock: true,
      status: init?.status ?? 200,
      body,
    }),
  },
}))

import { validateCronAuth } from '../validateCronAuth'

const TEST_SECRET = 'test-cron-secret-that-is-32-chars!!'

function makeReq(headers: Record<string, string | null>) {
  return {
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
  } as unknown as Request
}

describe('validateCronAuth', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = TEST_SECRET
    // Ensure no legacy secret bleeds across tests
    delete process.env.LEADS_POLL_SECRET
  })

  it('returns null (auth passes) for a valid Bearer token', () => {
    const req = makeReq({ authorization: `Bearer ${TEST_SECRET}` })
    expect(validateCronAuth(req as never)).toBeNull()
  })

  it('returns 401 response for a wrong Bearer token', () => {
    const req = makeReq({ authorization: 'Bearer wrong-secret' })
    const result = validateCronAuth(req as never) as { status: number } | null
    expect(result).not.toBeNull()
    expect(result?.status).toBe(401)
  })

  it('returns 401 for missing authorization header', () => {
    const req = makeReq({})
    const result = validateCronAuth(req as never) as { status: number } | null
    expect(result).not.toBeNull()
    expect(result?.status).toBe(401)
  })

  it('returns 401 for Bearer with empty secret', () => {
    const req = makeReq({ authorization: 'Bearer ' })
    const result = validateCronAuth(req as never) as { status: number } | null
    expect(result).not.toBeNull()
    expect(result?.status).toBe(401)
  })

  it('returns null when legacy x-cron-secret header matches LEADS_POLL_SECRET', () => {
    const legacySecret = 'legacy-poll-secret-32-chars-abcd'
    process.env.LEADS_POLL_SECRET = legacySecret
    const req = makeReq({ 'x-cron-secret': legacySecret })
    expect(validateCronAuth(req as never)).toBeNull()
  })

  it('returns 401 when legacy header does not match LEADS_POLL_SECRET', () => {
    process.env.LEADS_POLL_SECRET = 'correct-legacy-secret-32-chars!!'
    const req = makeReq({ 'x-cron-secret': 'wrong-legacy-secret' })
    const result = validateCronAuth(req as never) as { status: number } | null
    expect(result).not.toBeNull()
    expect(result?.status).toBe(401)
  })
})
