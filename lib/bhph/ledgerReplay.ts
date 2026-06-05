import { financedPrincipalAmount } from './balance'
import { interestRateStoredToDecimal } from './contractTerms'
import { bhphAccrualAnchorDate } from './payoff'
import { computeBhphPaymentAllocation } from './interestAllocation'

function roundMoney(n: number): number {
  return Math.max(0, Math.round(n * 100) / 100)
}

export type LedgerRowForReplay = {
  id: string
  payment_date: string
  amount_paid: number
  payment_type: string
  notes: string | null
  created_at?: string
}

export type ContractForReplay = {
  loan_amount: number | null
  down_payment?: number | null
  interest_rate?: number | null
  frequency_anchor_date?: string | null
  created_at?: string | null
  principal_balance?: number | null
}

export type ReplayedLedgerRow = {
  id: string
  payment_date: string
  amount_paid: number
  interest_portion: number
  principal_portion: number
  principal_balance_after: number
  days_since_last: number
}

export type LedgerReplayResult = {
  rows: ReplayedLedgerRow[]
  principalBalance: number
  totalInterestPaid: number
  totalInstallmentsPaid: number
  lastPaymentDate: string | null
}

/**
 * Re-apply interest/principal splits to existing ledger rows in chronological order.
 * Use after setting APR or when legacy rows recorded $0 interest.
 */
export function replayBhphLedger(
  contract: ContractForReplay,
  ledgerAsc: LedgerRowForReplay[],
): LedgerReplayResult {
  const rate = interestRateStoredToDecimal(contract.interest_rate)
  const anchor = bhphAccrualAnchorDate(contract)
  // Always replay from financed principal (sale price − down), not current balance.
  let balance = financedPrincipalAmount(contract) ?? 0
  let lastPaymentDate: string | null = null
  let totalInterestPaid = 0
  let totalInstallmentsPaid = 0

  const sorted = [...ledgerAsc].sort((a, b) => {
    const d = a.payment_date.localeCompare(b.payment_date)
    if (d !== 0) return d
    return (a.created_at ?? '').localeCompare(b.created_at ?? '')
  })

  const rows: ReplayedLedgerRow[] = []

  for (const entry of sorted) {
    const alloc = computeBhphPaymentAllocation({
      paymentAmount: Number(entry.amount_paid),
      paymentDate: entry.payment_date.slice(0, 10),
      interestRateAnnual: rate,
      principalBalance: rate > 0 ? balance : balance,
      lastPaymentDate,
      contractCreatedDate: anchor,
    })

    rows.push({
      id: entry.id,
      payment_date: entry.payment_date,
      amount_paid: roundMoney(Number(entry.amount_paid)),
      interest_portion: roundMoney(alloc.interestPortion),
      principal_portion: roundMoney(alloc.principalPortion),
      principal_balance_after: roundMoney(alloc.principalBalanceAfter),
      days_since_last: alloc.daysSinceLast,
    })

    balance = roundMoney(alloc.principalBalanceAfter)
    lastPaymentDate = entry.payment_date.slice(0, 10)
    totalInterestPaid = roundMoney(totalInterestPaid + alloc.interestPortion)
    totalInstallmentsPaid = roundMoney(totalInstallmentsPaid + Number(entry.amount_paid))
  }

  return {
    rows,
    principalBalance: balance,
    totalInterestPaid,
    totalInstallmentsPaid,
    lastPaymentDate,
  }
}

export function sumLedgerInterestYtd(
  rows: Array<{ payment_date: string; interest_portion: number }>,
  year = new Date().getFullYear(),
): number {
  let sum = 0
  for (const row of rows) {
    const y = parseInt(row.payment_date.slice(0, 4), 10)
    if (y === year) {
      sum += Number(row.interest_portion) || 0
    }
  }
  return roundMoney(sum)
}
