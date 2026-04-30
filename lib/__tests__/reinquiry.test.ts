import { describe, expect, it } from 'vitest'
import { pickReInquiryCandidate } from '@/lib/leads/reinquiry'
import type { ParsedLead } from '@/lib/leads/parser'

const baseLead: ParsedLead = {
  name: 'Joel Alvarez',
  email: 'new-email@example.com',
  phone: '',
  zip: '93065',
  vehicle: '2005 Toyota Tundra',
  vin: '',
  listed_price: null,
  comments: 'Still available?',
  source: 'cargurus',
  raw_text: '',
}

describe('pickReInquiryCandidate', () => {
  it('matches a single exact-name candidate when vehicle aligns', () => {
    const match = pickReInquiryCandidate(baseLead, [
      {
        id: 'cust-1',
        name: 'Joel Alvarez',
        interested_in: '2005 Toyota Tundra SR5',
        zip_code: '93065',
        lead_source: 'cargurus',
      },
    ])

    expect(match?.id).toBe('cust-1')
  })

  it('refuses ambiguous name matches', () => {
    const match = pickReInquiryCandidate(baseLead, [
      {
        id: 'cust-1',
        name: 'Joel Alvarez',
        interested_in: '2005 Toyota Tundra SR5',
        zip_code: '93065',
        lead_source: 'cargurus',
      },
      {
        id: 'cust-2',
        name: 'Joel Alvarez',
        interested_in: '2005 Toyota Tundra Limited',
        zip_code: '93065',
        lead_source: 'cargurus',
      },
    ])

    expect(match).toBeNull()
  })
})
