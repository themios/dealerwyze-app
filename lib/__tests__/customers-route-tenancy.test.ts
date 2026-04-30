import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { makeTestClient, makeTestProfile } from './helpers/testClient'

const { supabase, ORG_ID, ORG_B_ID } = makeTestClient()

vi.mock('server-only', () => ({}))

vi.mock('@/lib/auth/profile', () => ({
  requireProfile: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => supabase,
}))

import { requireProfile } from '@/lib/auth/profile'
import { DELETE, PATCH } from '@/app/api/customers/[id]/route'

const mockedRequireProfile = vi.mocked(requireProfile)
type CustomerTableStub = ReturnType<typeof supabase._table>

function makeRequest(method: 'PATCH' | 'DELETE', body?: Record<string, unknown>) {
  return new Request('http://localhost/api/customers/customer-1', {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  }) as unknown as NextRequest
}

const routeParams = { params: Promise.resolve({ id: 'customer-1' }) }

describe('customers/[id] tenancy boundaries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedRequireProfile.mockResolvedValue(makeTestProfile({ org_id: ORG_ID, role: 'admin' }) as Awaited<ReturnType<typeof requireProfile>>)
  })

  it('returns 404 for PATCH when the customer belongs to a different org', async () => {
    const customers = supabase._table('customers') as CustomerTableStub
    customers.maybeSingle.mockResolvedValueOnce({ data: null, error: null })

    const res = await PATCH(makeRequest('PATCH', { archived: true }), routeParams)

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Not found' })
    expect(customers.maybeSingle).toHaveBeenCalled()
    expect(customers.update).not.toHaveBeenCalled()
    expect(customers.eq).toHaveBeenCalledWith('user_id', ORG_ID)
    expect(customers.eq).not.toHaveBeenCalledWith('user_id', ORG_B_ID)
  })

  it('returns 404 for DELETE when the customer belongs to a different org and skips cleanup writes', async () => {
    const customers = supabase._table('customers') as CustomerTableStub
    const vehicles = supabase._table('vehicles') as CustomerTableStub
    const tasks = supabase._table('tasks') as CustomerTableStub

    customers.maybeSingle.mockResolvedValueOnce({ data: null, error: null })

    const res = await DELETE(makeRequest('DELETE'), routeParams)

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Not found' })
    expect(vehicles.update).not.toHaveBeenCalled()
    expect(tasks.delete).not.toHaveBeenCalled()
    expect(customers.delete).not.toHaveBeenCalled()
  })
})
