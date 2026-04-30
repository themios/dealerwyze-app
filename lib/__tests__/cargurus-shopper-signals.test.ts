import { describe, expect, it } from 'vitest'
import { parseCarGurusDigest } from '@/lib/leads/parser'

const SAMPLE = `
Shopper Signals have arrived
Real-time shopper activity and preference insights
Re-engaged shoppers
Joel viewed your VDP
2005 Toyota Tundra
Joel Alvarez
16 miles away
what’s special about this shopper
Appointment
latest inquiry • 3 total
2005 Toyota Tundra
overall connections with you
18 connections across 1 listings
competition
>10 other dealers in competition
View full profile
New shoppers
Alexa Lusader
Warm
12 miles away
1.5-2x more likely to close than an average shopper.
what’s special about this shopper
Appointment
latest inquiry • 1 total
2024 Honda HR-V Sport FWD
overall connections with you
4 connections across 1 listings
competition
No dealers are in competition yet
View full profile
`

describe('parseCarGurusDigest shopper signals', () => {
  it('extracts high-intent shopper signal leads from the digest', () => {
    const leads = parseCarGurusDigest('Shopper Signals Digest', SAMPLE)

    expect(leads).toHaveLength(2)
    expect(leads[0].name).toBe('Joel Alvarez')
    expect(leads[0].vehicle).toBe('2005 Toyota Tundra')
    expect(leads[0].signal_flags).toContain('appointment')
    expect(leads[0].signal_flags).toContain('reengaged')
    expect(leads[1].name).toBe('Alexa Lusader')
    expect(leads[1].signal_flags).toContain('warm_shopper')
    expect(leads[1].signal_flags).toContain('low_competition')
  })
})
