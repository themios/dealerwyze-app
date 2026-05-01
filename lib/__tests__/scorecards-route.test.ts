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

function makeReq(url: string): NextRequest {
  return new NextRequest(url, { method: 'GET' })
}

describe('GET /api/admin/performance/scorecards', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireProfile.mockResolvedValue(makeTestProfile({ role: 'dealer_rep', id: 'rep-self' }))
    supabase._table('profiles').then = vi.fn().mockImplementation(
      (resolve: (value: unknown) => unknown) => resolve({
        data: [
          { id: 'rep-self', display_name: 'Me', role: 'dealer_rep' },
          { id: 'rep-other', display_name: 'Peer', role: 'dealer_rep' },
        ],
        error: null,
      }),
    )
  })

  it('returns only the requesting rep scorecard (self scope)', async () => {
    const { GET } = await import('@/app/api/admin/performance/scorecards/route')
    const res = await GET(makeReq('https://dealerwyze.com/api/admin/performance/scorecards?days=30'))
    const json = await res.json() as { viewerMode: string; scorecards: Array<{ repId: string }> }

    expect(res.status).toBe(200)
    expect(json.viewerMode).toBe('self')
    expect(json.scorecards).toHaveLength(1)
    expect(json.scorecards[0].repId).toBe('rep-self')
  })
})
