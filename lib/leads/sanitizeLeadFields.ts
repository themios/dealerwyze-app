/**
 * Normalize buyer name/email fields after regex or AI extraction.
 * Fixes labeled CRM pastes (e.g. "First Name: Alex") and duplicated emails.
 */

const FIELD_LABEL_PREFIX =
  /^(?:first\s*name|last\s*name|full\s*name|name|email|e-mail|phone|mobile|contact)\s*:\s*/i

/** Strip leading field labels and surrounding angle/bracket wrappers. */
export function stripFieldLabel(value: string): string {
  let v = value.trim()
  for (let i = 0; i < 3; i++) {
    const next = v.replace(FIELD_LABEL_PREFIX, '').trim()
    if (next === v) break
    v = next
  }
  v = v.replace(/^<+|>+$/g, '').trim()
  v = v.replace(/^\[|\]$/g, '').trim()
  return v
}

/** Pick a single buyer email; dedupe repeats and prefer the fullest address when partial. */
export function sanitizeEmail(value: string | null | undefined): string {
  const raw = stripFieldLabel((value ?? '').trim())
  if (!raw) return ''

  const matches = [...raw.matchAll(/[\w.%+-]+@[\w.-]+\.[A-Za-z]{2,}/gi)].map((m) => m[0].toLowerCase())
  if (matches.length === 0) return ''

  const unique = [...new Set(matches)]
  if (unique.length === 1) return unique[0]

  // e.g. "r@yahoo.com [alexdeasisjr@yahoo.com]" — prefer longest local part
  unique.sort((a, b) => b.length - a.length)
  return unique[0]
}

function titleCaseWord(word: string): string {
  if (!word) return word
  if (word.length <= 2 && /^[A-Z]+$/.test(word)) return word
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
}

/** Normalize a person or business name for CRM display. */
export function sanitizePersonName(value: string | null | undefined): string {
  let v = stripFieldLabel((value ?? '').trim())
  if (!v) return ''

  // "FIRST NAME: COREY" → "Corey" when only one token remains after strip
  if (/^first\s*name\s*:/i.test(value ?? '')) {
    v = v.replace(/^first\s*name\s*:/i, '').trim()
  }

  if (v === v.toUpperCase() && /[A-Z]/.test(v) && v.length > 2) {
    v = v
      .split(/\s+/)
      .map(titleCaseWord)
      .join(' ')
  }

  return v.replace(/\s+/g, ' ').trim()
}

/** First token for SMS templates — never "First" from a bad "First Name: …" value. */
export function sanitizeFirstName(fullName: string): string {
  const name = sanitizePersonName(fullName)
  if (!name) return ''
  const first = name.split(/\s+/)[0] ?? name
  if (/^first$/i.test(first) && name.split(/\s+/).length >= 2) {
    return name.split(/\s+/)[1] ?? first
  }
  return first
}

export function buildFullName(first: string, last: string): string {
  const f = sanitizePersonName(first)
  const l = sanitizePersonName(last)
  return [f, l].filter(Boolean).join(' ').trim()
}

export function sanitizeParsedLeadContact(fields: {
  name?: string | null
  email?: string | null
  firstName?: string | null
  lastName?: string | null
}): { name: string; email: string } {
  const first = sanitizePersonName(fields.firstName)
  const last = sanitizePersonName(fields.lastName)
  const fromParts = buildFullName(first, last)
  const name = fromParts || sanitizePersonName(fields.name) || 'Unknown'
  const email = sanitizeEmail(fields.email)
  return { name, email }
}
