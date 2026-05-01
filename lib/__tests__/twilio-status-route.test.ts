import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import crypto from 'crypto'

vi.mock('server-only', () => ({}))

const { mockFrom } = vi.hoisted(() => ({
  mockFrom: vi.fn().mockReturnValue({
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue({ error: null }),
  }),
}))

vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => ({ from: mockFrom }) }))

import { POST } from '@/app/api/twilio/status/route'

const AUTH_TOKEN = 'test-auth-token'
const WEBHOOK_URL = 'https://dealerwyze.com/api/twilio/status'

function sign(params: Record<string, string>): string {
  const sorted = Object.keys(params).sort().reduce((s, k) => s + k + params[k], '')
  return crypto.createHmac('sha1', AUTH_TOKEN).update(WEBHOOK_URL + sorted).digest('base64')
}

function makeRequest(params: Record<string, string>, signature: string): NextRequest {
  return new NextRequest(WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'x-twilio-signature': signature,
    },
    body: new URLSearchParams(params).toString(),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.TWILIO_AUTH_TOKEN = AUTH_TOKEN
  process.env.NEXT_PUBLIC_APP_URL = 'https://dealerwyze.com'
})

describe('POST /api/twilio/status', () => {
  it('rejects invalid signatures', async () => {
    const req = makeRequest({ MessageSid: 'SM123', MessageStatus: 'delivered' }, 'bad-signature')
    const res = await POST(req)
    expect(res.status).toBe(403)
  })

  it('persists delivery status updates for a valid callback', async () => {
    const params = { MessageSid: 'SM123', MessageStatus: 'delivered' }
    const req = makeRequest(params, sign(params))
    const res = await POST(req)

    expect(res.status).toBe(204)
    const builder = mockFrom.mock.results[0]?.value
    expect(builder.update).toHaveBeenCalledWith(expect.objectContaining({
      delivery_status: 'delivered',
    }))
    expect(builder.eq).toHaveBeenCalledWith('twilio_sid', 'SM123')
  })
})
