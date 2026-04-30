import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { makeTestClient, makeTestProfile } from './helpers/testClient'

vi.mock('server-only', () => ({}))

const { supabase } = makeTestClient()

const { mockRequireProfile, mockCreateCalendarEvent, mockDispatchWebhook } = vi.hoisted(() => ({
  mockRequireProfile: vi.fn(),
  mockCreateCalendarEvent: vi.fn(),
  mockDispatchWebhook: vi.fn(),
}))

vi.mock('@/lib/auth/profile', () => ({
  requireProfile: mockRequireProfile,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => supabase,
}))

vi.mock('@/lib/google/calendar', () => ({
  createCalendarEvent: mockCreateCalendarEvent,
}))

vi.mock('@/lib/webhooks/dispatch', () => ({
  dispatchWebhook: mockDispatchWebhook,
}))

function makeReq(body: unknown): NextRequest {
  return new NextRequest('https://dealerwyze.com/api/activities', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/activities', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireProfile.mockResolvedValue(makeTestProfile({ role: 'dealer_admin' }))
    mockCreateCalendarEvent.mockResolvedValue({ htmlLink: 'https://calendar.google.com/calendar/event?eid=abc', eventId: 'gcal-evt-1' })
    mockDispatchWebhook.mockResolvedValue(undefined)
    supabase._table('activities').then = vi.fn().mockImplementation(
      (resolve: (value: unknown) => unknown) => resolve({ data: null, error: null }),
    )
  })

  it('creates a Google Calendar event for confirmed manual appointments', async () => {
    supabase._table('customers').maybeSingle
      .mockResolvedValueOnce({ data: { id: 'cust-1' }, error: null })
      .mockResolvedValueOnce({ data: { name: 'Jane Buyer', primary_phone: '+15551234567' }, error: null })

    supabase._table('activities').single.mockResolvedValueOnce({
      data: {
        id: 'act-1',
        type: 'appointment',
        customer_id: 'cust-1',
        due_at: '2026-04-30T17:00:00.000Z',
        body: 'Appointment re: 2019 Dodge Grand Caravan',
      },
      error: null,
    })

    const { POST } = await import('@/app/api/activities/route')
    const res = await POST(makeReq({
      type: 'appointment',
      customer_id: 'cust-1',
      due_at: '2026-04-30T17:00:00.000Z',
      direction: null,
      outcome: 'pending',
      priority: 'high',
      body: 'Appointment re: 2019 Dodge Grand Caravan',
    }))
    const json = await res.json()

    expect(res.status).toBe(201)
    expect(mockCreateCalendarEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        summary: 'Appointment - Jane Buyer',
        startDateTimeIso: '2026-04-30T17:00:00.000Z',
      }),
      expect.any(String),
    )
    expect(supabase._table('activities').update).toHaveBeenCalledWith({ google_calendar_event_id: 'gcal-evt-1' })
    expect(json.calendar_url).toBe('https://calendar.google.com/calendar/event?eid=abc')
  })

  it('does not call Google Calendar for non-appointment activities', async () => {
    supabase._table('activities').single.mockResolvedValueOnce({
      data: {
        id: 'act-2',
        type: 'task',
        customer_id: null,
        due_at: null,
        body: 'Follow up',
      },
      error: null,
    })

    const { POST } = await import('@/app/api/activities/route')
    const res = await POST(makeReq({
      type: 'task',
      body: 'Follow up',
      priority: 'normal',
    }))

    expect(res.status).toBe(201)
    expect(mockCreateCalendarEvent).not.toHaveBeenCalled()
  })
})
