import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { makeTestClient, makeTestProfile } from './helpers/testClient'

vi.mock('server-only', () => ({}))

const { supabase } = makeTestClient()

const { mockRequireProfile, mockDeliverPulseSurvey } = vi.hoisted(() => ({
  mockRequireProfile: vi.fn(),
  mockDeliverPulseSurvey: vi.fn(),
}))

vi.mock('@/lib/auth/profile', () => ({
  requireProfile: mockRequireProfile,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => supabase,
}))

vi.mock('@/lib/pulse/deliver', () => ({
  deliverPulseSurvey: mockDeliverPulseSurvey,
}))

function makeReq(body: unknown): NextRequest {
  return new NextRequest('https://dealerwyze.com/api/bhph/create', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/bhph/create', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireProfile.mockResolvedValue(makeTestProfile({ role: 'dealer_admin' }))
  })

  it('rejects deferred payment plans that do not match the remaining down payment', async () => {
    const { POST } = await import('@/app/api/bhph/create/route')
    const res = await POST(makeReq({
      vehicle_id: 'veh-1',
      sold_price: '12000',
      finance_type: 'bhph',
      customer_id: 'cust-1',
      down_payment: '1000',
      required_down_payment: '3000',
      loan_amount: '9000',
      monthly_payment: '350',
      payment_frequency: 'monthly',
      payment_day: '1',
      first_due_date: '2026-05-15',
      sms_consent: true,
      email_consent: false,
      deferred_payments: [
        { due_date: '2026-05-20', amount: 500 },
        { due_date: '2026-06-05', amount: 500 },
      ],
    }))
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.error).toMatch(/Deferred payments must equal/)
    expect(supabase.rpc).not.toHaveBeenCalled()
  })
})
