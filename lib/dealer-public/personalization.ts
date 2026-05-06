/**
 * Sanitize and merge dealer public-site personalization (theme, social, fonts, copy limits).
 */

import type { CSSProperties } from 'react'

export type FontPresetId = 'apollo' | 'heritage' | 'metro' | 'showroom' | 'minimal'

export const FONT_PRESET_OPTIONS: FontPresetId[] = ['apollo', 'heritage', 'metro', 'showroom', 'minimal']

const FONT_PRESETS = FONT_PRESET_OPTIONS

/** CSS var names must match next/font `variable` in app/[slug]/layout.tsx */
export function fontVarTriplet(preset: string | null | undefined): {
  display: string
  body: string
  script: string
} {
  const p = (FONT_PRESETS.includes(preset as FontPresetId) ? preset : 'apollo') as FontPresetId
  const map: Record<FontPresetId, { display: string; body: string; script: string }> = {
    apollo: { display: 'var(--font-cormorant)', body: 'var(--font-poppins)', script: 'var(--font-dancing)' },
    heritage: { display: 'var(--font-lora)', body: 'var(--font-source-sans-3)', script: 'var(--font-lora)' },
    metro: { display: 'var(--font-manrope)', body: 'var(--font-dm-sans)', script: 'var(--font-manrope)' },
    showroom: { display: 'var(--font-playfair)', body: 'var(--font-inter)', script: 'var(--font-playfair)' },
    minimal: { display: 'var(--font-inter)', body: 'var(--font-inter)', script: 'var(--font-inter)' },
  }
  return map[p]
}

const HEX = /^#[0-9A-Fa-f]{6}$/

export type ThemeColors = {
  navy: string
  navyDeep: string
  navyLight: string
  gold: string
  goldLight: string
  cream: string
  warmWhite: string
  white: string
  ink: string
}

export const DEFAULT_THEME: ThemeColors = {
  navy: '#0E2A47',
  navyDeep: '#091E33',
  navyLight: '#163C66',
  gold: '#D4AF37',
  goldLight: '#E8C76A',
  cream: '#F7F1E3',
  warmWhite: '#FAF7EE',
  white: '#FFFFFF',
  ink: '#0A1A2E',
}

const THEME_KEYS = Object.keys(DEFAULT_THEME) as (keyof ThemeColors)[]

export function mergeThemeColors(raw: unknown): ThemeColors {
  const out = { ...DEFAULT_THEME }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  const o = raw as Record<string, unknown>
  for (const key of THEME_KEYS) {
    const v = o[key]
    if (typeof v === 'string' && HEX.test(v.trim())) {
      out[key] = v.trim()
    }
  }
  return out
}

export type WebsiteSocial = {
  facebook?: string
  instagram?: string
  youtube?: string
  tiktok?: string
  x?: string
}

const SOCIAL_KEYS = ['facebook', 'instagram', 'youtube', 'tiktok', 'x'] as const

function normalizeSocialUrl(raw: string): string | null {
  const t = raw.trim()
  if (!t) return null
  try {
    const u = new URL(t.startsWith('http') ? t : `https://${t}`)
    if (u.protocol === 'http:') u.protocol = 'https:'
    if (u.protocol !== 'https:') return null
    return u.toString()
  } catch {
    return null
  }
}

export function sanitizeWebsiteSocial(raw: unknown): WebsiteSocial {
  const out: WebsiteSocial = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  const o = raw as Record<string, unknown>
  for (const key of SOCIAL_KEYS) {
    const v = o[key]
    if (typeof v !== 'string') continue
    const n = normalizeSocialUrl(v)
    if (n) out[key] = n
  }
  return out
}

export function sanitizePlainText(raw: unknown, maxLen: number): string | null {
  if (raw === null || raw === undefined) return null
  if (typeof raw !== 'string') return null
  const t = raw.replace(/\r\n/g, '\n').trim()
  if (!t) return null
  return t.length <= maxLen ? t : t.slice(0, maxLen).trimEnd()
}

export function sanitizeSeoDescription(raw: unknown): string | null {
  const s = sanitizePlainText(raw, 320)
  if (!s) return null
  const oneLine = s.replace(/\s+/g, ' ').trim()
  return oneLine.length <= 320 ? oneLine : oneLine.slice(0, 320).trimEnd()
}

export function sanitizeSeoKeywords(raw: unknown): string | null {
  const s = sanitizePlainText(raw, 500)
  if (!s) return null
  return s.replace(/\s+/g, ' ').trim()
}

/** One paragraph for meta / JSON-LD — no HTML. */
export function plainTextSnippet(text: string | null | undefined, maxLen: number): string | null {
  if (!text?.trim()) return null
  const one = text.replace(/\s+/g, ' ').trim()
  return one.length <= maxLen ? one : `${one.slice(0, maxLen).trimEnd()}…`
}

/** Inline style for public layout root: palette + font role variables used across dealer-public CSS. */
export function themeToInlineStyle(theme: ThemeColors, fontPreset: string | null | undefined): CSSProperties {
  const f = fontVarTriplet(fontPreset)
  return {
    '--dp-navy': theme.navy,
    '--dp-navy-deep': theme.navyDeep,
    '--dp-navy-light': theme.navyLight,
    '--dp-gold': theme.gold,
    '--dp-gold-light': theme.goldLight,
    '--dp-cream': theme.cream,
    '--dp-warm-white': theme.warmWhite,
    '--dp-white': theme.white,
    '--dp-ink': theme.ink,
    '--dp-red': '#B5252E',
    '--font-dp-display': f.display,
    '--font-dp-body': f.body,
    '--font-dp-script': f.script,
  } as CSSProperties
}

export function buildPublicMetaDescription(opts: {
  seoDescription: string | null | undefined
  tagline: string | null | undefined
  about: string | null | undefined
  displayName: string
}): string {
  const seo = opts.seoDescription?.trim()
  if (seo) return seo
  const fromAbout = plainTextSnippet(opts.about, 220)
  const tag = opts.tagline?.trim()
  if (fromAbout) {
    return tag ? `${tag} — ${fromAbout}` : fromAbout
  }
  if (tag) return tag
  return `Shop quality used vehicles at ${opts.displayName}. Browse inventory, pricing, and contact the dealership.`
}

export function metaKeywordsList(raw: string | null | undefined): string[] | undefined {
  if (!raw?.trim()) return undefined
  const parts = raw.split(',').map(s => s.trim()).filter(Boolean)
  return parts.length ? parts.slice(0, 40) : undefined
}

export function sameAsUrls(social: WebsiteSocial, externalWebsite: string | null): string[] {
  const urls: string[] = []
  if (externalWebsite?.trim()) urls.push(externalWebsite.trim())
  const order: (keyof WebsiteSocial)[] = ['facebook', 'instagram', 'youtube', 'tiktok', 'x']
  for (const k of order) {
    const u = social[k]
    if (u) urls.push(u)
  }
  return [...new Set(urls)]
}

export function sanitizeFontPreset(raw: unknown): FontPresetId {
  if (typeof raw !== 'string') return 'apollo'
  return FONT_PRESET_OPTIONS.includes(raw as FontPresetId) ? (raw as FontPresetId) : 'apollo'
}

export { parseHoursToSchema } from '@/lib/dealer-public/openingHours'

const TAG_MAX = 30
const TAG_MAX_COUNT = 8

/** Multi-select or comma-separated; strips control chars; max 8 × 30 chars. */
export function sanitizeSpecialtyTags(raw: unknown): string[] | null {
  const items: unknown[] = Array.isArray(raw)
    ? raw
    : typeof raw === 'string'
      ? raw.split(',').map(s => s.trim())
      : []
  const out: string[] = []
  for (const item of items) {
    if (typeof item !== 'string') continue
    const t = item
      .replace(/[\u0000-\u001F<>]/g, '')
      .trim()
      .slice(0, TAG_MAX)
    if (!t) continue
    if (!out.some(x => x.toLowerCase() === t.toLowerCase())) out.push(t)
    if (out.length >= TAG_MAX_COUNT) break
  }
  return out.length ? out : null
}

export function sanitizeCtaUrl(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null
  if (typeof raw !== 'string') return null
  const s = raw.trim()
  if (!s) return null
  if (s.startsWith('/')) {
    if (!/^\/[a-zA-Z0-9/_?=&%.:\-]*$/.test(s)) return null
    return s
  }
  try {
    const u = new URL(s)
    if (u.protocol === 'http:') u.protocol = 'https:'
    if (u.protocol !== 'https:') return null
    return u.toString()
  } catch {
    return null
  }
}

export function sanitizeGtmId(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null
  if (typeof raw !== 'string') return null
  const s = raw.trim().toUpperCase()
  if (!s) return null
  if (!/^GTM-[A-Z0-9]{4,12}$/.test(s)) return null
  return s
}

export function sanitizeGoogleSiteVerification(raw: unknown): string | null {
  const s = sanitizePlainText(raw, 120)
  if (!s) return null
  const one = s.replace(/\s+/g, '').trim()
  if (!/^[a-zA-Z0-9_-]+$/.test(one)) return null
  return one
}

export function sanitizeEstablishedYear(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null
  const n = typeof raw === 'number' ? raw : parseInt(String(raw), 10)
  if (!Number.isFinite(n)) return null
  const y = new Date().getFullYear()
  if (n < 1800 || n > y) return null
  return n
}

/** City for local SEO titles — address line before state, or first locality in service area. */
export function extractCityFromAddress(
  address: string | null | undefined,
  serviceArea: string | null | undefined,
): string | null {
  const a = address?.trim()
  const s = serviceArea?.trim()
  if (s?.toLowerCase().startsWith('serving ')) {
    const rest = s.slice(8).split(/[,;]/)[0]?.trim()
    if (rest) return rest
  }
  if (s) {
    const first = s.split(/[,;]/)[0]?.trim()
    if (first) return first.replace(/^serving\s+/i, '').trim() || null
  }
  if (a) {
    const parts = a.split(',').map(p => p.trim()).filter(Boolean)
    if (parts.length >= 2) {
      const maybeCity = parts[parts.length - 2]
      if (maybeCity && !/^\d/.test(maybeCity) && maybeCity.length < 80) return maybeCity
    }
  }
  return null
}

export function vdpMetaDescriptionFallback(opts: {
  year: number | null
  make: string | null
  model: string | null
  mileage: number | null
  price: number | null
  dealerName: string
  city: string | null
  specialtyTags: string[] | null
}): string {
  const ym = [opts.year, opts.make, opts.model].filter(Boolean).join(' ').trim() || 'Used vehicle'
  const mi =
    opts.mileage != null ? `${opts.mileage.toLocaleString('en-US')} miles` : null
  const pr =
    opts.price != null
      ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(
          opts.price,
        )
      : 'Call for price'
  const loc = opts.city ? ` in ${opts.city}` : ''
  const tags =
    opts.specialtyTags?.length && opts.specialtyTags.length <= 4
      ? ` ${opts.specialtyTags.join(', ')}.`
      : '.'
  const mid = mi ? ` with ${mi}` : ''
  return `${ym}${mid}, priced at ${pr}. Available at ${opts.dealerName}${loc}${tags}`.replace(/\s+/g, ' ').trim()
}
