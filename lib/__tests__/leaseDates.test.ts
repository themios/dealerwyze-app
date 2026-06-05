import { describe, expect, it } from 'vitest'
import { computeLeaseEndDate } from '@/lib/transactions/leaseDates'

describe('computeLeaseEndDate', () => {
  it('adds calendar months in local YMD form', () => {
    expect(computeLeaseEndDate('2026-06-07', 12)).toBe('2027-06-07')
  })

  it('returns empty when inputs missing', () => {
    expect(computeLeaseEndDate('', 12)).toBe('')
    expect(computeLeaseEndDate('2026-06-07', '')).toBe('')
  })
})
