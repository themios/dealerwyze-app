function stripCombiningMarks(value: string): string {
  return value.replace(/[\u0300-\u036f]/g, '')
}

/**
 * Normalize text used in email headers.
 * This avoids malformed/garbled subjects when decorative Unicode or bad copy/paste
 * ends up in a subject or sender display name.
 */
export function sanitizeEmailHeaderText(value: string, fallback = ''): string {
  const cleaned = stripCombiningMarks(
    value
      .normalize('NFKD')
      .replace(/\uFFFD/g, '')
      .replace(/[\r\n\t]/g, ' ')
  )
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()

  return cleaned || fallback
}
