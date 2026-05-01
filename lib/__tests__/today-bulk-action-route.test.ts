import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

import { makeTestClient, makeTestProfile } from './helpers/testClient'

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
  orgTodayBulkLimiter: mockLimiter,
}))

vi.mock('@/lib/intelligence/lostLeadAudit', () => ({
  buildLostLeadAuditRow: mockBuildLostLeadAuditRow,
}))

function makeReq(body: unknown): NextRequest {
  return new NextRequest('https://dealerwyze.com/api/today/bulk-action', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/today/bulk-action', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireProfile.mockResolvedValue(makeTestProfile())
    mockLimiter.mockResolvedValue({ allowed: true })
    supabase._table('activities').then = vi.fn().mockImplementation(
      (resolve: (value: unknown) => unknown) => resolve({
        data: [
          { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', customer_id: 'cust-1' },
          { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', customer_id: 'cust-2' },
        ],
        count: 2,
        error: null,
      }),
    )
    supabase._table('customer_sequences').then = vi.fn().mockImplementation(
      (resolve: (value: unknown) => unknown) => resolve({ data: [], error: null }),
    )
    mockBuildLostLeadAuditRow.mockResolvedValue({
      org_id: makeTestProfile().org_id,
      activity_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      customer_id: 'cust-1',
      assigned_rep_id: 'rep-1',
      last_human_actor_id: 'rep-2',
      archived_by: makeTestProfile().id,
      archive_reason: 'bulk',
      loss_reason: null,
      intent_tier: 'warm',
      intent_score: 70,
      lead_source: 'email',
      touches: 4,
      last_inbound_at: '2026-04-30T00:00:00.000Z',
    })
  })

  it('rejects payloads larger than 50 ids', async () => {
    const ids = Array.from({ length: 51 }, (_, index) => `${index}`.padStart(8, '0') + '-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
    const { POST } = await import('@/app/api/today/bulk-action/route')
    const res = await POST(makeReq({ activityIds: ids, action: 'park' }))

    expect(res.status).toBe(400)
  })

  it('rejects mixed-org ownership batches', async () => {
    supabase._table('activities').then = vi.fn().mockImplementation(
      (resolve: (value: unknown) => unknown) => resolve({
        data: [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', customer_id: 'cust-1' }],
        count: 1,
        error: null,
      }),
    )

    const { POST } = await import('@/app/api/today/bulk-action/route')
    const res = await POST(makeReq({
      activityIds: [
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      ],
      action: 'park',
    }))

    expect(res.status).toBe(403)
  })

  it('applies trust_sequence for a valid batch', async () => {
    const { POST } = await import('@/app/api/today/bulk-action/route')
    const res = await POST(makeReq({
      activityIds: [
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      ],
      action: 'trust_sequence',
    }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.count).toBe(2)
    expect(supabase._table('activities').update).toHaveBeenCalledWith(
      expect.objectContaining({ today_section_override: 'ai_handling' }),
    )
  })

  it('rate limits bulk requests', async () => {
    mockLimiter.mockResolvedValueOnce({ allowed: false })
    const { POST } = await import('@/app/api/today/bulk-action/route')
    const res = await POST(makeReq({
      activityIds: ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'],
      action: 'park',
    }))

    expect(res.status).toBe(429)
  })

  it('writes audit rows on bulk archive', async () => {
    const { POST } = await import('@/app/api/today/bulk-action/route')
    const res = await POST(makeReq({
      activityIds: [
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      ],
      action: 'archive',
    }))

    expect(res.status).toBe(200)
    expect(mockBuildLostLeadAuditRow).toHaveBeenCalledTimes(2)
    expect(mockBuildLostLeadAuditRow).toHaveBeenCalledWith(
      expect.objectContaining({ archiveReason: 'bulk', lossReason: null }),
    )
    expect(supabase._table('lost_lead_audit').insert).toHaveBeenCalled()
  })
})
