import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { makeTestClient, makeTestProfile, TEST_ORG_ID, TEST_ORG_B_ID } from './helpers/testClient'

const { supabase } = makeTestClient()

vi.mock('server-only', () => ({}))

vi.mock('@/lib/auth/profile', () => ({
  requireProfile: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => supabase,
}))

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(() => supabase),
}))

vi.mock('@/lib/locations/logLocationAudit', () => ({
  logLocationAudit: vi.fn(),
}))

vi.mock('@/lib/rateLimit/upstash', () => ({
  webLeadLimiter: vi.fn().mockResolvedValue({ allowed: true }),
}))

vi.mock('@/lib/vdp/notifyDealer', () => ({
  notifyDealerNewLead: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/locations/resolve', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/locations/resolve')>()
  return { ...actual, isMultiLocationOrg: vi.fn() }
})

vi.mock('@/lib/leads/detectLeadLocation', () => ({
  applyLeadLocationDetection: vi.fn().mockResolvedValue(undefined),
  detectLeadLocation: vi.fn().mockReturnValue(null),
}))

vi.mock('@/lib/leads/assignLead', () => ({
  applyAutoLeadAssignment: vi.fn().mockResolvedValue(undefined),
  resolveLeadAssignee: vi.fn().mockResolvedValue(null),
}))

import { requireProfile } from '@/lib/auth/profile'
import { isMultiLocationOrg } from '@/lib/locations/resolve'
import { applyLeadLocationDetection } from '@/lib/leads/detectLeadLocation'
import { applyAutoLeadAssignment } from '@/lib/leads/assignLead'
import { PATCH as patchCustomerLocation } from '@/app/api/customers/[id]/location/route'
import { GET as getCustomers } from '@/app/api/customers/route'

const mockedRequireProfile = vi.mocked(requireProfile)
const mockedIsMultiLocation = vi.mocked(isMultiLocationOrg)

describe('multi-location API tenancy', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedRequireProfile.mockResolvedValue(
      makeTestProfile({ org_id: TEST_ORG_ID, role: 'dealer_admin' }) as Awaited<
        ReturnType<typeof requireProfile>
      >,
    )
  })

  it('GET /api/customers rejects invalid location_id for org', async () => {
    const dealerLocations = supabase._table('dealer_locations')
    dealerLocations.maybeSingle.mockResolvedValueOnce({ data: null, error: null })

    const req = new NextRequest(
      `http://localhost/api/customers?location_id=other-org-loc`,
    )
    const res = await getCustomers(req)
    expect(res.status).toBe(400)
  })

  it('PATCH /api/customers/[id]/location returns 404 for cross-org customer', async () => {
    const customers = supabase._table('customers')
    customers.maybeSingle.mockResolvedValueOnce({ data: null, error: null })

    const req = new NextRequest('http://localhost/api/customers/cust-1/location', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ location_id: 'loc-a' }),
    })

    const res = await patchCustomerLocation(req, {
      params: Promise.resolve({ id: 'cust-1' }),
    })

    expect(res.status).toBe(404)
    expect(customers.eq).toHaveBeenCalledWith('user_id', TEST_ORG_ID)
    expect(customers.eq).not.toHaveBeenCalledWith('user_id', TEST_ORG_B_ID)
  })
})

describe('POST /api/customer-sequences — unresolved-lead gate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedRequireProfile.mockResolvedValue(
      makeTestProfile({ org_id: TEST_ORG_ID, role: 'dealer_admin' }) as Awaited<
        ReturnType<typeof requireProfile>
      >,
    )
  })

  it('returns 422 when org is multi-location and customer has no location_id', async () => {
    const { POST: postSequences } = await import('@/app/api/customer-sequences/route')

    mockedIsMultiLocation.mockResolvedValue(true)
    supabase._table('customers').maybeSingle.mockResolvedValueOnce({
      data: { id: 'cust-1', name: 'Jane', email: null, primary_phone: '5550001', unsubscribe_email: false, unsubscribe_sms: false, location_id: null },
      error: null,
    })
    supabase._table('sequences').maybeSingle.mockResolvedValueOnce({
      data: { id: 'seq-1', name: 'Test', channel: 'sms', auto_mode: false },
      error: null,
    })

    const req = new NextRequest('http://localhost/api/customer-sequences', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ customer_id: 'cust-1', sequence_id: 'seq-1' }),
    })
    const res = await postSequences(req)
    expect(res.status).toBe(422)
    const body = await res.json() as { error: string }
    expect(body.error).toMatch(/location/i)
  })

  it('allows and completes enrollment when org is multi-location and customer has a location_id', async () => {
    const { POST: postSequences } = await import('@/app/api/customer-sequences/route')

    mockedIsMultiLocation.mockResolvedValue(true)
    supabase._table('customers').maybeSingle.mockResolvedValueOnce({
      data: { id: 'cust-2', name: 'Bob', email: 'bob@test.com', primary_phone: '5550002', unsubscribe_email: false, unsubscribe_sms: false, location_id: 'loc-a' },
      error: null,
    })
    supabase._table('sequences').maybeSingle.mockResolvedValueOnce({
      data: { id: 'seq-1', name: 'Test', channel: 'email', auto_mode: false },
      error: null,
    })
    // Active enrollment cap: count = 0
    supabase._table('customer_sequences').then = (fn?: (v: unknown) => unknown) =>
      Promise.resolve({ count: 0, error: null }).then(fn)
    // No existing enrollment for this channel
    supabase._table('customer_sequences').maybeSingle.mockResolvedValueOnce({ data: null, error: null })
    // Enrollment insert success
    supabase._table('customer_sequences').single.mockResolvedValueOnce({
      data: { id: 'enr-1', customer_id: 'cust-2', sequence_id: 'seq-1', org_id: TEST_ORG_ID, channel: 'email', status: 'active', start_at: new Date().toISOString(), enrolled_at: new Date().toISOString() },
      error: null,
    })
    // Steps
    supabase._table('sequence_steps').then = (fn?: (v: unknown) => unknown) =>
      Promise.resolve({
        data: [{ id: 'step-1', sort_order: 0, day_offset: 0, send_hour: 9, template_id: null, template: null }],
        error: null,
      }).then(fn)
    // Activities insert success
    supabase._table('activities').then = (fn?: (v: unknown) => unknown) =>
      Promise.resolve({ data: [{ id: 'act-1' }], error: null }).then(fn)

    const req = new NextRequest('http://localhost/api/customer-sequences', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ customer_id: 'cust-2', sequence_id: 'seq-1' }),
    })
    const res = await postSequences(req)
    expect(res.status).toBe(201)
    const body = await res.json() as { ok: boolean; customer_sequence_id: string }
    expect(body.ok).toBe(true)
    expect(body.customer_sequence_id).toBe('enr-1')
  })

  it('allows enrollment on single-location org even when customer has no location_id', async () => {
    const { POST: postSequences } = await import('@/app/api/customer-sequences/route')

    mockedIsMultiLocation.mockResolvedValue(false)
    supabase._table('customers').maybeSingle.mockResolvedValueOnce({
      data: { id: 'cust-3', name: 'Kim', email: 'kim@test.com', primary_phone: '5550003', unsubscribe_email: false, unsubscribe_sms: false, location_id: null },
      error: null,
    })
    supabase._table('sequences').maybeSingle.mockResolvedValueOnce({
      data: { id: 'seq-1', name: 'Test', channel: 'sms', auto_mode: false },
      error: null,
    })
    // Active enrollment cap: count = 0
    supabase._table('customer_sequences').then = (fn?: (v: unknown) => unknown) =>
      Promise.resolve({ count: 0, error: null }).then(fn)
    supabase._table('customer_sequences').maybeSingle.mockResolvedValueOnce({ data: null, error: null })
    supabase._table('customer_sequences').single.mockResolvedValueOnce({
      data: { id: 'enr-2', customer_id: 'cust-3', sequence_id: 'seq-1', org_id: TEST_ORG_ID, channel: 'sms', status: 'active', start_at: new Date().toISOString(), enrolled_at: new Date().toISOString() },
      error: null,
    })
    supabase._table('sequence_steps').then = (fn?: (v: unknown) => unknown) =>
      Promise.resolve({
        data: [{ id: 'step-1', sort_order: 0, day_offset: 0, send_hour: 9, template_id: null, template: null }],
        error: null,
      }).then(fn)
    supabase._table('activities').then = (fn?: (v: unknown) => unknown) =>
      Promise.resolve({ data: [{ id: 'act-2' }], error: null }).then(fn)

    const req = new NextRequest('http://localhost/api/customer-sequences', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ customer_id: 'cust-3', sequence_id: 'seq-1' }),
    })
    const res = await postSequences(req)
    expect(res.status).toBe(201)
    const body = await res.json() as { ok: boolean }
    expect(body.ok).toBe(true)
  })
})

describe('web lead ingest — detection + assignment are invoked', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset detection/assignment mocks to resolve cleanly
    vi.mocked(applyLeadLocationDetection).mockResolvedValue(undefined)
    vi.mocked(applyAutoLeadAssignment).mockResolvedValue(undefined)
  })

  it('calls applyLeadLocationDetection and applyAutoLeadAssignment after customer upsert', async () => {
    const { POST: postWebLead } = await import('@/app/api/leads/web/route')

    // Org lookup via slug
    supabase._table('organizations').single.mockResolvedValueOnce({
      data: { id: TEST_ORG_ID, name: 'Apollo', slug: 'apollo', public_inventory_enabled: true },
      error: null,
    })
    // No existing customers → insert new
    supabase._table('customers').then = (fn?: (v: unknown) => unknown) =>
      Promise.resolve({ data: [], error: null }).then(fn)
    supabase._table('customers').single.mockResolvedValueOnce({
      data: { id: 'cust-web-1' },
      error: null,
    })

    const req = new NextRequest('http://localhost/api/leads/web', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '1.2.3.4' },
      body: JSON.stringify({
        slug: 'apollo',
        name: 'Web Lead',
        phone: '5559999',
        email: 'web@test.com',
      }),
    })

    await postWebLead(req)

    // Both detection and assignment must be initiated (fire-and-forget chain)
    await vi.waitFor(() => {
      expect(vi.mocked(applyLeadLocationDetection)).toHaveBeenCalledWith(
        expect.objectContaining({ customerId: 'cust-web-1', orgId: TEST_ORG_ID }),
      )
      expect(vi.mocked(applyAutoLeadAssignment)).toHaveBeenCalledWith(
        expect.objectContaining({ customerId: 'cust-web-1', orgId: TEST_ORG_ID }),
      )
    })
  })
})
