import { z } from 'zod'

/** DB stores annual rate as decimal (0.2399 = 23.99% APR). */
export function interestRateStoredToDecimal(stored: number | null | undefined): number {
  if (stored == null || !Number.isFinite(stored) || stored <= 0) return 0
  if (stored > 1) return Math.min(1, Math.round((stored / 100) * 10000) / 10000)
  return stored
}

/** User-facing percent from form or display (accepts 23.99 or 0.2399). */
export function parseAnnualInterestPercentInput(raw: string | number | null | undefined): number {
  if (raw == null || raw === '') return 0
  const n = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(/%/g, '').trim())
  if (!Number.isFinite(n) || n < 0) return 0
  if (n > 0 && n <= 1) return Math.min(100, n * 100)
  return Math.min(100, n)
}

export function percentInputToStoredDecimal(percent: number): number {
  const p = Math.min(100, Math.max(0, percent))
  return Math.round((p / 100) * 10000) / 10000
}

export function formatAprFromStored(stored: number | null | undefined): string {
  const decimal = interestRateStoredToDecimal(stored)
  if (decimal <= 0) return 'None'
  return `${(decimal * 100).toFixed(2)}% APR`
}

export function storedRateToPercentInputValue(stored: number | null | undefined): string {
  const decimal = interestRateStoredToDecimal(stored)
  if (decimal <= 0) return ''
  return String(Math.round(decimal * 10000) / 100)
}

const optionalPositive = z
  .union([z.number(), z.string()])
  .optional()
  .transform((v) => {
    if (v == null || v === '') return undefined
    const n = typeof v === 'number' ? v : parseFloat(String(v))
    return Number.isFinite(n) && n > 0 ? n : undefined
  })

export const BhphContractTermsPatchSchema = z.object({
  annual_interest_rate_percent: z.union([z.number(), z.string()]).optional(),
  monthly_payment: optionalPositive,
  payment_frequency: z.enum(['weekly', 'biweekly', 'monthly']).optional(),
  payment_day: z
    .union([z.number(), z.string()])
    .optional()
    .transform((v) => {
      if (v == null || v === '') return undefined
      const n = typeof v === 'number' ? v : parseInt(String(v), 10)
      if (!Number.isFinite(n) || n < 1 || n > 31) return undefined
      return n
    }),
  notes: z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => {
      if (v == null) return null
      const t = v.trim()
      return t.length > 0 ? t.slice(0, 4000) : null
    }),
})

export type BhphContractTermsPatchInput = z.infer<typeof BhphContractTermsPatchSchema>

export function buildContractTermsUpdate(
  input: BhphContractTermsPatchInput,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  if (input.annual_interest_rate_percent !== undefined) {
    const pct = parseAnnualInterestPercentInput(input.annual_interest_rate_percent)
    patch.interest_rate = percentInputToStoredDecimal(pct)
  }
  if (input.monthly_payment !== undefined) patch.monthly_payment = input.monthly_payment
  if (input.payment_frequency !== undefined) patch.payment_frequency = input.payment_frequency
  if (input.payment_day !== undefined) {
    patch.payment_day_of_month = input.payment_day
    patch.payment_day_anchor = input.payment_day
  }
  if (input.notes !== undefined) patch.notes = input.notes
  return patch
}
