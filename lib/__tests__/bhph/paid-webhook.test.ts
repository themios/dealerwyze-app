/**
 * Twilio /api/bhph/webhook — PAID keyword + STOP regression
 */

import crypto from 'crypto'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))

const ORG_ID = 'org-111'

vi.mock('@/lib/orgs/lookup', () => ({
  getOrgIdByPhone: vi.fn().mockResolvedValue(ORG_ID),
}))

const sendSms = vi.fn().mockResolvedValue({ ok: true })
vi.mock('@/lib/bhph/twilioOutbound', () => ({
  sendTwilioSms: (...a: unknown[]) => sendSms(...a),
  toE164Us: (p: string) => {
    const d = p.replace(/\D/g, '')
    return d.length >= 10 ? `+1${d.slice(-10)}` : null
  },
}))

function paidScenarioService() {
  return {
    from: vi.fn((table: string) => {
      if (table === 'customers') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              or: vi.fn().mockResolvedValue({
                data: [{ id: 'cust-1', name: 'Jane Buyer' }],
                error: null,
              }),
            }),
          }),
        }
      }
      if (table === 'bhph_payments') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                in: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue({
                      data: [{
                        id: 'bhph-1',
                        user_id: ORG_ID,
                        customer_id: 'cust-1',
                        monthly_payment: 199,
                        customer: { name: 'Jane Buyer' },
                        vehicle: { year: 2021, make: 'Ford', model: 'F-150' },
                      }],
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
              in: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ error: null }),
              }),
            }),
          }),
        }
      }
      if (table === 'org_settings') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  dealer_cell_number: '+15550001234',
                  business_phone: null,
                  business_name: 'Acme Motors',
                },
                error: null,
              }),
            }),
          }),
        }
      }
      return {}
    }),
  }
}

const createClient = vi.fn()
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => createClient(),
}))

function twilioSign(url: string, body: string, token: string) {
  const paramObj = Object.fromEntries(new URLSearchParams(body).entries())
  const sorted = Object.keys(paramObj).sort().reduce((s, k) => s + k + paramObj[k], '')
  return crypto.createHmac('sha1', token).update(url + sorted).digest('base64')
}

describe('POST /api/bhph/webhook', () => {
  beforeEach(() => {
    process.env.TWILIO_AUTH_TOKEN = 'test-token'
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.test'
    createClient.mockReturnValue(paidScenarioService())
    sendSms.mockClear()
  })

  it('PAID (case variation): pending manual, customer TwiML, dealer SMS', async () => {
    const { POST } = await import('@/app/api/bhph/webhook/route')
    const body = new URLSearchParams({
      From: '+15551234567',
      To: '+15559876543',
      Body: 'paid',
    }).toString()
    const url = 'https://app.test/api/bhph/webhook'
    const sig = twilioSign(url, body, 'test-token')
    const res = await POST(
      new NextRequest(url, {
        method: 'POST',
        body,
        headers: { 'x-twilio-signature': sig },
      }),
    )
    expect(res.status).toBe(200)
    const xml = await res.text()
    expect(xml).toContain('Thanks')
    expect(xml).toContain('Reply STOP to opt out')
    expect(sendSms).toHaveBeenCalled()
  })

  it('no active contract: instructs customer to call dealer', async () => {
    createClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === 'customers') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                or: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          }
        }
        if (table === 'org_settings') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    dealer_cell_number: null,
                    business_phone: '555-0001',
                    business_name: 'X',
                  },
                  error: null,
                }),
              }),
            }),
          }
        }
        return {}
      }),
    })
    const { POST } = await import('@/app/api/bhph/webhook/route')
    const body = new URLSearchParams({
      From: '+15551234567',
      To: '+15559876543',
      Body: 'I PAID',
    }).toString()
    const url = 'https://app.test/api/bhph/webhook'
    const sig = twilioSign(url, body, 'test-token')
    const res = await POST(
      new NextRequest(url, { method: 'POST', body, headers: { 'x-twilio-signature': sig } }),
    )
    const xml = await res.text()
    expect(xml.toLowerCase()).toContain('couldn')
    expect(xml).toContain('Reply STOP to opt out')
  })

  it('STOP still invokes customer opt-out update', async () => {
    const customersUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        or: vi.fn().mockResolvedValue({ error: null }),
      }),
    })
    const customersSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        or: vi.fn().mockResolvedValue({ data: [{ id: 'c1' }], error: null }),
      }),
    })
    createClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === 'customers') {
          return {
            update: customersUpdate,
            select: customersSelect,
          }
        }
        if (table === 'bhph_payments') {
          return {
            update: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ error: null }),
              }),
            }),
          }
        }
        return {}
      }),
    })
    const { POST } = await import('@/app/api/bhph/webhook/route')
    const body = new URLSearchParams({
      From: '+15551239999',
      To: '+15559876543',
      Body: 'STOP',
    }).toString()
    const url = 'https://app.test/api/bhph/webhook'
    const sig = twilioSign(url, body, 'test-token')
    await POST(
      new NextRequest(url, { method: 'POST', body, headers: { 'x-twilio-signature': sig } }),
    )
    expect(customersUpdate).toHaveBeenCalled()
  })
})
