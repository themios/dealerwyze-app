/**
 * BHPH balance helpers.
 * loan_amount = total contract / purchase price; down_payment collected at sale;
 * total_paid = installment payments after sale (not including down).
 */

export type BhphBalanceInput = {
  loan_amount: number | null
  down_payment?: number | null
  total_paid?: number | null
  principal_balance?: number | null
}

function roundMoney(n: number): number {
  return Math.max(0, Math.round(n * 100) / 100)
}

/** Principal still owed after down and installment payments (no interest adjustment). */
export function financedPrincipalAmount(input: BhphBalanceInput): number | null {
  const loan = input.loan_amount
  if (loan == null || loan <= 0) return null
  const down = input.down_payment ?? 0
  return roundMoney(loan - down)
}

/** Cash collected toward the contract (down + installments). */
export function totalCollectedTowardContract(input: BhphBalanceInput): number {
  return roundMoney((input.down_payment ?? 0) + (input.total_paid ?? 0))
}

/** Canonical outstanding balance: purchase − down − installments. */
export function canonicalOutstandingBalance(input: BhphBalanceInput): number | null {
  const loan = input.loan_amount
  if (loan == null || loan <= 0) return null
  return roundMoney(loan - (input.down_payment ?? 0) - (input.total_paid ?? 0))
}

/**
 * Outstanding balance for UI and list views.
 * Uses principal_balance when tracked, except legacy rows that omitted down at sale.
 */
export function computeBhphOutstandingBalance(input: BhphBalanceInput): number | null {
  const canonical = canonicalOutstandingBalance(input)
  if (canonical == null) {
    return input.principal_balance != null
      ? roundMoney(input.principal_balance)
      : null
  }

  const principal = input.principal_balance
  if (principal == null) return canonical

  const loan = input.loan_amount ?? 0
  const down = input.down_payment ?? 0
  const paid = input.total_paid ?? 0
  const legacyOmittedDown =
    down > 0 &&
    Math.abs(principal - roundMoney(loan - paid)) < 0.02 &&
    canonical < principal - 0.01

  if (legacyOmittedDown) return canonical
  return roundMoney(principal)
}

export function computeBhphPaidPercent(input: BhphBalanceInput): number {
  const loan = input.loan_amount
  if (!loan || loan <= 0) return 0
  return Math.min(100, Math.round((totalCollectedTowardContract(input) / loan) * 100))
}
