import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const { mockSupabase } = vi.hoisted(() => {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null }),
    insert: vi.fn().mockResolvedValue({ error: null }),
    update: vi.fn().mockReturnThis(),
  }
  return { mockSupabase: { from: vi.fn().mockReturnValue(chain), _chain: chain } }
})

import { sendLastDitchMessage } from '@/lib/leads/lastDitch'

const BASE = {
  orgId: 'org-1',
  customerId: 'cust-1',
  customerName: 'Jane Doe',
  customerPhone: '+15551234567',
  smsConsent: true,
  smsOptOut: false,
  lastDitchSentAt: null,
  activityId: 'act-1',
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.TWILIO_ACCOUNT_SID = 'sid'
  process.env.TWILIO_AUTH_TOKEN = 'token'
  process.env.TWILIO_FROM_NUMBER = '+15550000000'
  process.env.NEXT_PUBLIC_APP_URL = 'https://dealerwyze.com'
  // No active sequence by default
  mockSupabase._chain.maybeSingle.mockResolvedValue({ data: null })
})

describe('sendLastDitchMessage', () => {
  it('skips when no phone', async () => {
    const result = await sendLastDitchMessage(mockSupabase as never, { ...BASE, customerPhone: null })
    expect(result).toBe('skipped_no_phone')
  })

  it('skips when no SMS consent', async () => {
    const result = await sendLastDitchMessage(mockSupabase as never, { ...BASE, smsConsent: false })
    expect(result).toBe('skipped_consent')
  })

  it('skips when opted out', async () => {
    const result = await sendLastDitchMessage(mockSupabase as never, { ...BASE, smsOptOut: true })
    expect(result).toBe('skipped_consent')
  })

  it('skips within 30-day cooldown', async () => {
    const recent = new Date(Date.now() - 5 * 86_400_000).toISOString()
    const result = await sendLastDitchMessage(mockSupabase as never, { ...BASE, lastDitchSentAt: recent })
    expect(result).toBe('skipped_cooldown')
  })

  it('allows send after 30-day cooldown expires', async () => {
    const old = new Date(Date.now() - 31 * 86_400_000).toISOString()
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ sid: 'SM123' }), { status: 200 })
    )
    const result = await sendLastDitchMessage(mockSupabase as never, { ...BASE, lastDitchSentAt: old })
    expect(result).toBe('sent')
    fetchSpy.mockRestore()
  })

  it('skips when active sequence exists', async () => {
    mockSupabase._chain.maybeSingle.mockResolvedValue({ data: { id: 'seq-1' } })
    const result = await sendLastDitchMessage(mockSupabase as never, BASE)
    expect(result).toBe('skipped_sequence')
  })

  it('sends and returns sent on success', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ sid: 'SM456' }), { status: 200 })
    )
    const result = await sendLastDitchMessage(mockSupabase as never, BASE)
    expect(result).toBe('sent')
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url] = fetchSpy.mock.calls[0]
    expect(String(url)).toContain('Messages.json')
    fetchSpy.mockRestore()
  })

  it('returns failed when Twilio returns non-200', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response('error', { status: 400 })
    )
    const result = await sendLastDitchMessage(mockSupabase as never, BASE)
    expect(result).toBe('failed')
    fetchSpy.mockRestore()
  })
})
