/**
 * GET /api/unsubscribe — token + customer id query validation and replay safety.
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import { NextRequest } from 'next/server'
import { makeTestClient } from '../helpers/testClient'
import { buildUnsubscribeToken } from '@/lib/security/unsubscribe'

const { supabase } = makeTestClient()

vi.mock('server-only', () => ({}))

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => supabase,
}))

import { GET } from '@/app/api/unsubscribe/route'

const CID = '550e8400-e29b-41d4-a716-446655440000'

describe('GET /api/unsubscribe', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('UNSUBSCRIBE_SECRET', 'unit-test-unsubscribe-secret')
  })

  function url(token: string) {
    return `http://localhost/api/unsubscribe?token=${encodeURIComponent(token)}&cid=${encodeURIComponent(CID)}`
  }

  it('returns 200 HTML when token is valid and customer is not yet unsubscribed', async () => {
    const token = buildUnsubscribeToken(CID)
    const cust = supabase._table('customers')
    ;(cust.maybeSingle as Mock).mockResolvedValueOnce({ data: { unsubscribe_email: false }, error: null })

    const req = new NextRequest(url(token))
    const res = await GET(req)
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('unsubscribed')
  })

  it('returns 409 when customer is already unsubscribed (replay)', async () => {
    const token = buildUnsubscribeToken(CID)
    const cust = supabase._table('customers')
    ;(cust.maybeSingle as Mock).mockResolvedValueOnce({ data: { unsubscribe_email: true }, error: null })

    const req = new NextRequest(url(token))
    const res = await GET(req)
    expect(res.status).toBe(409)
  })
})
