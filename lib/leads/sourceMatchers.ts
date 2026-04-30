export type LeadSourceEmailMatcherType = 'exact' | 'domain' | 'contains'

export interface LeadSourceEmailMatcher {
  type: LeadSourceEmailMatcherType
  value: string
}

const DEFAULT_MATCHERS: LeadSourceEmailMatcher[] = [
  { type: 'domain', value: 'cargurus.com' },
  { type: 'domain', value: 'messages.cargurus.com' },
  { type: 'exact', value: 'dealer-leads@messages.cargurus.com' },
  { type: 'domain', value: 'autotrader.com' },
  { type: 'domain', value: 'messages.autotrader.com' },
  { type: 'domain', value: 'offerup.com' },
  { type: 'domain', value: 'messages.offerup.com' },
  { type: 'domain', value: 'kbb.com' },
  { type: 'domain', value: 'autolist.com' },
  { type: 'domain', value: 'carsforsalemail.com' },
  { type: 'domain', value: 'carsforsale.com' },
  { type: 'domain', value: 'facebookmail.com' },
]

const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i
const DOMAIN_RE = /^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i

function normalizeMatcherValue(value: string): string {
  return value.trim().toLowerCase()
}

export function inferLeadSourceEmailMatcherType(value: string): LeadSourceEmailMatcherType {
  const normalized = normalizeMatcherValue(value)
  if (EMAIL_RE.test(normalized)) return 'exact'
  if (DOMAIN_RE.test(normalized)) return 'domain'
  return 'contains'
}

function coerceMatcher(input: unknown): LeadSourceEmailMatcher | null {
  if (typeof input === 'string') {
    const value = normalizeMatcherValue(input)
    if (!value) return null
    return { type: inferLeadSourceEmailMatcherType(value), value }
  }

  if (!input || typeof input !== 'object') return null

  const rawValue = typeof (input as { value?: unknown }).value === 'string'
    ? (input as { value: string }).value
    : ''
  const value = normalizeMatcherValue(rawValue)
  if (!value) return null

  const rawType = typeof (input as { type?: unknown }).type === 'string'
    ? (input as { type: string }).type
    : ''
  const type = rawType === 'exact' || rawType === 'domain' || rawType === 'contains'
    ? rawType
    : inferLeadSourceEmailMatcherType(value)

  return { type, value }
}

function isValidMatcher(matcher: LeadSourceEmailMatcher): boolean {
  if (matcher.value.length > 160) return false
  if (matcher.type === 'exact') return EMAIL_RE.test(matcher.value)
  if (matcher.type === 'domain') return DOMAIN_RE.test(matcher.value)
  return matcher.value.length >= 4
}

export function sanitizeLeadSourceEmailMatchers(input: unknown): LeadSourceEmailMatcher[] {
  if (!Array.isArray(input)) return []

  const seen = new Set<string>()
  const next: LeadSourceEmailMatcher[] = []

  for (const raw of input) {
    const matcher = coerceMatcher(raw)
    if (!matcher || !isValidMatcher(matcher)) continue
    const key = `${matcher.type}:${matcher.value}`
    if (seen.has(key)) continue
    seen.add(key)
    next.push(matcher)
    if (next.length >= 30) break
  }

  return next
}

export function getLeadSourceEmailMatchers(input: unknown): LeadSourceEmailMatcher[] {
  return sanitizeLeadSourceEmailMatchers([...DEFAULT_MATCHERS, ...sanitizeLeadSourceEmailMatchers(input)])
}

export function getDefaultLeadSourceEmailMatchers(): LeadSourceEmailMatcher[] {
  return [...DEFAULT_MATCHERS]
}

export function extractEmailAddress(value: string | null | undefined): string {
  const raw = (value ?? '').trim().toLowerCase()
  if (!raw) return ''
  const match = raw.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i)
  return match?.[0] ?? raw
}

export function matchLeadSourceEmail(
  input: string | null | undefined,
  matchers: LeadSourceEmailMatcher[],
): LeadSourceEmailMatcher | null {
  const email = extractEmailAddress(input)
  if (!email) return null

  for (const matcher of matchers) {
    if (matcher.type === 'exact' && email === matcher.value) return matcher
  }
  for (const matcher of matchers) {
    if (matcher.type === 'domain' && (email === matcher.value || email.endsWith(`@${matcher.value}`) || email.endsWith(matcher.value))) {
      return matcher
    }
  }
  for (const matcher of matchers) {
    if (matcher.type === 'contains' && email.includes(matcher.value)) return matcher
  }

  return null
}

export function matchesLeadSourceEmail(
  input: string | null | undefined,
  matchers: LeadSourceEmailMatcher[],
): boolean {
  return !!matchLeadSourceEmail(input, matchers)
}

export function buildLeadSourceEmailGmailQuery(matchers: LeadSourceEmailMatcher[]): string {
  const parts = matchers
    .map(matcher => matcher.value.replace(/["\\]/g, '').trim())
    .filter(Boolean)
    .map(value => `from:${value}`)

  if (parts.length === 0) return 'newer_than:2d'
  return `(${Array.from(new Set(parts)).join(' OR ')}) newer_than:2d`
}
