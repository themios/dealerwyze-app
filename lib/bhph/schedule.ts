/**
 * BHPH Payment Schedule Utilities
 * Uses anchor-based calculation to prevent calendar drift.
 */

export type PaymentFrequency = 'weekly' | 'biweekly' | 'monthly'

/**
 * Calculate the next due date after a payment is made.
 *
 * For monthly: clamps to end-of-month if anchor day > days in target month.
 * For weekly/biweekly: advances from anchor date, not from last payment date.
 */
export function nextDueDate(
  currentDue: string,           // YYYY-MM-DD
  frequency: PaymentFrequency,
  anchorDay?: number            // original payment day (1–31) for monthly
): string {
  const date = new Date(currentDue + 'T12:00:00Z') // noon UTC avoids DST edge cases

  if (frequency === 'weekly') {
    date.setUTCDate(date.getUTCDate() + 7)
  } else if (frequency === 'biweekly') {
    date.setUTCDate(date.getUTCDate() + 14)
  } else {
    // Monthly: advance by one month, clamp to end-of-month
    const day = anchorDay ?? date.getUTCDate()
    date.setUTCMonth(date.getUTCMonth() + 1)
    // Find last day of the new month
    const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()
    date.setUTCDate(Math.min(day, lastDay))
  }

  return date.toISOString().split('T')[0]
}

/**
 * Get today's date string in a given IANA timezone (e.g. "America/Los_Angeles").
 */
export function todayInTimezone(tz: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date()) // en-CA locale gives YYYY-MM-DD format
}

/**
 * Days between two YYYY-MM-DD date strings (b - a).
 * Positive = b is after a. Negative = b is before a.
 */
export function daysBetween(a: string, b: string): number {
  const msPerDay = 1000 * 60 * 60 * 24
  return Math.round(
    (new Date(b + 'T12:00:00Z').getTime() - new Date(a + 'T12:00:00Z').getTime()) / msPerDay
  )
}

/**
 * Is the current time within the allowed SMS send window (9am–7pm) in the given timezone?
 */
export function isWithinSendHours(tz: string): boolean {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    hour12: false,
  }).formatToParts(new Date())
  const hour = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0', 10)
  return hour >= 9 && hour < 19 // 9am inclusive, 7pm exclusive
}

/**
 * Standard TCPA consent disclosure text shown to customer at signing.
 */
export const CONSENT_DISCLOSURE =
  'By providing your phone number, you agree to receive automated payment reminders ' +
  'and account notifications from the dealership at the number provided. ' +
  'Approx. 4–6 msg/month. Msg & data rates may apply. Reply STOP to cancel, HELP for info. ' +
  'Consent is not a condition of purchase.'
