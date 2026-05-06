/**
 * Tenant isolation — Phase 2 (v1.1)
 *
 * - scopedHelpers enforce org_id / user_id filters (RLS-aligned)
 * - createClientForRequest uses JWT impersonation for staff cookie, not service role
 * - Representative API: customer PATCH returns 404 when the row is outside the org
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import { NextRequest } from 'next/server'
import { makeTestClient, makeTestProfile, type QueryBuilderStub } from '../helpers/testClient'

const { supabase, ORG_ID, ORG_B_ID } = makeTestClient()

vi.mock('server-only', () => ({}))

const { mockScopedClient } = vi.hoisted(() => ({
  mockScopedClient: vi.fn(),
}))

vi.mock('@/lib/supabase/impersonation', () => ({
  createScopedImpersonationClient: mockScopedClient,
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}))

vi.mock('@/lib/auth/staffSession', () => ({
  getStaffSessionInfo: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/auth/profile', () => ({
  requireProfile: vi.fn(),
}))

import { getVehicle, getCustomerById, getBhphContractForOrg, getCustomerDocuments } from '@/lib/supabase/scopedHelpers'
import { cookies } from 'next/headers'
import { getStaffSessionInfo } from '@/lib/auth/staffSession'
import { createClient } from '@/lib/supabase/server'
import { createClientForRequest } from '@/lib/supabase/forRequest'
import { requireProfile } from '@/lib/auth/profile'
import { PATCH as patchCustomer } from '@/app/api/customers/[id]/route'

const cookiesMock = vi.mocked(cookies)
const getStaffMock = vi.mocked(getStaffSessionInfo)
const createClientMock = vi.mocked(createClient)

beforeEach(() => {
  createClientMock.mockImplementation(async () => supabase as never)
})

describe('scopedHelpers — org-scoped queries', () => {
  it('getVehicle adds id + user_id filters', async () => {
    const stub = supabase._table('vehicles') as QueryBuilderStub
    ;(stub.maybeSingle as Mock).mockResolvedValueOnce({ data: { id: 'v1' }, error: null })
    await getVehicle(supabase, ORG_ID, 'v1')
    expect(stub.eq).toHaveBeenCalledWith('id', 'v1')
    expect(stub.eq).toHaveBeenCalledWith('user_id', ORG_ID)
  })

  it('getCustomerById scopes by user_id (org key)', async () => {
    const stub = supabase._table('customers') as QueryBuilderStub
    ;(stub.maybeSingle as Mock).mockResolvedValueOnce({ data: { id: 'c1' }, error: null })
    await getCustomerById(supabase, ORG_ID, 'c1')
    expect(stub.eq).toHaveBeenCalledWith('id', 'c1')
    expect(stub.eq).toHaveBeenCalledWith('user_id', ORG_ID)
  })

  it('getBhphContractForOrg scopes BHPH row by user_id', async () => {
    const stub = supabase._table('bhph_payments') as QueryBuilderStub
    ;(stub.maybeSingle as Mock).mockResolvedValueOnce({ data: { id: 'b1' }, error: null })
    await getBhphContractForOrg(supabase, ORG_ID, 'b1')
    expect(stub.eq).toHaveBeenCalledWith('id', 'b1')
    expect(stub.eq).toHaveBeenCalledWith('user_id', ORG_ID)
  })

  it('getCustomerDocuments returns error path when customer not in org', async () => {
    const cust = supabase._table('customers') as QueryBuilderStub
    ;(cust.maybeSingle as Mock).mockResolvedValueOnce({ data: null, error: null })
    const res = await getCustomerDocuments(supabase, ORG_B_ID, 'c-other')
    expect(res.data).toBeNull()
  })
})

describe('createClientForRequest — impersonation hardening', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    createClientMock.mockImplementation(async () => supabase as never)
    cookiesMock.mockResolvedValue({ get: () => undefined } as never)
  })

  it('uses createScopedImpersonationClient when staff cookie session is present', async () => {
    const fake = { tag: 'impersonation' }
    mockScopedClient.mockResolvedValueOnce(fake)
    getStaffMock.mockReturnValueOnce({ orgId: 'staff-target-org', writeMode: true })

    const client = await createClientForRequest()

    expect(mockScopedClient).toHaveBeenCalledWith('staff-target-org')
    expect(createClientMock).not.toHaveBeenCalled()
    expect(client).toBe(fake)
  })

  it('uses normal createClient when no staff session', async () => {
    getStaffMock.mockReturnValueOnce(null)

    const client = await createClientForRequest()

    expect(mockScopedClient).not.toHaveBeenCalled()
    expect(createClientMock).toHaveBeenCalled()
    expect(client).toBe(supabase)
  })
})

describe('customers/[id] PATCH — cross-tenant is Not found', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    createClientMock.mockImplementation(async () => supabase as never)
    vi.mocked(requireProfile).mockResolvedValue(
      makeTestProfile({ id: 'user-a', org_id: ORG_ID }) as Awaited<ReturnType<typeof requireProfile>>,
    )
  })

  it('returns 404 when customer row is outside org (RLS-style empty)', async () => {
    const cust = supabase._table('customers') as QueryBuilderStub
    ;(cust.maybeSingle as Mock).mockResolvedValueOnce({ data: null, error: null })

    const req = new NextRequest('http://localhost/api/customers/cx', {
      method:  'PATCH',
      headers: { 'content-type': 'application/json' },
      body:    JSON.stringify({ name: 'X' }),
    })

    const res = await patchCustomer(req, { params: Promise.resolve({ id: 'cx' }) })
    expect(res.status).toBe(404)
  })
})
