import {
  canonicalOutstandingBalance,
  financedPrincipalAmount,
  type BhphBalanceInput,
} from './balance'
import { interestRateStoredToDecimal } from './contractTerms'
import {
  replayBhphLedger,
  type ContractForReplay,
  type LedgerRowForReplay,
} from './ledgerReplay'

export type BhphContractFinanceRow = BhphBalanceInput & {
  interest_rate?: number | null
  frequency_anchor_date?: string | null
  created_at?: string | null
  status?: string | null
}

export type LedgerRowForFinanceCheck = {
  id: string
  payment_date: string
  amount_paid: number
  payment_type?: string
  notes?: string | null
  created_at?: string
  interest_portion?: number | null
  days_since_last?: number | null
}

/** Principal to use before the next payment when rate > 0 but DB row never seeded. */
export function principalSeedBeforePayments(contract: BhphContractFinanceRow): number | null {
  return (
    financedPrincipalAmount(contract) ??
    canonicalOutstandingBalance(contract)
  )
}

export function contractHasInterest(contract: BhphContractFinanceRow): boolean {
  return interestRateStoredToDecimal(contract.interest_rate) > 0
}

export function contractNeedsPrincipalSeed(contract: BhphContractFinanceRow): boolean {
  return contractHasInterest(contract) && contract.principal_balance == null
}

/**
 * True when ledger splits or contract principal are out of sync with current APR/terms.
 */
export function contractNeedsLedgerReplay(
  contract: BhphContractFinanceRow,
  ledger: LedgerRowForFinanceCheck[],
): boolean {
  if (!contractHasInterest(contract) || ledger.length === 0) return false

  for (const row of ledger) {
    const interest = Number(row.interest_portion) || 0
    const days = Number(row.days_since_last) ?? -1
    const amount = Number(row.amount_paid) || 0
    if (amount > 0 && days > 0 && interest < 0.01) {
      return true
    }
  }

  const replay = replayBhphLedger(
    contract as ContractForReplay,
    ledger as LedgerRowForReplay[],
  )
  const stored = contract.principal_balance
  if (stored != null && Math.abs(Number(stored) - replay.principalBalance) > 0.02) {
    return true
  }

  const totalStoredInterest = ledger.reduce(
    (s, r) => s + (Number(r.interest_portion) || 0),
    0,
  )
  if (Math.abs(totalStoredInterest - replay.totalInterestPaid) > 0.02) {
    return true
  }

  return false
}

export function contractNeedsFinanceRepair(
  contract: BhphContractFinanceRow,
  ledger: LedgerRowForFinanceCheck[],
): boolean {
  if (contract.status && contract.status !== 'active') return false
  return contractNeedsPrincipalSeed(contract) || contractNeedsLedgerReplay(contract, ledger)
}
