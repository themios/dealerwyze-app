/**
 * POST /api/leads/web — public web lead ingestion (Zod + rate limit).
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import { NextRequest } from 'next/server'
import { makeTestClient } from '../helpers/testClient'

const { supabase, ORG_ID } = makeTestClient()

vi.mock('server-only', () => ({}))

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => supabase,
}))

vi.mock('@/lib/rateLimit/upstash', () => ({
  webLeadLimiter: vi.fn().mockResolvedValue({ allowed: true }),
}))

vi.mock('@/lib/vdp/notifyDealer', () => ({
  notifyDealerNewLead: vi.fn().mockResolvedValue(undefined),
}))

import { POST } from '@/app/api/leads/web/route'

const validPayload = {
  slug: 'dealer',
  name: 'Jane Buyer',
  phone: '555-123-4567',
  email: 'jane@example.com',
  message: 'Interested',
  source_url: 'https://example.com/vdp',
  website: '',
}

describe('POST /api/leads/web', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const orgRow = {
      id: ORG_ID,
      name: 'Test Dealer',
      slug: 'dealer',
      public_inventory_enabled: true,
    }
    const orgStub = supabase._table('organizations')
    ;(orgStub.single as Mock).mockResolvedValue({ data: orgRow, error: null })
  })

  it('returns 201 for a valid payload', async () => {
    const req = new NextRequest('http://localhost/api/leads/web', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '9.9.9.9' },
      body: JSON.stringify(validPayload),
    })
    const res = await POST(req)
    expect(res.status).toBe(201)
    const body = await res.json() as { ok?: boolean }
    expect(body.ok).toBe(true)
  })

  it('returns 400 with field detail when a required field is missing', async () => {
    const bad = { ...validPayload, name: '' }
    const req = new NextRequest('http://localhost/api/leads/web', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bad),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = await res.json() as { error?: string; fields?: Record<string, string> }
    expect(body.error).toBe('Validation failed')
    expect(body.fields?.name).toBeDefined()
  })

  it('returns 400 when Content-Length exceeds cap', async () => {
    const req = new NextRequest('http://localhost/api/leads/web', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'content-length': String(40_000),
      },
      body: JSON.stringify(validPayload),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = await res.json() as { error?: string; fields?: Record<string, string> }
    expect(body.error).toBe('Validation failed')
    expect(body.fields?._body).toContain('large')
  })
})
