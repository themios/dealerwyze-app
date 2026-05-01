import { describe, expect, it } from 'vitest'
import {
  buildTranscriptLines,
  hashTranscript,
  normalizeConversationScore,
} from '@/lib/leads/conversationScore'

describe('conversationScore — gold-style regression checks', () => {
  it('clamps contactless leads low even after reinquiry boost', () => {
    const r = normalizeConversationScore({
      score01: 0.55,
      llmFlags: ['specific_vehicle'],
      hasPhone: false,
      hasEmail: false,
      isReinquiry: true,
    })
    expect(r.score100).toBeLessThanOrEqual(24)
    expect(r.tier).toBe('standard')
  })

  it('elevates appointment intent above model score', () => {
    const r = normalizeConversationScore({
      score01: 0.4,
      llmFlags: ['appointment_request'],
      hasPhone: true,
      hasEmail: true,
      isReinquiry: false,
    })
    expect(r.score100).toBeGreaterThanOrEqual(80)
    expect(r.tier).toBe('hot')
  })

  it('has stable transcript hashing', () => {
    const rows = [
      { id: '1', type: 'sms', direction: 'inbound', body: 'Hi', created_at: '2026-01-01T00:00:00Z' },
      { id: '2', type: 'sms', direction: 'outbound', body: 'Hello', created_at: '2026-01-01T00:01:00Z' },
    ]
    const t = buildTranscriptLines(rows)
    expect(t).toContain('[customer|sms]: Hi')
    expect(t).toContain('[dealer|sms]: Hello')
    expect(hashTranscript(t)).toHaveLength(64)
  })
})
