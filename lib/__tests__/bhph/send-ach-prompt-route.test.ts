/**
 * POST /api/bhph/[id]/send-ach-prompt — role, tenancy, cooldown, Twilio.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

import {
  makeTestClient,
  makeTestProfile,
  type QueryBuilderStub,
} from '../helpers/testClient'

vi.mock('server-only', () => ({}))

const { supabase, ORG_ID, ORG_B_ID } = makeTestClient()

const { mockRequireProfile } = vi.hoisted(() => ({
  mockRequireProfile: vi.fn(),
}))

vi.mock('@/lib/auth/profile', () => ({
  requireProfile: mockRequireProfile,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => supabase),
}))

const { sendTwilioSmsMock } = vi.hoisted(() => ({
  sendTwilioSmsMock: vi.fn().mockResolvedValue({ ok: true as const }),
}))

vi.mock('@/lib/bhph/twilioOutbound', () => ({
  sendTwilioSms: sendTwilioSmsMock,
  toE164Us: () => '+15551234567',
}))

const CONTRACT_ID = 'contract-ach-0000-0000-0000-000000000001'

function contractRow(overrides: Partial<{
  user_id: string
  status: string
  ach_setup_sent_at: string | null
  sms_consent: boolean
}>) {
  return {
    id: CONTRACT_ID,
    user_id: ORG_ID,
    customer_id: 'cust-1',
    status: 'active',
    ach_setup_sent_at: null as string | null,
    sms_consent: true,
    customer: {
      id: 'cust-1',
      name: 'Jane Buyer',
      primary_phone: '5551234567',
      sms_opt_out: false,
    },
    vehicle: { year: 2022, make: 'Honda', model: 'Civic' },
    ...overrides,
  }
}

describe('POST /api/bhph/[id]/send-ach-prompt', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.BHPH_ACH_SECRET = 'test-bhph-ach-secret-16chars-min'
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.test'
    mockRequireProfile.mockResolvedValue(
      makeTestProfile({ role: 'dealer_admin', org_id: ORG_ID }),
    )
    const bhph = supabase._table('bhph_payments') as QueryBuilderStub
    vi.mocked(bhph.maybeSingle).mockResolvedValue({
      data: contractRow({}),
      error: null,
    })
  })

  it('403 for dealer_rep role', async () => {
    mockRequireProfile.mockResolvedValueOnce(
      makeTestProfile({ role: 'dealer_rep', org_id: ORG_ID }),
    )
    const { POST } = await import('@/app/api/bhph/[id]/send-ach-prompt/route')
    const res = await POST(new NextRequest('http://localhost/api'), {
      params: Promise.resolve({ id: CONTRACT_ID }),
    })
    expect(res.status).toBe(403)
    expect(sendTwilioSmsMock).not.toHaveBeenCalled()
  })

  it('403 when contract belongs to another org', async () => {
    const bhph = supabase._table('bhph_payments') as QueryBuilderStub
    vi.mocked(bhph.maybeSingle).mockResolvedValueOnce({
      data: contractRow({ user_id: ORG_B_ID }),
      error: null,
    })
    const { POST } = await import('@/app/api/bhph/[id]/send-ach-prompt/route')
    const res = await POST(new NextRequest('http://localhost/api'), {
      params: Promise.resolve({ id: CONTRACT_ID }),
    })
    expect(res.status).toBe(403)
    expect(sendTwilioSmsMock).not.toHaveBeenCalled()
  })

  it('429 when ach_setup_sent_at is within 24h', async () => {
    const recent = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const bhph = supabase._table('bhph_payments') as QueryBuilderStub
    vi.mocked(bhph.maybeSingle).mockResolvedValueOnce({
      data: contractRow({ ach_setup_sent_at: recent }),
      error: null,
    })
    const { POST } = await import('@/app/api/bhph/[id]/send-ach-prompt/route')
    const res = await POST(new NextRequest('http://localhost/api'), {
      params: Promise.resolve({ id: CONTRACT_ID }),
    })
    expect(res.status).toBe(429)
    expect(sendTwilioSmsMock).not.toHaveBeenCalled()
  })

  it('200 happy path: Twilio called, ach_setup_sent_at updated', async () => {
    const bhph = supabase._table('bhph_payments') as QueryBuilderStub
    const { POST } = await import('@/app/api/bhph/[id]/send-ach-prompt/route')
    const res = await POST(new NextRequest('http://localhost/api'), {
      params: Promise.resolve({ id: CONTRACT_ID }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { ok?: boolean }
    expect(body.ok).toBe(true)

    expect(sendTwilioSmsMock).toHaveBeenCalledTimes(1)
    const smsArg = sendTwilioSmsMock.mock.calls[0]?.[1] as string
    expect(smsArg).toContain('Jane')
    expect(smsArg).toContain('2022 Honda Civic')
    expect(smsArg).toContain('/pay/ach/')

    expect(bhph.update).toHaveBeenCalled()
    const upd = vi.mocked(bhph.update).mock.calls[0]?.[0] as { ach_setup_sent_at?: string }
    expect(upd?.ach_setup_sent_at).toBeDefined()
  })
})
