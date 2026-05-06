/**
 * POST /api/stripe/bhph-ach — signature, finalize idempotency, ACH failure ledger.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))

const { constructEventMock, finalizeMock, recordFailureMock, sendSmsMock, serviceHolder } = vi.hoisted(
  () => ({
    constructEventMock: vi.fn(),
    finalizeMock: vi.fn().mockResolvedValue({ ok: true }),
    recordFailureMock: vi.fn().mockResolvedValue(true),
    sendSmsMock: vi.fn().mockResolvedValue({ ok: true as const }),
    serviceHolder: { supabase: null as ReturnType<typeof makeSupabaseForWebhook> | null },
  }),
)

vi.mock('stripe', () => ({
  default: {
    webhooks: {
      constructEvent: (...args: unknown[]) => constructEventMock(...args),
    },
  },
}))

vi.mock('@/lib/bhph/achPull', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/bhph/achPull')>()
  return {
    ...actual,
    finalizeBhphPaymentRpc: finalizeMock,
    recordAchFailureLedger: recordFailureMock,
  }
})

vi.mock('@/lib/bhph/twilioOutbound', () => ({
  sendTwilioSms: sendSmsMock,
  toE164Us: (p: string) => (p.startsWith('+') ? p : `+1${p}`),
}))

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => {
    if (!serviceHolder.supabase) throw new Error('tests must set serviceHolder.supabase')
    return serviceHolder.supabase
  },
}))

function makeSupabaseForWebhook(opts: {
  dedupErrors: Array<{ code?: string; message?: string } | null>
  tokenAmount?: number | null
  orgSettingsRow?: { dealer_cell_number: string | null; business_name?: string } | null
}) {
  let dedupIdx = 0
  const insertMock = vi.fn(() => ({
    then: (onFulfilled: (v: unknown) => unknown) => {
      const err = opts.dedupErrors[dedupIdx] ?? null
      dedupIdx += 1
      return Promise.resolve(onFulfilled({ data: null, error: err }))
    },
  }))

  const fromMock = vi.fn((table: string) => {
    if (table === 'processed_stripe_events') {
      return { insert: insertMock }
    }
    if (table === 'bhph_payment_tokens') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({
              data:
                opts.tokenAmount == null
                  ? null
                  : { id: 'token-row-1', amount: opts.tokenAmount },
              error: null,
            }),
          })),
        })),
      }
    }
    if (table === 'org_settings') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({
              data: opts.orgSettingsRow ?? { dealer_cell_number: '+15559876543', business_name: 'Test' },
              error: null,
            }),
          })),
        })),
      }
    }
    if (table === 'bhph_payments') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                customer: { primary_phone: '5551112222', sms_opt_out: false },
              },
              error: null,
            }),
          })),
        })),
        update: vi.fn(() => ({
          eq: vi.fn().mockResolvedValue({ data: null, error: null }),
        })),
      }
    }
    return { insert: vi.fn(() => ({ then: (fn: (v: unknown) => unknown) => fn({ error: null }) })) }
  })

  return { from: fromMock, insertMock }
}

describe('POST /api/stripe/bhph-ach', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.STRIPE_BHPH_ACH_WEBHOOK_SECRET = 'whsec_test_secret'
    finalizeMock.mockResolvedValue({ ok: true })
    recordFailureMock.mockResolvedValue(true)
    constructEventMock.mockImplementation((body: string) => JSON.parse(body as string))
    serviceHolder.supabase = null
  })

  it('400 when Stripe signature is invalid', async () => {
    constructEventMock.mockImplementationOnce(() => {
      throw Object.assign(new Error('bad sig'), { type: 'StripeSignatureVerificationError' })
    })
    serviceHolder.supabase = makeSupabaseForWebhook({ dedupErrors: [null] })

    const { POST } = await import('@/app/api/stripe/bhph-ach/route')
    const res = await POST(
      new NextRequest('http://localhost/api/stripe/bhph-ach', {
        method: 'POST',
        body: '{}',
        headers: { 'stripe-signature': 'v1=bad' },
      }),
    )
    expect(res.status).toBe(400)
    expect(finalizeMock).not.toHaveBeenCalled()
  })

  it('payment_intent.succeeded: finalize_bhph_payment called; duplicate event skips finalize', async () => {
    const event = {
      id: 'evt_pi_ok_1',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_test_1',
          metadata: {
            bhph_payment_token: 'token-row-1',
            payment_date: '2026-05-05',
          },
        },
      },
    }
    constructEventMock.mockReturnValue(event)
    serviceHolder.supabase = makeSupabaseForWebhook({
      dedupErrors: [null, { code: '23505' }],
      tokenAmount: 199.5,
    })

    const { POST } = await import('@/app/api/stripe/bhph-ach/route')

    const res1 = await POST(
      new NextRequest('http://localhost/api', {
        method: 'POST',
        body: JSON.stringify(event),
        headers: { 'stripe-signature': 'v1=ok' },
      }),
    )
    expect(res1.status).toBe(200)
    expect(finalizeMock).toHaveBeenCalledTimes(1)
    expect(finalizeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenId: 'token-row-1',
        paymentIntentId: 'pi_test_1',
        amount: 199.5,
        paymentDateYmd: '2026-05-05',
      }),
    )

    const res2 = await POST(
      new NextRequest('http://localhost/api', {
        method: 'POST',
        body: JSON.stringify(event),
        headers: { 'stripe-signature': 'v1=ok' },
      }),
    )
    expect(res2.status).toBe(200)
    expect(finalizeMock).toHaveBeenCalledTimes(1)
  })

  it('payment_intent.payment_failed: records failed_ach, notifies dealer; does not finalize', async () => {
    const event = {
      id: 'evt_pi_fail_1',
      type: 'payment_intent.payment_failed',
      data: {
        object: {
          id: 'pi_fail_1',
          amount: 15000,
          metadata: {
            bhph_id: 'bhph-contract-1',
            org_id: 'org-111',
            payment_date: '2026-05-05',
          },
          last_payment_error: {
            code: 'insufficient_funds',
            message: 'Insufficient funds',
            decline_code: 'insufficient_funds',
          },
        },
      },
    }
    constructEventMock.mockReturnValue(event)
    serviceHolder.supabase = makeSupabaseForWebhook({ dedupErrors: [null] })

    const { POST } = await import('@/app/api/stripe/bhph-ach/route')
    const res = await POST(
      new NextRequest('http://localhost/api', {
        method: 'POST',
        body: JSON.stringify(event),
        headers: { 'stripe-signature': 'v1=ok' },
      }),
    )
    expect(res.status).toBe(200)
    expect(finalizeMock).not.toHaveBeenCalled()
    expect(recordFailureMock).toHaveBeenCalledWith(
      expect.objectContaining({
        contractId: 'bhph-contract-1',
        paymentDateYmd: '2026-05-05',
        attemptedAmount: 150,
        stripePaymentIntentId: 'pi_fail_1',
      }),
    )
    expect(sendSmsMock).toHaveBeenCalled()
    const dealerText = sendSmsMock.mock.calls[0]?.[1] as string
    expect(dealerText).toContain('ACH payment failed')
  })
})
