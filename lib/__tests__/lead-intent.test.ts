import { describe, expect, it } from 'vitest'
import { buildManualLeadIntent, deriveLeadIntentFromLead } from '@/lib/leads/intent'

describe('lead intent helpers', () => {
  it('scores marketplace shopper signals into a hot lead', () => {
    const snapshot = deriveLeadIntentFromLead({
      name: 'Alexa Lusader',
      email: '',
      phone: '',
      zip: '',
      vehicle: '2024 Honda HR-V Sport FWD',
      vin: '',
      listed_price: null,
      comments: '',
      source: 'cargurus_digest',
      raw_text: '',
      is_hot: true,
      is_reengaged: false,
      signal_flags: ['appointment', 'warm_shopper', 'low_competition', 'local_shopper'],
      signal_summary: 'Above-average likelihood to close • Appointment signal',
    }, false)

    expect(snapshot).not.toBeNull()
    expect(snapshot?.tier).toBe('hot')
    expect(snapshot?.score).toBeGreaterThanOrEqual(80)
    expect(snapshot?.flags).toContain('appointment')
  })

  it('builds manual priority with callback signal', () => {
    const snapshot = buildManualLeadIntent({
      tier: 'warm',
      flags: ['callback_requested'],
      note: 'Asked to be called after 5pm',
    })

    expect(snapshot.tier).toBe('warm')
    expect(snapshot.flags).toContain('manual_priority')
    expect(snapshot.flags).toContain('callback_requested')
    expect(snapshot.summary).toContain('Asked to be called after 5pm')
  })

  it('flags repeat inquiries separately from marketplace shopper signals', () => {
    const snapshot = deriveLeadIntentFromLead({
      name: 'Joel Alvarez',
      email: 'joel@example.com',
      phone: '8055551212',
      zip: '93065',
      vehicle: '2005 Toyota Tundra',
      vin: '',
      listed_price: null,
      comments: 'Still available?',
      source: 'cargurus',
      raw_text: '',
    }, true)

    expect(snapshot).not.toBeNull()
    expect(snapshot?.flags).toContain('repeat_inquiry')
    expect(snapshot?.summary).toContain('Repeat inquiry')
  })
})
