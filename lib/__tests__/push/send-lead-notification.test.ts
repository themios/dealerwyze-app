import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockEq, createServiceClientMock } = vi.hoisted(() => {
  const mockEq = vi.fn()
  const createServiceClientMock = vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: mockEq,
      })),
    })),
  }))
  return { mockEq, createServiceClientMock }
})

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: createServiceClientMock,
}))

vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn().mockResolvedValue(undefined),
  },
}))

import webpush from 'web-push'
import { sendLeadNotification } from '@/lib/push/send'

describe('sendLeadNotification', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.VAPID_PUBLIC_KEY = 'test-public'
    process.env.VAPID_PRIVATE_KEY = 'test-private'
    process.env.VAPID_SUBJECT = 'mailto:test@example.com'
    mockEq.mockResolvedValue({ data: [] })
  })

  it('scopes push_subscriptions by org_id', async () => {
    await sendLeadNotification({ title: 't', body: 'b', url: '/u' }, 'org-xyz')
    expect(mockEq).toHaveBeenCalledWith('org_id', 'org-xyz')
  })

  it('does not deliver org A notification to org B push subscription', async () => {
    const subA = { endpoint: 'https://push.example/a', keys: { p256dh: 'x', auth: 'y' } }
    const subB = { endpoint: 'https://push.example/b', keys: { p256dh: 'x', auth: 'y' } }

    mockEq.mockImplementation((col: string, orgId: string) => {
      expect(col).toBe('org_id')
      if (orgId === 'org-a') return Promise.resolve({ data: [{ subscription: subA }] })
      if (orgId === 'org-b') return Promise.resolve({ data: [{ subscription: subB }] })
      return Promise.resolve({ data: [] })
    })

    await sendLeadNotification({ title: 'Lead', body: 'Hello', url: '/leads/1' }, 'org-a')

    expect(webpush.sendNotification).toHaveBeenCalledTimes(1)
    expect(webpush.sendNotification).toHaveBeenCalledWith(subA, expect.any(String))
    expect(webpush.sendNotification).not.toHaveBeenCalledWith(subB, expect.anything())
  })
})
