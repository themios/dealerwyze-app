import { interestRateStoredToDecimal } from './contractTerms'
import { calendarDaysBetween, computeBhphPaymentAllocation } from './interestAllocation'

function roundMoney(n: number): number {
  return Math.max(0, Math.round(n * 100) / 100)
}

export type BhphPayoffInput = {
  principalBalance: number | null
  interestRate: number | null | undefined
  lastPaymentDate: string | null
  accrualAnchorDate: string
  asOfDate?: string
}

export type BhphPayoffQuote = {
  asOfDate: string
  principalBalance: number
  accruedInterestToDate: number
  payoffTotal: number
  daysAccrued: number
  annualRatePercent: number
}

export function bhphAccrualAnchorDate(contract: {
  frequency_anchor_date?: string | null
  created_at?: string | null
}): string {
  if (contract.frequency_anchor_date) {
    return contract.frequency_anchor_date.slice(0, 10)
  }
  if (contract.created_at) {
    return contract.created_at.slice(0, 10)
  }
  return new Date().toISOString().slice(0, 10)
}

/** Payoff = remaining principal + simple interest accrued through asOfDate. */
export function computeBhphPayoffQuote(input: BhphPayoffInput): BhphPayoffQuote | null {
  const principal = input.principalBalance
  if (principal == null || principal <= 0) return null

  const rate = interestRateStoredToDecimal(input.interestRate)
  const asOfDate = input.asOfDate ?? new Date().toISOString().slice(0, 10)
  const accrualStart = input.lastPaymentDate ?? input.accrualAnchorDate
  const daysAccrued = calendarDaysBetween(accrualStart, asOfDate)

  let accruedInterestToDate = 0
  if (rate > 0 && daysAccrued > 0) {
    accruedInterestToDate = roundMoney(principal * (rate / 365) * daysAccrued)
  }

  return {
    asOfDate,
    principalBalance: roundMoney(principal),
    accruedInterestToDate,
    payoffTotal: roundMoney(principal + accruedInterestToDate),
    daysAccrued,
    annualRatePercent: Math.round(rate * 10000) / 100,
  }
}

/** Unpaid interest only (payoff minus principal). */
export function computeAccruedInterestUnpaid(quote: BhphPayoffQuote): number {
  return roundMoney(quote.payoffTotal - quote.principalBalance)
}
