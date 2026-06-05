import { describe, expect, it } from 'vitest'
import {
  canonicalOutstandingBalance,
  computeBhphOutstandingBalance,
  computeBhphPaidPercent,
  financedPrincipalAmount,
  totalCollectedTowardContract,
} from '@/lib/bhph/balance'

describe('bhph balance', () => {
  const contract = {
    loan_amount: 6770.81,
    down_payment: 1500,
    total_paid: 800,
    principal_balance: 5970.81,
  }

  it('computes canonical balance with down and installments', () => {
    expect(canonicalOutstandingBalance(contract)).toBe(4470.81)
  })

  it('corrects legacy principal_balance that omitted down', () => {
    expect(computeBhphOutstandingBalance(contract)).toBe(4470.81)
  })

  it('includes down in collected total and paid percent', () => {
    expect(totalCollectedTowardContract(contract)).toBe(2300)
    expect(computeBhphPaidPercent(contract)).toBe(34)
  })

  it('financed principal is loan minus down', () => {
    expect(financedPrincipalAmount(contract)).toBe(5270.81)
  })

  it('uses principal_balance when it already reflects down', () => {
    expect(
      computeBhphOutstandingBalance({
        loan_amount: 6770.81,
        down_payment: 1500,
        total_paid: 800,
        principal_balance: 4470.81,
      }),
    ).toBe(4470.81)
  })
})
