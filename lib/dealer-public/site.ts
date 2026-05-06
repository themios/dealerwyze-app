/** Base URL for canonical / OG URLs on the public dealer site. */
export function getPublicAppBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (raw) return raw.replace(/\/$/, '')
  return 'https://dealerwyze.com'
}

export function absoluteUrl(path: string): string {
  const base = getPublicAppBaseUrl()
  if (path.startsWith('http')) return path
  const p = path.startsWith('/') ? path : `/${path}`
  return `${base}${p}`
}

/** Resolve dealer CTA href: absolute URL or site-relative path → absolute. */
export function resolvePublicCtaUrl(raw: string | null | undefined): string | null {
  const base = getPublicAppBaseUrl()
  if (!raw?.trim()) return null
  const s = raw.trim()
  if (s.startsWith('https://') || s.startsWith('http://')) return s
  if (s.startsWith('/')) return `${base.replace(/\/$/, '')}${s}`
  return null
}

/**
 * Fallback when org has no website_logo_url — static asset in /public (Apollo *theme* bundle).
 * The folder name `apollo-auto` is not your organization `slug`; the slug is stored on `organizations.slug`.
 */
export const DEALER_THEME_DEFAULT_LOGO_PATH = '/dealer-themes/apollo-auto/default-logo.png'

/** Safe JSON-LD for `<script type="application/ld+json">` — escapes `<` per Next/VDP pattern. */
export function jsonLdInline(obj: unknown): string {
  return JSON.stringify(obj).replace(/</g, '\\u003c')
}
