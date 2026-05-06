/**
 * Twilio inbound webhook — signature gate (403 when invalid).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const validateTwilioSignature = vi.fn()

vi.mock('server-only', () => ({}))

vi.mock('@/lib/twilio/signature', () => ({
  validateTwilioSignature: (...args: unknown[]) => validateTwilioSignature(...args),
  getTwilioWebhookBase: () => 'https://example.com',
}))

vi.mock('@/lib/orgs/lookup', () => ({
  getOrgIdByPhone: vi.fn().mockResolvedValue(null),
}))

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
  }),
}))

vi.mock('@/lib/push/send', () => ({ sendLeadNotification: vi.fn() }))
vi.mock('@/lib/notifications/telegram', () => ({ sendTelegramMessage: vi.fn() }))
vi.mock('@/lib/sms/detectAppointment', () => ({ detectAppointment: vi.fn() }))
vi.mock('@/lib/sms/quota', () => ({ incrementUsage: vi.fn() }))
vi.mock('@/lib/sms/threadState', () => ({ transitionThreadState: vi.fn() }))
vi.mock('@/lib/sms/parseDealerCommand', () => ({ parseDealerAppointment: vi.fn() }))
vi.mock('@/lib/leads/parseOfferUpSms', () => ({
  isOfferUpLead: vi.fn(() => false),
  parseOfferUpLead: vi.fn(),
}))
vi.mock('@/lib/google/calendar', () => ({ createCalendarEvent: vi.fn() }))
vi.mock('@/lib/sequences/stopSequenceOnReply', () => ({
  stopSequenceOnReply: vi.fn(),
  cancelSequenceOnUnsubscribe: vi.fn(),
}))
vi.mock('@/lib/webhooks/dispatch', () => ({ dispatchWebhook: vi.fn() }))
vi.mock('@/lib/leads/conversationScore', () => ({ enqueueConversationRescore: vi.fn() }))

import { POST } from '@/app/api/twilio/inbound/route'

function formBody(obj: Record<string, string>) {
  return new URLSearchParams(obj).toString()
}

describe('POST /api/twilio/inbound', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('TWILIO_AUTH_TOKEN', 'test-auth-token')
    vi.stubEnv('TWILIO_LEGACY_FALLBACK_ENABLED', 'false')
  })

  it('returns 403 when Twilio signature is invalid', async () => {
    validateTwilioSignature.mockReturnValue(false)
    const body = formBody({ From: '+15551110001', To: '+15552220002', Body: 'Hi' })
    const req = new NextRequest('http://localhost/api/twilio/inbound', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'x-twilio-signature': 'bad',
      },
      body,
    })
    const res = await POST(req)
    expect(res.status).toBe(403)
  })

  it('proceeds past auth when signature is valid (200, not 403)', async () => {
    validateTwilioSignature.mockReturnValue(true)
    const body = formBody({ From: '+15551110001', To: '+15552220002', Body: 'Hi' })
    const req = new NextRequest('http://localhost/api/twilio/inbound', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'x-twilio-signature': 'good',
      },
      body,
    })
    const res = await POST(req)
    expect(res.status).not.toBe(403)
    expect(validateTwilioSignature).toHaveBeenCalled()
  })
})
