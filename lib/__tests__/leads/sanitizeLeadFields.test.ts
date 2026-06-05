import { describe, expect, it } from 'vitest'
import {
  buildFullName,
  sanitizeEmail,
  sanitizeFirstName,
  sanitizePersonName,
  sanitizeParsedLeadContact,
} from '@/lib/leads/sanitizeLeadFields'
import { parseBoomtownLead } from '@/lib/leads/parseBoomtown'

describe('sanitizeLeadFields', () => {
  it('strips First Name label from values', () => {
    expect(sanitizePersonName('First Name: Alex')).toBe('Alex')
    expect(sanitizePersonName('FIRST NAME: COREY')).toBe('Corey')
  })

  it('dedupes duplicated emails', () => {
    expect(sanitizeEmail('campcorey33@gmail.com [campcorey33@gmail.com]')).toBe(
      'campcorey33@gmail.com',
    )
    expect(sanitizeEmail('<alexdeasisjr@yahoo.com [alexdeasisjr@yahoo.com]>')).toBe(
      'alexdeasisjr@yahoo.com',
    )
  })

  it('prefers the fuller email when a truncated one appears first', () => {
    expect(sanitizeEmail('r@yahoo.com [alexdeasisjr@yahoo.com]')).toBe('alexdeasisjr@yahoo.com')
  })

  it('builds full name from first and last', () => {
    expect(buildFullName('Alex', 'De Asis')).toBe('Alex De Asis')
  })

  it('sanitizeParsedLeadContact combines AI-style labeled fields', () => {
    expect(
      sanitizeParsedLeadContact({
        firstName: 'First Name: Alex',
        lastName: 'De Asis',
        email: 'alexdeasisjr@yahoo.com [alexdeasisjr@yahoo.com]',
      }),
    ).toEqual({
      name: 'Alex De Asis',
      email: 'alexdeasisjr@yahoo.com',
    })
  })

  it('sanitizeFirstName avoids greeting "Hi First!"', () => {
    expect(sanitizeFirstName('First Name: Alex De Asis')).toBe('Alex')
  })
})

describe('parseBoomtownLead', () => {
  const body = `
Boomtown lead forward
First Name: Alex
Last Name: De Asis
Email: alexdeasisjr@yahoo.com [alexdeasisjr@yahoo.com]
Phone: 9092588188
Property: 10915 Garvey Ave.
Message: Interested in this vehicle
`.trim()

  it('extracts full name and single email from labeled CRM body', () => {
    const lead = parseBoomtownLead('New inquiry', body, 'leads@boomtown.com')
    expect(lead).not.toBeNull()
    expect(lead?.name).toBe('Alex De Asis')
    expect(lead?.email).toBe('alexdeasisjr@yahoo.com')
    expect(lead?.phone).toBe('9092588188')
  })
})
