import { describe, expect, it } from 'vitest'
import { scanResultToParsedLead } from '@/lib/leads/scanResultToParsedLead'
import type { LeadScanResult } from '@/lib/leads/visionIngestTypes'

function buildScanResult(overrides: Partial<LeadScanResult> = {}): LeadScanResult {
  return {
    first_name: { value: null, confidence: 'low' },
    last_name: { value: null, confidence: 'low' },
    phone: { value: null, confidence: 'low' },
    phone2: { value: null, confidence: 'low' },
    email: { value: null, confidence: 'low' },
    city: { value: null, confidence: 'low' },
    state: { value: null, confidence: 'low' },
    zip: { value: null, confidence: 'low' },
    vehicle_year: { value: null, confidence: 'low' },
    vehicle_make: { value: null, confidence: 'low' },
    vehicle_model: { value: null, confidence: 'low' },
    vehicle_trim: { value: null, confidence: 'low' },
    vehicle_vin: { value: null, confidence: 'low' },
    budget: { value: null, confidence: 'low' },
    lead_source: { value: null, confidence: 'low' },
    notes: { value: null, confidence: 'low' },
    urgency: { value: null, confidence: 'low' },
    trade_in: { value: null, confidence: 'low' },
    overall_confidence: 'low',
    ...overrides,
  }
}

describe('scanResultToParsedLead', () => {
  it('normalizes scanned phone and email values', () => {
    const parsed = scanResultToParsedLead(buildScanResult({
      first_name: { value: 'Oshin', confidence: 'high' },
      phone: { value: '(818)-441-2722', confidence: 'high' },
      email: { value: 'Email: OshinBoodaghian@Yahoo.com', confidence: 'high' },
      zip: { value: ' 91042 ', confidence: 'medium' },
      vehicle_vin: { value: ' 1hgcm82633a004352 ', confidence: 'medium' },
      lead_source: { value: 'iMessage', confidence: 'high' },
    }))

    expect(parsed.name).toBe('Oshin')
    expect(parsed.phone).toBe('8184412722')
    expect(parsed.email).toBe('oshinboodaghian@yahoo.com')
    expect(parsed.zip).toBe('91042')
    expect(parsed.vin).toBe('1HGCM82633A004352')
  })

  it('keeps email-only scanned leads savable', () => {
    const parsed = scanResultToParsedLead(buildScanResult({
      first_name: { value: 'Teamslp', confidence: 'high' },
      email: { value: 'teamslp@example.com', confidence: 'high' },
    }))

    expect(parsed.email).toBe('teamslp@example.com')
    expect(parsed.phone).toBe('Teamslp')
  })
})
