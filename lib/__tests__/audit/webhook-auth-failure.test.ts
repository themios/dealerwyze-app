/**
 * AUDIT-05: Twilio invalid signature → webhook_auth_failure audit row
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const validateTwilioSignature = vi.fn()
const writeAuditLog = vi.fn()

vi.mock('server-only', () => ({}))

vi.mock('@/lib/audit/log', () => ({
  writeAuditLog: (...args: unknown[]) => writeAuditLog(...args),
}))

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

describe('webhook_auth_failure audit (Twilio)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('TWILIO_AUTH_TOKEN', 'tok')
    vi.stubEnv('TWILIO_LEGACY_FALLBACK_ENABLED', 'false')
    validateTwilioSignature.mockReturnValue(false)
  })

  it('calls writeAuditLog when signature is invalid', async () => {
    const body = formBody({ From: '+1', To: '+2', Body: 'Hi' })
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
    expect(writeAuditLog).toHaveBeenCalledWith({
      orgId:     null,
      actorId:   null,
      actorType: 'user',
      action:    'webhook_auth_failure',
      metadata:  { path: '/api/twilio/inbound', reason: 'invalid_signature' },
    })
  })
})
