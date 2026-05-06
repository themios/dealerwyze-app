/**
 * Pure allocation math mirrored by Postgres `bhph_payment_allocation` / finalize + manual RPCs.
 * Keep in sync with migration 141_bhph_interest_ledger.sql.
 */

export type BhphAllocationInput = {
  paymentAmount: number
  paymentDate: string // YYYY-MM-DD
  interestRateAnnual: number // e.g. 0.24 for 24%
  principalBalance: number | null
  lastPaymentDate: string | null // YYYY-MM-DD
  contractCreatedDate: string // YYYY-MM-DD (UTC calendar date of created_at)
}

export type BhphAllocationResult = {
  daysSinceLast: number
  interestAccrued: number
  interestPortion: number
  principalPortion: number
  /** 0 when principal is not tracked (null balance on contract) */
  principalBalanceAfter: number
  principalTracked: boolean
}

function parseYmd(s: string): { y: number; m: number; d: number } {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number)
  return { y, m, d }
}

/** Days from `from` to `to` (calendar dates, non-negative). */
export function calendarDaysBetween(fromYmd: string, toYmd: string): number {
  const a = parseYmd(fromYmd)
  const b = parseYmd(toYmd)
  const t0 = Date.UTC(a.y, a.m - 1, a.d)
  const t1 = Date.UTC(b.y, b.m - 1, b.d)
  const diff = Math.round((t1 - t0) / 86_400_000)
  return Math.max(0, diff)
}

export function computeBhphPaymentAllocation(input: BhphAllocationInput): BhphAllocationResult {
  const accrualStart = input.lastPaymentDate ?? input.contractCreatedDate
  const daysSinceLast = calendarDaysBetween(accrualStart, input.paymentDate)

  const tracked = input.principalBalance != null
  const balance = input.principalBalance ?? 0

  if (input.interestRateAnnual > 0 && input.principalBalance != null) {
    const dailyRate = input.interestRateAnnual / 365
    const interestAccrued = Math.round(balance * dailyRate * daysSinceLast * 100) / 100
    const interestPortion = Math.min(input.paymentAmount, interestAccrued)
    const principalPortion = input.paymentAmount - interestPortion
    const principalBalanceAfter = Math.max(0, Math.round((balance - principalPortion) * 100) / 100)
    return {
      daysSinceLast,
      interestAccrued,
      interestPortion,
      principalPortion,
      principalBalanceAfter,
      principalTracked: true,
    }
  }

  const principalPortion = input.paymentAmount
  const principalBalanceAfter = tracked
    ? Math.max(0, Math.round((balance - principalPortion) * 100) / 100)
    : 0

  return {
    daysSinceLast,
    interestAccrued: 0,
    interestPortion: 0,
    principalPortion,
    principalBalanceAfter,
    principalTracked: tracked,
  }
}

/** Mirrors SQL next_due_date advance rule in finalize_bhph_payment / record_bhph_manual_payment. */
export function shouldAdvanceBhphDueDate(params: {
  paymentAmount: number
  monthlyPayment: number
  principalBalanceAfter: number
  hadTrackedPrincipal: boolean
}): boolean {
  if (params.hadTrackedPrincipal && params.principalBalanceAfter <= 0) return false
  return params.paymentAmount >= params.monthlyPayment
}
