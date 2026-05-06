import { describe, it, expect } from 'vitest'
import {
  computeBhphPaymentAllocation,
  calendarDaysBetween,
  shouldAdvanceBhphDueDate,
} from '@/lib/bhph/interestAllocation'

describe('computeBhphPaymentAllocation', () => {
  it('zero interest: full amount goes to principal reduction', () => {
    const r = computeBhphPaymentAllocation({
      paymentAmount:       100,
      paymentDate:         '2026-06-01',
      interestRateAnnual:  0,
      principalBalance:    5000,
      lastPaymentDate:     '2026-05-01',
      contractCreatedDate: '2026-01-01',
    })
    expect(r.interestPortion).toBe(0)
    expect(r.principalPortion).toBe(100)
    expect(r.principalBalanceAfter).toBe(4900)
    expect(r.daysSinceLast).toBe(31)
  })

  it('24% annual rate, 30 days, $10k principal: interest matches SQL rounding', () => {
    const r = computeBhphPaymentAllocation({
      paymentAmount:       500,
      paymentDate:         '2026-02-01',
      interestRateAnnual:  0.24,
      principalBalance:    10_000,
      lastPaymentDate:     '2026-01-02',
      contractCreatedDate: '2026-01-01',
    })
    expect(r.daysSinceLast).toBe(30)
    const daily = 0.24 / 365
    const accrued = Math.round(10_000 * daily * 30 * 100) / 100
    expect(r.interestAccrued).toBe(accrued)
    expect(r.interestAccrued).toBe(197.26)
    expect(r.interestPortion).toBe(197.26)
    expect(r.principalPortion).toBeCloseTo(500 - 197.26, 2)
    expect(r.principalBalanceAfter).toBeCloseTo(10_000 - r.principalPortion, 2)
  })

  it('payoff: balance goes to zero', () => {
    const r = computeBhphPaymentAllocation({
      paymentAmount:       200,
      paymentDate:         '2026-03-15',
      interestRateAnnual:  0,
      principalBalance:    50,
      lastPaymentDate:     '2026-03-01',
      contractCreatedDate: '2026-01-01',
    })
    expect(r.principalBalanceAfter).toBe(0)
  })

  it('payment before accrual start: non-negative days (treat as 0 days interest)', () => {
    const r = computeBhphPaymentAllocation({
      paymentAmount:       100,
      paymentDate:         '2026-04-01',
      interestRateAnnual:  0.24,
      principalBalance:    1000,
      lastPaymentDate:     '2026-05-01',
      contractCreatedDate: '2026-01-01',
    })
    expect(r.daysSinceLast).toBe(0)
    expect(r.interestAccrued).toBe(0)
    expect(r.interestPortion).toBe(0)
    expect(r.principalPortion).toBe(100)
  })

  it('untracked principal (null): interest zero, ledger-style after is 0', () => {
    const r = computeBhphPaymentAllocation({
      paymentAmount:       75,
      paymentDate:         '2026-06-01',
      interestRateAnnual:  0.12,
      principalBalance:    null,
      lastPaymentDate:     null,
      contractCreatedDate: '2026-05-01',
    })
    expect(r.interestPortion).toBe(0)
    expect(r.principalPortion).toBe(75)
    expect(r.principalBalanceAfter).toBe(0)
    expect(r.principalTracked).toBe(false)
  })
})

describe('calendarDaysBetween', () => {
  it('counts UTC calendar days', () => {
    expect(calendarDaysBetween('2026-01-01', '2026-01-31')).toBe(30)
  })
})

describe('shouldAdvanceBhphDueDate', () => {
  it('partial payment: does not advance', () => {
    expect(
      shouldAdvanceBhphDueDate({
        paymentAmount:         50,
        monthlyPayment:        250,
        principalBalanceAfter: 900,
        hadTrackedPrincipal:   true,
      }),
    ).toBe(false)
  })

  it('full monthly: advances', () => {
    expect(
      shouldAdvanceBhphDueDate({
        paymentAmount:         250,
        monthlyPayment:        250,
        principalBalanceAfter: 800,
        hadTrackedPrincipal:   true,
      }),
    ).toBe(true)
  })

  it('payoff: does not advance due date', () => {
    expect(
      shouldAdvanceBhphDueDate({
        paymentAmount:         250,
        monthlyPayment:        250,
        principalBalanceAfter: 0,
        hadTrackedPrincipal:   true,
      }),
    ).toBe(false)
  })
})
