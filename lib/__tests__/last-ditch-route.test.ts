import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))

const { mockFrom, mockProfile, mockLastDitch } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockProfile: vi.fn(),
  mockLastDitch: vi.fn(),
}))

vi.mock('@/lib/auth/profile', () => ({ requireProfile: mockProfile }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ from: mockFrom }) }))
vi.mock('@/lib/rateLimit/upstash', () => ({ orgTodayActionLimiter: async () => ({ allowed: true }) }))
vi.mock('@/lib/leads/lastDitch', () => ({ sendLastDitchMessage: mockLastDitch }))

import { POST } from '@/app/api/today/last-ditch/route'

const ACTIVITY_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const ORG_ID = 'org-1'
const CUSTOMER = { id: 'cust-1', name: 'Jane', primary_phone: '+15551234567', sms_opt_out: false, sms_consent_status: 'granted', last_ditch_sent_at: null }

function makeReq(body: unknown) {
  return new NextRequest('http://localhost/api/today/last-ditch', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockProfile.mockResolvedValue({ org_id: ORG_ID })
  mockLastDitch.mockResolvedValue('sent')
  mockFrom.mockReturnValue({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: { id: ACTIVITY_ID, user_id: ORG_ID, customer_id: CUSTOMER.id, customer: CUSTOMER },
    }),
  })
})

describe('POST /api/today/last-ditch', () => {
  it('returns 400 on invalid body', async () => {
    const res = await POST(makeReq({ activityId: 'not-a-uuid' }))
    expect(res.status).toBe(400)
  })

  it('returns 404 when activity not found', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null }),
    })
    const res = await POST(makeReq({ activityId: ACTIVITY_ID }))
    expect(res.status).toBe(404)
  })

  it('returns 403 for cross-tenant activity', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: ACTIVITY_ID, user_id: 'other-org', customer_id: CUSTOMER.id, customer: CUSTOMER },
      }),
    })
    const res = await POST(makeReq({ activityId: ACTIVITY_ID }))
    expect(res.status).toBe(403)
  })

  it('returns 200 with result=sent on success', async () => {
    const res = await POST(makeReq({ activityId: ACTIVITY_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.result).toBe('sent')
    expect(body.skipped).toBe(false)
  })

  it('returns 200 with skipped=true when consent missing', async () => {
    mockLastDitch.mockResolvedValue('skipped_consent')
    const res = await POST(makeReq({ activityId: ACTIVITY_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.skipped).toBe(true)
  })

  it('returns 500 when send fails', async () => {
    mockLastDitch.mockResolvedValue('failed')
    const res = await POST(makeReq({ activityId: ACTIVITY_ID }))
    expect(res.status).toBe(500)
  })
})
