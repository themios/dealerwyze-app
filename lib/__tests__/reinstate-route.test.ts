import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

import { makeTestClient, makeTestProfile } from './helpers/testClient'

vi.mock('server-only', () => ({}))

const { supabase } = makeTestClient()

const { mockRequireProfile } = vi.hoisted(() => ({
  mockRequireProfile: vi.fn(),
}))

vi.mock('@/lib/auth/profile', () => ({
  requireProfile: mockRequireProfile,
}))

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => supabase,
}))

function makeReq(body: unknown): NextRequest {
  return new NextRequest('https://dealerwyze.com/api/admin/leads/reinstate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/admin/leads/reinstate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireProfile.mockResolvedValue(makeTestProfile({ role: 'dealer_admin' }))
  })

  it('returns 403 for rep role', async () => {
    mockRequireProfile.mockResolvedValueOnce(makeTestProfile({ role: 'dealer_rep' }))
    const { POST } = await import('@/app/api/admin/leads/reinstate/route')
    const res = await POST(makeReq({ auditId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', reason: 'Need another attempt' }))
    expect(res.status).toBe(403)
  })

  it('returns 409 if already reinstated', async () => {
    supabase._table('lost_lead_audit').maybeSingle.mockResolvedValueOnce({
      data: {
        id: 'audit-1',
        org_id: makeTestProfile().org_id,
        activity_id: 'act-1',
        reinstated_at: '2026-05-01T00:00:00.000Z',
      },
      error: null,
    })

    const { POST } = await import('@/app/api/admin/leads/reinstate/route')
    const res = await POST(makeReq({ auditId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', reason: 'Need another attempt' }))
    expect(res.status).toBe(409)
  })

  it('returns 409 if lead is already active', async () => {
    supabase._table('lost_lead_audit').maybeSingle
      .mockResolvedValueOnce({
        data: {
          id: 'audit-1',
          org_id: makeTestProfile().org_id,
          activity_id: 'act-1',
          reinstated_at: null,
        },
        error: null,
      })
    supabase._table('activities').maybeSingle.mockResolvedValueOnce({
      data: {
        id: 'act-1',
        user_id: makeTestProfile().org_id,
        completed_at: null,
      },
      error: null,
    })

    const { POST } = await import('@/app/api/admin/leads/reinstate/route')
    const res = await POST(makeReq({ auditId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', reason: 'Need another attempt' }))
    expect(res.status).toBe(409)
  })

  it('reinstates a completed lead for admin', async () => {
    supabase._table('lost_lead_audit').maybeSingle
      .mockResolvedValueOnce({
        data: {
          id: 'audit-1',
          org_id: makeTestProfile().org_id,
          activity_id: 'act-1',
          reinstated_at: null,
        },
        error: null,
      })
    supabase._table('activities').maybeSingle.mockResolvedValueOnce({
      data: {
        id: 'act-1',
        user_id: makeTestProfile().org_id,
        completed_at: '2026-05-01T00:00:00.000Z',
      },
      error: null,
    })
    supabase._table('activities').then = vi.fn().mockImplementation(
      (resolve: (value: unknown) => unknown) => resolve({ data: [], error: null }),
    )
    supabase._table('lost_lead_audit').then = vi.fn().mockImplementation(
      (resolve: (value: unknown) => unknown) => resolve({ data: [], error: null }),
    )

    const { POST } = await import('@/app/api/admin/leads/reinstate/route')
    const res = await POST(makeReq({ auditId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', reason: 'Customer replied again' }))
    expect(res.status).toBe(200)
    expect(supabase._table('activities').update).toHaveBeenCalledWith(
      expect.objectContaining({ completed_at: null }),
    )
    expect(supabase._table('lost_lead_audit').update).toHaveBeenCalledWith(
      expect.objectContaining({ reinstate_reason: 'Customer replied again' }),
    )
  })
})
