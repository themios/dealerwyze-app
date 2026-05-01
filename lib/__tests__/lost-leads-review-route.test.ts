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

const AUDIT_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'

describe('PATCH /api/admin/performance/lost-leads/review', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireProfile.mockResolvedValue(makeTestProfile({ role: 'dealer_admin' }))
    const lostAudit = supabase._table('lost_lead_audit')
    lostAudit.update.mockReturnValue(lostAudit)
    lostAudit.eq.mockReturnValue(lostAudit)
    lostAudit.then = vi.fn().mockImplementation(
      (resolve: (value: unknown) => unknown) => resolve({ error: null }),
    )
    const usage = supabase._table('ai_usage_log')
    usage.insert.mockReturnValue(usage)
    usage.then = vi.fn().mockImplementation(
      (resolve: (value: unknown) => unknown) => resolve({ error: null }),
    )
  })

  it('returns 403 for dealer_rep', async () => {
    mockRequireProfile.mockResolvedValueOnce(makeTestProfile({ role: 'dealer_rep' }))
    const { PATCH } = await import('@/app/api/admin/performance/lost-leads/review/route')
    const res = await PATCH(
      new NextRequest('https://dealerwyze.com/api/admin/performance/lost-leads/review', {
        method: 'PATCH',
        body: JSON.stringify({ auditId: AUDIT_ID }),
      }),
    )
    expect(res.status).toBe(403)
    expect(supabase._table('lost_lead_audit').update).not.toHaveBeenCalled()
  })

  it('allows dealer_manager to mark reviewed', async () => {
    mockRequireProfile.mockResolvedValueOnce(makeTestProfile({ role: 'dealer_manager' }))
    const { PATCH } = await import('@/app/api/admin/performance/lost-leads/review/route')
    const res = await PATCH(
      new NextRequest('https://dealerwyze.com/api/admin/performance/lost-leads/review', {
        method: 'PATCH',
        body: JSON.stringify({ auditId: AUDIT_ID }),
      }),
    )
    expect(res.status).toBe(200)
    expect(supabase._table('lost_lead_audit').update).toHaveBeenCalledWith(
      expect.objectContaining({ root_cause_needs_review: false }),
    )
  })
})
