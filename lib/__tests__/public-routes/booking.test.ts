/**
 * POST /api/book/[slug] — public booking (Zod validation).
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
  bookingLimiter: vi.fn().mockResolvedValue({ allowed: true }),
}))

import { POST } from '@/app/api/book/[slug]/route'

const routeParams = { params: Promise.resolve({ slug: 'dealer' }) }

const validBody = {
  name: 'Pat Prospect',
  phone: '555-987-6543',
  email: 'pat@example.com',
  date: '2026-06-15',
  time: '14:30',
  notes: 'Test drive',
  website: '',
}

describe('POST /api/book/[slug]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const orgStub = supabase._table('organizations')
    ;(orgStub.maybeSingle as Mock).mockResolvedValue({ data: { id: ORG_ID }, error: null })

    const settings = {
      business_name: 'Nice Motors',
      booking_enabled: true,
      timezone: 'America/Los_Angeles',
    }
    const settingsStub = supabase._table('org_settings')
    ;(settingsStub.maybeSingle as Mock).mockResolvedValue({ data: settings, error: null })

    const customers = supabase._table('customers')
    ;(customers.maybeSingle as Mock).mockResolvedValue({ data: null, error: null })
    ;(customers.single as Mock).mockResolvedValue({ data: { id: 'new-cust-id' }, error: null })
  })

  it('returns 201 for a valid payload', async () => {
    const req = new NextRequest('http://localhost/api/book/dealer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '8.8.8.8' },
      body: JSON.stringify(validBody),
    })
    const res = await POST(req, routeParams)
    expect(res.status).toBe(201)
    const body = await res.json() as { success?: boolean }
    expect(body.success).toBe(true)
  })

  it('returns 400 when phone format is invalid', async () => {
    const req = new NextRequest('http://localhost/api/book/dealer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...validBody, phone: 'abc!!!' }),
    })
    const res = await POST(req, routeParams)
    expect(res.status).toBe(400)
    const body = await res.json() as { error?: string; fields?: Record<string, string> }
    expect(body.error).toBe('Validation failed')
    expect(body.fields?.phone).toBeDefined()
  })
})
