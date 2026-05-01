import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Activity, Customer } from '@/types'
import { buildQueue } from '@/lib/today/queueSort'
import type { TakeoverSignal } from '@/lib/today/takeoverDetector'

const NOW = new Date('2026-04-30T18:00:00.000Z')

function makeCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: overrides.id ?? '11111111-1111-1111-1111-111111111111',
    user_id: 'org-1',
    name: 'Taylor Buyer',
    primary_phone: '5551112222',
    created_at: NOW.toISOString(),
    lead_intent_score: 72,
    lead_intent_tier: 'warm',
    lead_intent_summary: 'Customer is actively shopping.',
    repeat_lead: false,
    avg_reply_speed_minutes: 12,
    inbound_message_count: 2,
    prior_purchase_count: 0,
    last_inbound_at: NOW.toISOString(),
    last_outbound_at: NOW.toISOString(),
    ...overrides,
  }
}

function makeActivity(overrides: Partial<Activity> = {}, customerOverrides: Partial<Customer> = {}): Activity {
  const customer = makeCustomer({ id: overrides.customer_id ?? '11111111-1111-1111-1111-111111111111', ...customerOverrides })
  return {
    id: overrides.id ?? 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    user_id: 'org-1',
    customer_id: customer.id,
    type: 'email',
    direction: 'inbound',
    outcome: 'pending',
    body: 'Is this still available?',
    priority: 'normal',
    created_at: NOW.toISOString(),
    customer,
    ...overrides,
  }
}

describe('buildQueue Today classifier', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  it('places recently replied sequence leads into replied ahead of ai_handling', () => {
    const activity = makeActivity()
    const result = buildQueue(
      [activity],
      [],
      [],
      [],
      [],
      [activity.customer_id!],
      [],
      {
        sequenceStatusMap: {
          [activity.customer_id!]: {
            id: 'seq-1',
            status: 'active',
            sequence_name: 'Lead Nurture',
          },
        },
      },
    )

    expect(result.items[0].section).toBe('replied')
    expect(result.counts.replied).toBe(1)
    expect(result.counts.ai_handling).toBe(0)
  })

  it('classifies inbound appointment requests into human_now', () => {
    const activity = makeActivity({
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      type: 'appointment',
      body: 'Can I come in today?',
    })
    const result = buildQueue([], [activity], [], [], [], [], [])

    expect(result.items[0].section).toBe('human_now')
    expect(result.counts.human_now).toBe(1)
  })

  it('keeps active sequence leads in ai_handling when there is no takeover signal', () => {
    const activity = makeActivity({
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      direction: 'outbound',
      outcome: 'answered',
    }, {
      lead_intent_tier: 'warm',
      last_inbound_at: new Date(NOW.getTime() - 2 * 86_400_000).toISOString(),
    })

    const result = buildQueue([], [], [], [], [activity], [], [], {
      sequenceStatusMap: {
        [activity.customer_id!]: {
          id: 'seq-2',
          status: 'active',
          sequence_name: 'AI Follow Up',
        },
      },
    })

    expect(result.items[0].section).toBe('ai_handling')
  })

  it('moves parked leads into follow_up_later', () => {
    const activity = makeActivity({
      id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      today_park_until: new Date(NOW.getTime() + 86_400_000).toISOString(),
    })
    const result = buildQueue([activity], [], [], [], [], [], [])

    expect(result.items[0].section).toBe('follow_up_later')
  })

  it('marks ghost leads as low_roi after 3 touches and 7 silent days', () => {
    const activity = {
      ...makeActivity({
        id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        direction: 'outbound',
        outcome: 'answered',
      }, {
        lead_intent_score: 20,
        lead_intent_tier: 'standard',
        last_inbound_at: new Date(NOW.getTime() - 9 * 86_400_000).toISOString(),
      }),
      outbound_touch_count: 4,
    } as Activity & { outbound_touch_count: number }

    const result = buildQueue([], [], [], [], [activity], [], [])

    expect(result.items[0].section).toBe('low_roi')
    expect(result.items[0].decision.reasons[0]).toContain('touches')
  })

  it('surfaces active sequence leads with buying signals into replied', () => {
    const activity = makeActivity({
      id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      direction: 'outbound',
      outcome: 'answered',
    })
    const takeover: TakeoverSignal = {
      trigger: 'financing',
      reason: 'Take over — customer mentioned financing or payment details',
    }

    const result = buildQueue([], [], [], [], [activity], [], [], {
      sequenceStatusMap: {
        [activity.customer_id!]: {
          id: 'seq-3',
          status: 'active',
          sequence_name: 'AI Follow Up',
        },
      },
      takeoverSignalsByCustomer: {
        [activity.customer_id!]: takeover,
      },
    })

    expect(result.items[0].section).toBe('replied')
    expect(result.items[0].takeoverSignal).toEqual(takeover)
  })
})
