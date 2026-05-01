import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { QueueItem } from '@/lib/today/queueSort'
import { computeRepAttentionScore } from '@/lib/today/repAttentionScore'

const NOW = new Date('2026-04-30T18:00:00.000Z')

function makeQueueItem(overrides: Partial<QueueItem> = {}): QueueItem {
  return {
    key: overrides.key ?? 'item-1',
    type: overrides.type ?? 'new_lead',
    customerId: overrides.customerId ?? 'cust-1',
    section: overrides.section ?? 'human_now',
    hasResponded: overrides.hasResponded ?? false,
    hasActiveSequence: overrides.hasActiveSequence ?? false,
    repAttentionScore: overrides.repAttentionScore ?? 0,
    takeoverSignal: overrides.takeoverSignal,
    data: overrides.data ?? {
      id: 'act-1',
      user_id: 'org-1',
      customer_id: 'cust-1',
      type: 'email',
      direction: 'inbound',
      outcome: 'pending',
      body: 'Interested',
      priority: 'normal',
      created_at: NOW.toISOString(),
      customer: {
        id: 'cust-1',
        user_id: 'org-1',
        name: 'Jordan',
        primary_phone: '5551112222',
        created_at: NOW.toISOString(),
        lead_intent_score: 80,
        last_inbound_at: NOW.toISOString(),
        sms_opt_out: false,
        prior_purchase_count: 0,
      },
    },
    decision: overrides.decision ?? {
      priorityScore: 300,
      winLikelihood: 0.8,
      delayRisk: 0.7,
      nextBestAction: 'call_now',
      nextActionLabel: 'Call now',
      intentTierBadge: 'HOT',
      reasons: ['High value'],
    },
  }
}

describe('computeRepAttentionScore', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  it('rewards replied leads more than sequence-handled leads', () => {
    const replied = computeRepAttentionScore(makeQueueItem({ section: 'replied' }))
    const aiHandling = computeRepAttentionScore(makeQueueItem({ section: 'ai_handling' }))

    expect(replied).toBeGreaterThan(aiHandling)
  })

  it('caps the score between 0 and 100', () => {
    const score = computeRepAttentionScore(makeQueueItem({
      decision: {
        priorityScore: 999,
        winLikelihood: 1,
        delayRisk: 1,
        nextBestAction: 'call_now',
        nextActionLabel: 'Call now',
        intentTierBadge: 'HOT',
        reasons: ['High value'],
      },
      data: {
        id: 'act-2',
        user_id: 'org-1',
        customer_id: 'cust-2',
        type: 'email',
        direction: 'inbound',
        outcome: 'pending',
        body: 'Ready',
        priority: 'high',
        created_at: NOW.toISOString(),
        customer: {
          id: 'cust-2',
          user_id: 'org-1',
          name: 'Alex',
          primary_phone: '5559990000',
          created_at: NOW.toISOString(),
          lead_intent_score: 100,
          last_inbound_at: NOW.toISOString(),
          prior_purchase_count: 2,
          sms_opt_out: false,
        },
      },
      section: 'replied',
    }))

    expect(score).toBeLessThanOrEqual(100)
    expect(score).toBeGreaterThan(0)
  })
})
