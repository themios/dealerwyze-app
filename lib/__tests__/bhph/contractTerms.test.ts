import { describe, expect, it } from 'vitest'
import {
  BhphContractTermsPatchSchema,
  buildContractTermsUpdate,
  formatAprFromStored,
  interestRateStoredToDecimal,
  parseAnnualInterestPercentInput,
  percentInputToStoredDecimal,
} from '@/lib/bhph/contractTerms'

describe('contractTerms interest rate', () => {
  it('converts percent input to stored decimal', () => {
    expect(percentInputToStoredDecimal(23.99)).toBe(0.2399)
  })

  it('reads legacy percent stored as 23.99', () => {
    expect(interestRateStoredToDecimal(23.99)).toBeCloseTo(0.2399, 4)
    expect(formatAprFromStored(23.99)).toBe('23.99% APR')
  })

  it('reads correct decimal storage', () => {
    expect(interestRateStoredToDecimal(0.2399)).toBe(0.2399)
    expect(formatAprFromStored(0.2399)).toBe('23.99% APR')
  })

  it('parses form strings', () => {
    expect(parseAnnualInterestPercentInput('23.99')).toBe(23.99)
    expect(parseAnnualInterestPercentInput('23.99%')).toBe(23.99)
  })

  it('accepts null notes in PATCH body', () => {
    const parsed = BhphContractTermsPatchSchema.parse({
      annual_interest_rate_percent: '23.99',
      monthly_payment: 1218.4,
      payment_frequency: 'monthly',
      payment_day: 1,
      notes: null,
    })
    expect(buildContractTermsUpdate(parsed).interest_rate).toBe(0.2399)
    expect(buildContractTermsUpdate(parsed).notes).toBeNull()
  })
})
