import { describe, expect, it } from 'vitest'
import {
  buildLeadSourceEmailGmailQuery,
  inferLeadSourceEmailMatcherType,
  matchLeadSourceEmail,
  sanitizeLeadSourceEmailMatchers,
} from '@/lib/leads/sourceMatchers'

describe('lead source email matchers', () => {
  it('infers matcher types from admin input', () => {
    expect(inferLeadSourceEmailMatcherType('dealer-leads@messages.cargurus.com')).toBe('exact')
    expect(inferLeadSourceEmailMatcherType('carsforsale.com')).toBe('domain')
    expect(inferLeadSourceEmailMatcherType('cargurus')).toBe('contains')
  })

  it('sanitizes, deduplicates, and normalizes matcher inputs', () => {
    const matchers = sanitizeLeadSourceEmailMatchers([
      ' CarGurus ',
      'cargurus',
      { type: 'domain', value: 'CarsForSale.com' },
      { value: 'dealer-leads@messages.cargurus.com' },
      'bad',
    ])

    expect(matchers).toEqual([
      { type: 'contains', value: 'cargurus' },
      { type: 'domain', value: 'carsforsale.com' },
      { type: 'exact', value: 'dealer-leads@messages.cargurus.com' },
    ])
  })

  it('matches exact email first, then domain, then contains', () => {
    const matchers = sanitizeLeadSourceEmailMatchers([
      'dealer-leads@messages.cargurus.com',
      'carsforsale.com',
      'autotrader',
    ])

    expect(matchLeadSourceEmail('Dealer Leads <dealer-leads@messages.cargurus.com>', matchers)?.type).toBe('exact')
    expect(matchLeadSourceEmail('leads@mailer.carsforsale.com', matchers)?.type).toBe('domain')
    expect(matchLeadSourceEmail('foo@lead.autotrader-mail.net', matchers)?.type).toBe('contains')
    expect(matchLeadSourceEmail('customer@gmail.com', matchers)).toBeNull()
  })

  it('builds a Gmail query from configured matchers', () => {
    const query = buildLeadSourceEmailGmailQuery(sanitizeLeadSourceEmailMatchers([
      'cargurus',
      'carsforsale.com',
    ]))

    expect(query).toContain('from:cargurus')
    expect(query).toContain('from:carsforsale.com')
    expect(query).toContain('newer_than:2d')
  })
})
