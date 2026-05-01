import { describe, expect, it } from 'vitest'

import { buildMessagingPatternsFromRows } from '@/lib/intelligence/messagingPatterns'

describe('buildMessagingPatternsFromRows', () => {
  it('excludes buckets with fewer than 10 samples', () => {
    const outboundRows = Array.from({ length: 9 }, (_, index) => ({
      id: `out-${index}`,
      customer_id: `cust-${index}`,
      type: 'sms',
      body: 'Hello from the team',
      created_at: '2026-05-01T10:00:00.000Z',
      customer: { id: `cust-${index}`, lead_intent_tier: 'warm' },
    }))

    const result = buildMessagingPatternsFromRows({
      outboundRows,
      inboundRows: [],
      sequenceStepRows: [{
        sequence_id: 'seq-1',
        sequence_name: 'Lead Nurture',
        step_number: 1,
        enrolled_count: 9,
        silent_after_step_count: 9,
        silence_rate: 1,
      }],
    })

    expect(result.responseTimeBuckets).toHaveLength(0)
    expect(result.messageLengthBuckets).toHaveLength(0)
    expect(result.firstTouchPhrases).toHaveLength(0)
    expect(result.sequenceStepDropoff).toHaveLength(0)
    expect(result.channelEffectiveness).toHaveLength(0)
  })
})
