/**
 * POST /api/bhph/[id]/payment — auth, validation, tenancy, RPC wiring.
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import { NextRequest } from 'next/server'
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

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(() => supabase),
}))

vi.mock('@/lib/bhph/ensureContractFinance', () => ({
  ensureBhphContractFinance: vi.fn(async () => ({
    ok: true,
    repaired: false,
    principalSeeded: false,
    ledgerReplayed: false,
  })),
}))

import { POST } from '@/app/api/bhph/[id]/payment/route'

const params = (id: string) => ({ params: Promise.resolve({ id }) })

function jsonReq(body: unknown) {
  return new NextRequest('http://localhost/api/bhph/c1/payment', {
    method:  'POST',
    headers: { 'content-type': 'application/json' },
    body:    JSON.stringify(body),
  })
}

/** Fixed past date so tests never trip "payment in the future" vs real clock. */
const PAST_PAY_YMD = '2020-06-15'

describe('POST /api/bhph/[id]/payment', () => {
  it('helper: NextRequest body is readable as text', async () => {
    const r = jsonReq({ amount: 100, paymentDate: PAST_PAY_YMD, paymentType: 'regular' })
    const t = await r.text()
    expect(JSON.parse(t).amount).toBe(100)
  })

  beforeEach(() => {
    // Do not vi.clearAllMocks() — it resets query-builder stubs' maybeSingle implementations.
    getProfileMock.mockReset()
    getProfileMock.mockResolvedValue(makeTestProfile({ id: USER_ID, org_id: ORG_ID, role: 'dealer_admin' }))
    ;(supabase.rpc as Mock).mockReset()
    ;(supabase.rpc as Mock).mockResolvedValue({
      data: {
        ok:                true,
        ledger_id:         'ledger-1',
        new_balance:       900,
        paid_off:          false,
        interest_portion:  0,
        principal_portion: 100,
      },
      error: null,
    })
  })

  it('401 when unauthenticated (no profile)', async () => {
    getProfileMock.mockResolvedValueOnce(null)
    const res = await POST(
      jsonReq({ amount: 100, paymentDate: PAST_PAY_YMD, paymentType: 'regular' }),
      params('contract-1'),
    )
    expect(res.status).toBe(401)
  })

  it('403 when contract belongs to another org', async () => {
    const bhph = supabase._table('bhph_payments') as QueryBuilderStub
    vi.mocked(bhph.maybeSingle).mockResolvedValueOnce({
      data: { id: 'contract-1', user_id: ORG_B_ID },
      error: null,
    })
    const res = await POST(
      jsonReq({ amount: 100, paymentDate: PAST_PAY_YMD, paymentType: 'regular' }),
      params('contract-1'),
    )
    expect(res.status).toBe(403)
  })

  it('400 when amount is zero', async () => {
    const bhph = supabase._table('bhph_payments') as QueryBuilderStub
    vi.mocked(bhph.maybeSingle).mockResolvedValueOnce({
      data: { id: 'contract-1', user_id: ORG_ID },
      error: null,
    })
    const res = await POST(
      jsonReq({ amount: 0, paymentDate: PAST_PAY_YMD, paymentType: 'regular' }),
      params('contract-1'),
    )
    expect(res.status).toBe(400)
  })

  it('400 when payment date is in the future', async () => {
    const future = new Date()
    future.setDate(future.getDate() + 7)
    const ymd = future.toISOString().slice(0, 10)

    const bhph = supabase._table('bhph_payments') as QueryBuilderStub
    vi.mocked(bhph.maybeSingle).mockResolvedValueOnce({
      data: { id: 'contract-1', user_id: ORG_ID },
      error: null,
    })
    const res = await POST(
      jsonReq({ amount: 100, paymentDate: ymd, paymentType: 'regular' }),
      params('contract-1'),
    )
    expect(res.status).toBe(400)
  })

  it('200 happy path: calls RPC and returns payload', async () => {
    const payYmd = PAST_PAY_YMD
    const bhph = supabase._table('bhph_payments') as QueryBuilderStub
    vi.mocked(bhph.maybeSingle).mockResolvedValueOnce({
      data: { id: 'contract-1', user_id: ORG_ID },
      error: null,
    })

    const res = await POST(
      jsonReq({ amount: 100, paymentDate: payYmd, paymentType: 'partial', notes: 'cash' }),
      params('contract-1'),
    )
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.ok).toBe(true)
    expect(body.paidOff).toBe(false)
    expect(body.newBalance).toBe(900)
    expect(body.ledgerEntry).toEqual(
      expect.objectContaining({
        id:               'ledger-1',
        interestPortion:  0,
        principalPortion: 100,
      }),
    )

    expect(supabase.rpc).toHaveBeenCalledWith(
      'record_bhph_manual_payment',
      expect.objectContaining({
        p_contract_id:  'contract-1',
        p_amount:       100,
        p_payment_date: payYmd,
        p_payment_type: 'partial',
        p_notes:        'cash',
        p_recorded_by:  USER_ID,
      }),
    )
  })
})
