/** Client-side buyer contact validation for public showing forms. */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isValidBuyerEmail(email: string): boolean {
  const trimmed = email.trim()
  if (!trimmed || trimmed.length > 200) return false
  return EMAIL_RE.test(trimmed)
}

export function normalizePhoneDigits(phone: string): string {
  return phone.replace(/\D/g, '')
}

/** US/international: at least 10 digits when provided. */
export function isValidBuyerPhone(phone: string): boolean {
  const digits = normalizePhoneDigits(phone)
  if (digits.length === 0) return true
  return digits.length >= 10 && digits.length <= 15
}

export function formatPhoneHint(phone: string): string {
  const digits = normalizePhoneDigits(phone)
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
  }
  return phone.trim()
}
