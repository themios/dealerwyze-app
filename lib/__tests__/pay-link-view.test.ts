import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { makeTestClient } from './helpers/testClient'

const { supabase } = makeTestClient()

vi.mock('server-only', () => ({}))

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => supabase,
}))

vi.mock('@/lib/rateLimit/upstash', () => ({
  paymentLimiter: vi.fn().mockResolvedValue({ allowed: true }),
}))

import { GET } from '@/app/api/pay/[token]/route'

type MockOnce = { mockResolvedValueOnce: (value: unknown) => unknown }

describe('GET /api/pay/[token] tracking', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    const paymentTokensMaybeSingle = supabase._table('bhph_payment_tokens').maybeSingle as MockOnce
    paymentTokensMaybeSingle.mockResolvedValueOnce({
      data: {
        id: 'token-id-1',
        amount: 250,
        status: 'pending',
        expires_at: '2099-01-01T00:00:00Z',
        org_id: 'org-1',
        customer_id: 'cust-1',
        bhph_contract_id: 'bhph-1',
        customers: { name: 'Jane Buyer' },
        bhph_payments: { monthly_payment: 250, next_due_date: '2099-01-01', vehicles: { year: 2019, make: 'Honda', model: 'Civic' } },
      },
      error: null,
    })
    paymentTokensMaybeSingle.mockResolvedValueOnce({ data: { view_count: 1 }, error: null })

    ;(supabase._table('org_settings').maybeSingle as MockOnce)
      .mockResolvedValueOnce({
        data: { business_name: 'Apollo Auto', stripe_dealer_publishable_key: 'pk_test_123' },
        error: null,
      })

    ;(supabase._table('payment_reminder_log').maybeSingle as MockOnce)
      .mockResolvedValueOnce({
        data: { id: 'reminder-1', click_count: 0 },
        error: null,
      })
  })

  it('returns token details and records a link view against the latest sent SMS reminder', async () => {
    const req = new NextRequest('http://localhost/api/pay/test-token', {
      headers: { 'x-forwarded-for': '1.2.3.4' },
    })

    const res = await GET(req, { params: Promise.resolve({ token: 'test-token' }) })

    expect(res.status).toBe(200)
    expect(supabase._table('bhph_payment_tokens').update).toHaveBeenCalled()
    expect(supabase._table('payment_reminder_log').update).toHaveBeenCalledWith(
      expect.objectContaining({
        click_count: 1,
      })
    )
  })
})
