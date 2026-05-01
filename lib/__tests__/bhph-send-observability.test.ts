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
  buildPayUrl: vi.fn().mockReturnValue('https://dealerwyze.com/pay/test-token'),
}))

// Bypass business-hours gate so tests don't depend on wall-clock time
vi.mock('@/lib/bhph/schedule', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/bhph/schedule')>()),
  isWithinSendHours: () => true,
}))

describe('sendBhphReminder observability', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetOrCreatePaymentToken.mockResolvedValue({ id: 'token-id-1', token: 'test-token' })
    mockCreateServiceClient.mockReturnValue({
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockResolvedValue({ error: null }),
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      }),
    })
    process.env.TWILIO_ACCOUNT_SID = 'sid'
    process.env.TWILIO_AUTH_TOKEN = 'token'
    process.env.TWILIO_FROM_NUMBER = '+15551234567'
    process.env.NEXT_PUBLIC_APP_URL = 'https://dealerwyze.com'
    delete process.env.RESEND_API_KEY
  })

  it('attaches a pay link and status callback to due-day SMS reminders', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      sid: 'SM123',
      status: 'queued',
    }), { status: 200 }))

    const { sendBhphReminder } = await import('@/lib/bhph/send')

    const result = await sendBhphReminder({
      bhphId: 'bhph-1',
      userId: 'org-1',
      customerId: 'cust-1',
      customerPhone: '+15557654321',
      customerEmail: null,
      customerSmsOptedOut: false,
      smsConsent: true,
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

    expect(result.sms).toBe('sent')
    expect(fetchSpy).toHaveBeenCalledTimes(1)

    const [, init] = fetchSpy.mock.calls[0]
    const body = init?.body as URLSearchParams
    expect(body.get('StatusCallback')).toBe('https://dealerwyze.com/api/twilio/status')
    expect(body.get('Body')).toContain('Pay online: https://dealerwyze.com/pay/test-token')

    fetchSpy.mockRestore()
  })
})
