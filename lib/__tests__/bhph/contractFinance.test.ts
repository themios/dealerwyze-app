import { describe, expect, it } from 'vitest'
import {
  contractNeedsFinanceRepair,
  contractNeedsLedgerReplay,
  contractNeedsPrincipalSeed,
} from '@/lib/bhph/contractFinance'

describe('contractFinance', () => {
  const contract = {
    loan_amount: 6770.81,
    down_payment: 1500,
    interest_rate: 0.2399,
    principal_balance: 5270.81,
    frequency_anchor_date: '2026-03-02',
    created_at: '2026-03-02T12:00:00Z',
    status: 'active',
  }

  it('detects missing principal when APR is set', () => {
    expect(contractNeedsPrincipalSeed({ ...contract, principal_balance: null })).toBe(true)
    expect(contractNeedsPrincipalSeed(contract)).toBe(false)
  })

  it('detects zero-interest ledger rows when days accrued', () => {
    expect(
      contractNeedsLedgerReplay(contract, [
        {
          id: '1',
          payment_date: '2026-05-29',
          amount_paid: 800,
          interest_portion: 0,
          days_since_last: 88,
        },
      ]),
    ).toBe(true)
  })

  it('flags repair when principal seed or ledger stale', () => {
    expect(
      contractNeedsFinanceRepair(
        { ...contract, principal_balance: null },
        [],
      ),
    ).toBe(true)
  })
})
