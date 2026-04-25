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
