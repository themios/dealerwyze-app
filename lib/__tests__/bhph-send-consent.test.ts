import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const { mockCreateServiceClient, mockGetOrCreatePaymentToken } = vi.hoisted(() => ({
  mockCreateServiceClient: vi.fn(),
  mockGetOrCreatePaymentToken: vi.fn(),
}))

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: mockCreateServiceClient,
}))

vi.mock('@/lib/bhph/paymentToken', () => ({
  getOrCreatePaymentToken: mockGetOrCreatePaymentToken,
  buildPayUrl: vi.fn().mockReturnValue('https://dealerwyze.com/pay/test'),
}))

describe('sendBhphReminder consent gating', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetOrCreatePaymentToken.mockResolvedValue(null)
    mockCreateServiceClient.mockReturnValue({
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockResolvedValue({ error: null }),
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      }),
    })
    process.env.TWILIO_ACCOUNT_SID = 'sid'
    process.env.TWILIO_AUTH_TOKEN = 'token'
    process.env.TWILIO_FROM_NUMBER = '+15551234567'
    process.env.RESEND_API_KEY = 'resend'
  })

  it('does not send SMS or email when no consent is present', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }))
    const { sendBhphReminder } = await import('@/lib/bhph/send')

    const result = await sendBhphReminder({
      bhphId: 'bhph-1',
      userId: 'org-1',
      customerId: 'cust-1',
      customerPhone: '+15557654321',
      customerEmail: 'buyer@example.com',
      customerSmsOptedOut: false,
      smsConsent: false,
      emailConsent: false,
      reminderType: 'due_day',
      dealerTimezone: 'America/Los_Angeles',
      dealerPhone: '(800) 555-0000',
      amount: 250,
      messageVars: {
        customerName: 'Jane Buyer',
        amount: 250,
        dueDate: '2026-05-05',
        dealerPhone: '(800) 555-0000',
        dealerName: 'Apollo Auto',
        vehicleLabel: '2019 Dodge Grand Caravan',
        paymentContext: 'loan',
      },
    })

    expect(result.sms).toBe('skipped_optout')
    expect(result.email).toBe('skipped_optout')
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })
})
