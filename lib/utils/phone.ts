/**
 * Strips a raw phone string to its 10 US digits.
 * Drops leading "1" country code if present (11-digit input).
 * Returns an empty string if the input has no recognizable digits.
 */
export function normalizePhone(raw: string): string {
  const digits = (raw ?? '').replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1)
  return digits.slice(0, 10)
}

/**
 * Formats a phone number for display: (NXX) NXX-XXXX
 * Accepts raw strings with any formatting — strips non-digits first.
 */
export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
  }
  if (digits.length === 11 && digits[0] === '1') {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`
  }
  return phone
}

/**
 * Formats a phone number as a tel: URI value (E.164 style for <a href="tel:...">).
 */
export function formatPhoneForTel(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  return digits.length === 10 ? `+1${digits}` : `+${digits}`
}
