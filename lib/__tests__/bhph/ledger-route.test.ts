/**
 * GET /api/bhph/[id]/ledger — auth, tenancy, ledger query wiring.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeTestClient, makeTestProfile, type QueryBuilderStub } from '../helpers/testClient'

vi.mock('server-only', () => ({}))

const { supabase, ORG_ID, ORG_B_ID, USER_ID } = makeTestClient()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => supabase),
}))

const { getProfileMock } = vi.hoisted(() => ({
  getProfileMock: vi.fn(),
}))

vi.mock('@/lib/auth/profile', () => ({
  getProfile: getProfileMock,
  normalizeOwnerRole: (p: { id: string; org_id: string; role: string }) => p,
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: () => undefined,
  })),
}))

vi.mock('@/lib/auth/staffSession', () => ({
  getStaffSessionInfo: vi.fn(() => null),
}))

vi.mock('@/lib/auth/dealerRoles', () => ({
  canAccessBhph: vi.fn(() => true),
}))

import { GET } from '@/app/api/bhph/[id]/ledger/route'

const params = (id: string) => ({ params: Promise.resolve({ id }) })

const LEDGER_ROW = {
  id:                   'leg-1',
  user_id:              ORG_ID,
  bhph_contract_id:     'contract-1',
  customer_id:          'cust-1',
  payment_date:         '2024-06-15',
  amount_paid:          250,
  interest_portion:     12.34,
  principal_portion:    237.66,
  principal_balance_after: 8762.34,
  days_since_last:      30,
  payment_type:         'regular',
  stripe_payment_intent_id: null,
  notes:                'Cash',
  recorded_by:          USER_ID,
  created_at:           '2024-06-15T18:00:00Z',
}

describe('GET /api/bhph/[id]/ledger', () => {
  beforeEach(() => {
    getProfileMock.mockReset()
    getProfileMock.mockResolvedValue(makeTestProfile({ id: USER_ID, org_id: ORG_ID, role: 'dealer_admin' }))
    const bhph = supabase._table('bhph_payments') as QueryBuilderStub
    vi.mocked(bhph.maybeSingle).mockResolvedValue({
      data: { id: 'contract-1', user_id: ORG_ID },
      error: null,
    })
    const ledger = supabase._table('bhph_payment_ledger') as QueryBuilderStub
    ledger.then = vi.fn((onF?: (v: unknown) => unknown) =>
      Promise.resolve({
        data:   [LEDGER_ROW],
        error:  null,
      }).then(onF as never)) as typeof ledger.then
  })

  it('401 when unauthenticated (no profile)', async () => {
    getProfileMock.mockResolvedValueOnce(null)
    const res = await GET(new Request('http://localhost/api/bhph/c1/ledger'), params('contract-1'))
    expect(res.status).toBe(401)
  })

  it('403 when contract belongs to another org', async () => {
    const bhph = supabase._table('bhph_payments') as QueryBuilderStub
    vi.mocked(bhph.maybeSingle).mockResolvedValueOnce({
      data: { id: 'contract-1', user_id: ORG_B_ID },
      error: null,
    })
    const res = await GET(new Request('http://localhost/api/bhph/c1/ledger'), params('contract-1'))
    expect(res.status).toBe(403)
  })

  it('200 returns entries in query order (payment_date DESC from DB)', async () => {
    const older = { ...LEDGER_ROW, id: 'leg-2', payment_date: '2024-05-01', created_at: '2024-05-01T12:00:00Z' }
    const newer = { ...LEDGER_ROW, id: 'leg-1', payment_date: '2024-06-15', created_at: '2024-06-15T18:00:00Z' }
    const ledger = supabase._table('bhph_payment_ledger') as QueryBuilderStub
    ledger.then = vi.fn((onF?: (v: unknown) => unknown) =>
      Promise.resolve({ data: [newer, older], error: null }).then(onF as never)) as typeof ledger.then

    const res = await GET(new Request('http://localhost/api/bhph/c1/ledger'), params('contract-1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.entries)).toBe(true)
    expect(body.entries).toHaveLength(2)
    expect(body.entries[0].payment_date).toBe('2024-06-15')
    expect(body.entries[1].payment_date).toBe('2024-05-01')
  })

  it('200 empty array when no ledger rows', async () => {
    const ledger = supabase._table('bhph_payment_ledger') as QueryBuilderStub
    ledger.then = vi.fn((onF?: (v: unknown) => unknown) =>
      Promise.resolve({ data: [], error: null }).then(onF as never)) as typeof ledger.then

    const res = await GET(new Request('http://localhost/api/bhph/c1/ledger'), params('contract-1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.entries).toEqual([])
  })
})
