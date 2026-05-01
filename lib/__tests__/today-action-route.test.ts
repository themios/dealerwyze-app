import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

import { makeTestClient, makeTestProfile, TEST_ORG_B_ID } from './helpers/testClient'

vi.mock('server-only', () => ({}))

const { supabase } = makeTestClient()

const { mockRequireProfile, mockLimiter, mockBuildLostLeadAuditRow } = vi.hoisted(() => ({
  mockRequireProfile: vi.fn(),
  mockLimiter: vi.fn(),
  mockBuildLostLeadAuditRow: vi.fn(),
}))

vi.mock('@/lib/auth/profile', () => ({
  requireProfile: mockRequireProfile,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => supabase,
}))

vi.mock('@/lib/rateLimit/upstash', () => ({
  orgTodayActionLimiter: mockLimiter,
}))

vi.mock('@/lib/intelligence/lostLeadAudit', () => ({
  buildLostLeadAuditRow: mockBuildLostLeadAuditRow,
  parseLossReason: (value: unknown) => value ?? null,
}))

function makeReq(body: unknown): NextRequest {
  return new NextRequest('https://dealerwyze.com/api/today/action', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/today/action', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireProfile.mockResolvedValue(makeTestProfile())
    mockLimiter.mockResolvedValue({ allowed: true })
    supabase._table('activities').maybeSingle.mockResolvedValue({
      data: {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        user_id: makeTestProfile().org_id,
        customer_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        today_section_override: null,
        today_park_until: null,
      },
      error: null,
    })
    supabase._table('activities').then = vi.fn().mockImplementation(
      (resolve: (value: unknown) => unknown) => resolve({ data: [], error: null }),
    )
    supabase._table('customer_sequences').then = vi.fn().mockImplementation(
      (resolve: (value: unknown) => unknown) => resolve({ data: [], error: null }),
    )
    supabase._table('lost_lead_audit').single.mockResolvedValue({
      data: { id: 'audit-1' },
      error: null,
    })
    mockBuildLostLeadAuditRow.mockResolvedValue({
      org_id: makeTestProfile().org_id,
      activity_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      customer_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      assigned_rep_id: 'rep-1',
      last_human_actor_id: 'rep-2',
      archived_by: makeTestProfile().id,
      archive_reason: 'manual',
      loss_reason: null,
      intent_tier: 'warm',
      intent_score: 70,
      lead_source: 'email',
      touches: 4,
      last_inbound_at: '2026-04-30T00:00:00.000Z',
    })
  })

  it('rejects invalid actions', async () => {
    const { POST } = await import('@/app/api/today/action/route')
    const res = await POST(makeReq({
      activityId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      action: 'nope',
    }))

    expect(res.status).toBe(400)
  })

  it('rejects past snooze times', async () => {
    const { POST } = await import('@/app/api/today/action/route')
    const res = await POST(makeReq({
      activityId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      action: 'snooze',
      snoozedUntil: '2020-01-01T00:00:00.000Z',
    }))

    expect(res.status).toBe(400)
  })

  it('blocks cross-tenant updates', async () => {
    supabase._table('activities').maybeSingle.mockResolvedValueOnce({
      data: {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        user_id: TEST_ORG_B_ID,
        customer_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        today_section_override: null,
        today_park_until: null,
      },
      error: null,
    })

    const { POST } = await import('@/app/api/today/action/route')
    const res = await POST(makeReq({
      activityId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      action: 'park',
    }))

    expect(res.status).toBe(403)
  })

  it('applies a valid park action', async () => {
    const { POST } = await import('@/app/api/today/action/route')
    const res = await POST(makeReq({
      activityId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      action: 'park',
    }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.ok).toBe(true)
    expect(supabase._table('activities').update).toHaveBeenCalledWith(
      expect.objectContaining({ today_section_override: 'follow_up_later' }),
    )
  })

  it('rate limits repeated requests', async () => {
    mockLimiter.mockResolvedValueOnce({ allowed: false })
    const { POST } = await import('@/app/api/today/action/route')
    const res = await POST(makeReq({
      activityId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      action: 'park',
    }))

    expect(res.status).toBe(429)
  })

  it('writes an audit row when archiving', async () => {
    const { POST } = await import('@/app/api/today/action/route')
    const res = await POST(makeReq({
      activityId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      action: 'archive',
      lossReason: 'price',
    }))

    expect(res.status).toBe(200)
    expect(mockBuildLostLeadAuditRow).toHaveBeenCalledWith(
      expect.objectContaining({
        activityId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        archivedBy: makeTestProfile().id,
      }),
    )
    expect(supabase._table('lost_lead_audit').insert).toHaveBeenCalled()
  })
})
