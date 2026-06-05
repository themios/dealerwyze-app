/**
 * Factual area/location context for RE listing AI — no invented landmarks or amenities.
 * Sources: listing fields, MLS remarks (agent_notes), optional Wikipedia summary (cached).
 */

import { propertyTypeLabel, type ReListingFields } from '@/lib/vehicles/listingOverviewPrompts'

const CACHE_TTL_DAYS = 30

const US_STATE_NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri',
  MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio',
  OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
  DC: 'District of Columbia',
}

export type AreaContextSource = 'listing_fields' | 'listing_remarks' | 'wikipedia'

export interface AreaContextPayload {
  cacheKey: string
  city: string
  state: string
  propertyType: string | null
  lines: string[]
  sources: AreaContextSource[]
  wikipediaTitle?: string
  angleHint: string
  fetchedAt: string
}

export interface AreaContextListingInput extends ReListingFields {
  agent_notes?: string | null
  market_data_json?: unknown
}

function stateDisplay(abbr: string): string {
  const key = abbr.trim().toUpperCase()
  return US_STATE_NAMES[key] ?? abbr.trim()
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildCacheKey(city: string, state: string, zip: string | null | undefined): string {
  return [city.trim().toLowerCase(), state.trim().toUpperCase(), (zip ?? '').trim()].join('|')
}

function readCached(
  marketJson: unknown,
  cacheKey: string,
): AreaContextPayload | null {
  if (!marketJson || typeof marketJson !== 'object') return null
  const cached = (marketJson as { areaContext?: AreaContextPayload }).areaContext
  if (!cached?.fetchedAt || cached.cacheKey !== cacheKey) return null
  const ageDays =
    (Date.now() - new Date(cached.fetchedAt).getTime()) / (24 * 3_600_000)
  if (ageDays > CACHE_TTL_DAYS) return null
  return cached
}

function listingFieldLines(v: AreaContextListingInput): string[] {
  const lines: string[] = []
  const city = v.city?.trim()
  const state = v.state?.trim()
  if (city && state) {
    lines.push(`Municipality: ${city}, ${state}${v.zip ? ` (ZIP ${v.zip.trim()})` : ''}`)
  }
  if (v.subdivision?.trim()) lines.push(`Subdivision: ${v.subdivision.trim()}`)
  if (v.school_district?.trim()) lines.push(`School district: ${v.school_district.trim()}`)
  if (v.address_line1?.trim()) {
    const addr = [v.address_line1, city, state].filter(Boolean).join(', ')
    if (addr) lines.push(`Street address: ${addr}`)
  }
  return lines
}

function propertyTypeAngleHint(propertyType: string | null | undefined): string {
  const label = propertyTypeLabel(propertyType)
  switch (propertyType) {
    case 'land':
      return `Property is ${label}. Area copy may describe county, rural or town setting, and road or lot access only when stated in verified context — not invented zoning or utilities.`
    case 'commercial':
      return `Property is ${label}. Mention business district, traffic, or commercial character only if explicitly stated in verified context below.`
    case 'multi_family':
      return `Property is ${label}. Mention rental or multi-unit neighborhood context only if explicitly stated in verified context below.`
    case 'condo':
    case 'townhouse':
      return `Property is ${label}. Mention HOA, walkability, or community amenities only if explicitly stated in verified context or listing fields.`
    case 'single_family':
    default:
      return `Property is ${label}. Family-oriented or residential neighborhood character is appropriate only when supported by school district, subdivision, or verified remarks — never assumed.`
  }
}

async function fetchWikipediaExtract(city: string, stateAbbr: string): Promise<{
  title: string
  extract: string
} | null> {
  const stateName = stateDisplay(stateAbbr)
  const candidates = [
    `${city}, ${stateName}`,
    `${city}, ${stateAbbr.toUpperCase()}`,
    city,
  ]

  for (const title of candidates) {
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`
    try {
      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(8_000),
      })
      if (!res.ok) continue
      const data = (await res.json()) as { title?: string; extract?: string; type?: string }
      if (data.type === 'disambiguation' || !data.extract?.trim()) continue
      const extract = data.extract.trim().replace(/\s+/g, ' ')
      if (extract.length < 40) continue
      return { title: data.title ?? title, extract: extract.slice(0, 900) }
    } catch {
      continue
    }
  }

  try {
    const search = `${city} ${stateName}`
    const opensearchUrl = new URL('https://en.wikipedia.org/w/api.php')
    opensearchUrl.searchParams.set('action', 'opensearch')
    opensearchUrl.searchParams.set('search', search)
    opensearchUrl.searchParams.set('limit', '1')
    opensearchUrl.searchParams.set('namespace', '0')
    opensearchUrl.searchParams.set('format', 'json')

    const res = await fetch(opensearchUrl.toString(), { signal: AbortSignal.timeout(8_000) })
    if (!res.ok) return null
    const [, titles, , extracts] = (await res.json()) as [unknown, string[], unknown, string[]]
    const title = titles?.[0]
    const extract = extracts?.[0]?.trim()
    if (!title || !extract || extract.length < 40) return null
    return { title, extract: extract.replace(/\s+/g, ' ').slice(0, 900) }
  } catch {
    return null
  }
}

/**
 * Build verified area facts for AI prompts. Wikipedia is optional; listing fields always included when present.
 */
export async function resolveAreaContextForListing(
  v: AreaContextListingInput,
  options?: { forceRefresh?: boolean },
): Promise<AreaContextPayload | null> {
  const city = v.city?.trim()
  const state = v.state?.trim()
  if (!city || !state) return null

  const cacheKey = buildCacheKey(city, state, v.zip)
  if (!options?.forceRefresh) {
    const hit = readCached(v.market_data_json, cacheKey)
    if (hit) return hit
  }

  const sources: AreaContextSource[] = []
  const lines: string[] = [...listingFieldLines(v)]
  if (lines.length) sources.push('listing_fields')

  const remarks = v.agent_notes?.trim()
  if (remarks) {
    const plain = stripHtml(remarks).slice(0, 2_500)
    if (plain.length > 20) {
      lines.push(`Listing remarks (MLS/marketing — use only explicit location or area statements): ${plain}`)
      sources.push('listing_remarks')
    }
  }

  let wikipediaTitle: string | undefined
  const wiki = await fetchWikipediaExtract(city, state)
  if (wiki) {
    lines.push(`Wikipedia summary (${wiki.title}): ${wiki.extract}`)
    sources.push('wikipedia')
    wikipediaTitle = wiki.title
  }

  if (lines.length === 0) return null

  const payload: AreaContextPayload = {
    cacheKey,
    city,
    state,
    propertyType: v.property_type ?? null,
    lines,
    sources,
    wikipediaTitle,
    angleHint: propertyTypeAngleHint(v.property_type),
    fetchedAt: new Date().toISOString(),
  }

  return payload
}

/** Merge area context into market_data_json for caching. */
export function mergeAreaContextIntoMarketJson(
  marketJson: unknown,
  area: AreaContextPayload,
): Record<string, unknown> {
  const base =
    marketJson && typeof marketJson === 'object' && !Array.isArray(marketJson)
      ? { ...(marketJson as Record<string, unknown>) }
      : {}
  return { ...base, areaContext: area }
}

/** Prompt block injected before AI generation. */
export function formatAreaContextForPrompt(area: AreaContextPayload | null): string {
  if (!area || area.lines.length === 0) return ''

  const sourceNote = area.sources.includes('wikipedia')
    ? 'Wikipedia lines are reference only — paraphrase; do not add facts beyond what is stated.'
    : 'Use only the facts listed below — do not invent parks, landmarks, employers, or neighborhood character.'

  return `

VERIFIED AREA & LOCATION CONTEXT (${sourceNote}):
${area.angleHint}
${area.lines.map(l => `- ${l}`).join('\n')}

LOCATION COPY RULES:
- Include a "Location & area" or "Location & setting" section when any verified area context exists.
- Write complete sentences for buyers; help them understand the place using ONLY the facts above and property fields.
- Do NOT invent landmarks, parks, lakes, shopping, employers, crime, demographics, or "family-friendly" / "business district" labels unless explicitly supported above.
- If area context is thin, write 1–2 neutral sentences from municipality and county only — do not pad with invented local color.`
}
