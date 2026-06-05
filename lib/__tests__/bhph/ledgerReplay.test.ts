import { describe, expect, it } from 'vitest'
import { replayBhphLedger, sumLedgerInterestYtd } from '@/lib/bhph/ledgerReplay'
import { computeBhphPayoffQuote } from '@/lib/bhph/payoff'

describe('ledgerReplay', () => {
  const contract = {
    loan_amount: 6770.81,
    down_payment: 1500,
    interest_rate: 0.2399,
    frequency_anchor_date: '2026-03-02',
    created_at: '2026-03-02T12:00:00Z',
    principal_balance: 5270.81,
  }

  it('allocates interest on a payment after sale date', () => {
    const result = replayBhphLedger(contract, [
      {
        id: '1',
        payment_date: '2026-05-29',
        amount_paid: 800,
        payment_type: 'partial',
        notes: 'CC',
      },
    ])
    expect(result.rows[0].interest_portion).toBeGreaterThan(0)
    expect(result.rows[0].principal_portion).toBeLessThan(800)
    expect(result.totalInterestPaid).toBe(result.rows[0].interest_portion)
    expect(result.principalBalance).toBeLessThan(5270.81)
  })

  it('sums YTD interest from ledger rows', () => {
    const ytd = sumLedgerInterestYtd(
      [
        { payment_date: '2026-05-29', interest_portion: 120.5 },
        { payment_date: '2025-12-01', interest_portion: 50 },
      ],
      2026,
    )
    expect(ytd).toBe(120.5)
  })
})

describe('payoff', () => {
  const base = {
    principalBalance: 4470.81,
    interestRate: 0.2399,
    lastPaymentDate: '2026-05-29',
    accrualAnchorDate: '2026-03-02',
  }

  it('includes accrued interest in payoff total', () => {
    const quote = computeBhphPayoffQuote({ ...base, asOfDate: '2026-06-03' })
    expect(quote).not.toBeNull()
    expect(quote!.accruedInterestToDate).toBeGreaterThan(0)
    expect(quote!.payoffTotal).toBeGreaterThan(quote!.principalBalance)
  })

  it('adds more accrued interest for a future payoff date', () => {
    const today = computeBhphPayoffQuote({ ...base, asOfDate: '2026-06-03' })!
    const future = computeBhphPayoffQuote({ ...base, asOfDate: '2026-06-08' })!
    expect(future.daysAccrued).toBe(today.daysAccrued + 5)
    expect(future.accruedInterestToDate).toBeGreaterThan(today.accruedInterestToDate)
    expect(future.payoffTotal).toBeGreaterThan(today.payoffTotal)
  })
})
