/**
 * POST /api/bhph/[id]/confirm-manual-payment
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

const { sendSmsMock } = vi.hoisted(() => ({
  sendSmsMock: vi.fn().mockResolvedValue({ ok: true }),
}))

vi.mock('@/lib/bhph/twilioOutbound', () => ({
  sendTwilioSms: sendSmsMock,
  toE164Us: () => '+15551234567',
}))

import { POST } from '@/app/api/bhph/[id]/confirm-manual-payment/route'

const params = (id: string) => ({ params: Promise.resolve({ id }) })
const PAST = '2020-06-15'

function jsonReq(body: unknown) {
  return new NextRequest('http://localhost/api/bhph/c1/confirm-manual-payment', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/bhph/[id]/confirm-manual-payment', () => {
  beforeEach(() => {
    getProfileMock.mockReset()
    getProfileMock.mockResolvedValue(makeTestProfile({ id: USER_ID, org_id: ORG_ID, role: 'dealer_admin' }))
    ;(supabase.rpc as Mock).mockReset()
    ;(supabase.rpc as Mock).mockResolvedValue({
      data: { ok: true, ledger_id: 'l1', new_balance: 800, paid_off: false },
      error: null,
    })
    sendSmsMock.mockClear()
  })

  it('403 for dealer_rep', async () => {
    getProfileMock.mockResolvedValueOnce(makeTestProfile({ role: 'dealer_rep', org_id: ORG_ID }))
    const res = await POST(jsonReq({ amount: 50, paymentDate: PAST }), params('c1'))
    expect(res.status).toBe(403)
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('403 cross-tenant', async () => {
    const bhph = supabase._table('bhph_payments') as QueryBuilderStub
    vi.mocked(bhph.maybeSingle).mockResolvedValueOnce({
      data: {
        id: 'c1',
        user_id: ORG_B_ID,
        customer_id: 'cu1',
        customer: { name: 'A', primary_phone: '555', sms_opt_out: false },
        vehicle: { year: 2020, make: 'X', model: 'Y' },
      },
      error: null,
    })
    const res = await POST(jsonReq({ amount: 50, paymentDate: PAST }), params('c1'))
    expect(res.status).toBe(403)
  })

  it('400 invalid amount', async () => {
    const bhph = supabase._table('bhph_payments') as QueryBuilderStub
    vi.mocked(bhph.maybeSingle).mockResolvedValueOnce({
      data: {
        id: 'c1',
        user_id: ORG_ID,
        customer_id: 'cu1',
        customer: { name: 'A', primary_phone: '555', sms_opt_out: false },
        vehicle: { year: 2020, make: 'X', model: 'Y' },
      },
      error: null,
    })
    const res = await POST(jsonReq({ amount: 0, paymentDate: PAST }), params('c1'))
    expect(res.status).toBe(400)
  })

  it('400 future date', async () => {
    const future = new Date()
    future.setDate(future.getDate() + 5)
    const ymd = future.toISOString().slice(0, 10)
    const bhph = supabase._table('bhph_payments') as QueryBuilderStub
    vi.mocked(bhph.maybeSingle).mockResolvedValueOnce({
      data: {
        id: 'c1',
        user_id: ORG_ID,
        customer_id: 'cu1',
        customer: { name: 'A', primary_phone: '555', sms_opt_out: false },
        vehicle: { year: 2020, make: 'X', model: 'Y' },
      },
      error: null,
    })
    const res = await POST(jsonReq({ amount: 50, paymentDate: ymd }), params('c1'))
    expect(res.status).toBe(400)
  })

  it('200 happy path: RPC manual, fields cleared, SMS sent', async () => {
    const bhph = supabase._table('bhph_payments') as QueryBuilderStub
    vi.mocked(bhph.maybeSingle).mockResolvedValueOnce({
      data: {
        id: 'c1',
        user_id: ORG_ID,
        customer_id: 'cu1',
        customer: { name: 'Jane Doe', primary_phone: '5551234567', sms_opt_out: false },
        vehicle: { year: 2021, make: 'Ford', model: 'F-150' },
      },
      error: null,
    })
    const settings = supabase._table('org_settings') as QueryBuilderStub
    vi.mocked(settings.maybeSingle).mockResolvedValueOnce({
      data: { business_name: 'Best Cars' },
      error: null,
    })
    vi.mocked(bhph.update).mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    } as never)

    const res = await POST(
      jsonReq({ amount: 125, paymentDate: PAST, notes: 'Zelle' }),
      params('c1'),
    )
    expect(res.status).toBe(200)
    expect(supabase.rpc).toHaveBeenCalledWith(
      'record_bhph_manual_payment',
      expect.objectContaining({
        p_contract_id: 'c1',
        p_amount: 125,
        p_payment_date: PAST,
        p_payment_type: 'manual',
        p_recorded_by: USER_ID,
      }),
    )
    expect(bhph.update).toHaveBeenCalled()
    const upd = vi.mocked(bhph.update).mock.calls[0]?.[0] as Record<string, unknown>
    expect(upd?.pending_manual_payment_at).toBeNull()
    expect(upd?.manual_payment_confirmed_at).toBeDefined()
    expect(sendSmsMock).toHaveBeenCalled()
    const smsText = sendSmsMock.mock.calls[0]?.[1] as string
    expect(smsText).toContain('confirmed')
    expect(smsText).toContain('Reply STOP to opt out.')
  })
})
