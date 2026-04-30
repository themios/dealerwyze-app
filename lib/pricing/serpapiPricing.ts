import 'server-only'

export interface SerpapiPricing {
  tradeInLow:       number | null
  tradeInHigh:      number | null
  privatePartyLow:  number | null
  privatePartyHigh: number | null
  dealerRetailLow:  number | null
  dealerRetailHigh: number | null
}

interface SerpapiResponse {
  organic_results?: Array<{
    snippet?: string
  }>
}

/**
 * Fetches KBB/Edmunds pricing snippets from Google via SerpAPI.
 * Used as a fallback when MarketCheck returns 0 active comps.
 */
export async function fetchSerpapiPricing(
  year: number,
  make: string,
  model: string,
  trim: string | null | undefined,
  mileage: number,
  zipCode: string | null = null,
): Promise<SerpapiPricing | null> {
  const apiKey = process.env.SERPAPI_API_KEY
  if (!apiKey) return null

  const location = zipCode ? `near ${zipCode}` : ''
  const q = `${year} ${make} ${model}${trim ? ' ' + trim : ''} price KBB trade-in dealer retail${mileage > 0 ? ' ' + mileage.toLocaleString() + ' miles' : ''}${location ? ' ' + location : ''}`

  try {
    const url = new URL('https://serpapi.com/search')
    url.searchParams.set('engine', 'google')
    url.searchParams.set('q', q)
    url.searchParams.set('api_key', apiKey)
    url.searchParams.set('num', '5')

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10_000) })
    if (!res.ok) {
      console.warn('[SerpAPI] error:', res.status)
      return null
    }

    const data = await res.json() as SerpapiResponse
    const snippets: string[] = (data.organic_results ?? [])
      .slice(0, 6)
      .map((r: { snippet?: string }) => r.snippet ?? '')
      .filter(Boolean)

    const combined = snippets.join(' ')

    return {
      tradeInLow:       extractLow(combined, 'trade.?in'),
      tradeInHigh:      extractHigh(combined, 'trade.?in'),
      privatePartyLow:  extractLow(combined, 'private.?party'),
      privatePartyHigh: extractHigh(combined, 'private.?party'),
      dealerRetailLow:  extractLow(combined, 'dealer.?retail|dealership'),
      dealerRetailHigh: extractHigh(combined, 'dealer.?retail|dealership'),
    }
  } catch (err) {
    console.warn('[SerpAPI] fetch error:', err instanceof Error ? err.message : err)
    return null
  }
}

/**
 * Parse pricing ranges from free-form text (e.g. Groq Compound report).
 * Same regex logic as fetchSerpapiPricing — reused so Compound report
 * can fill in pricing tiles when SerpAPI is unavailable.
 */
export function parsePricingFromText(text: string): SerpapiPricing | null {
  const result: SerpapiPricing = {
    tradeInLow:       extractLow(text,  'trade.?in'),
    tradeInHigh:      extractHigh(text, 'trade.?in'),
    privatePartyLow:  extractLow(text,  'private.?party'),
    privatePartyHigh: extractHigh(text, 'private.?party'),
    dealerRetailLow:  extractLow(text,  'dealer.?retail|retail\\s+asking|dealership'),
    dealerRetailHigh: extractHigh(text, 'dealer.?retail|retail\\s+asking|dealership'),
  }
  const hasAny = Object.values(result).some(v => v !== null)
  return hasAny ? result : null
}

/** Extract the lower dollar value from a price range near a keyword */
function extractLow(text: string, keyword: string): number | null {
  const re = new RegExp(
    `(?:${keyword})[^$]{0,80}\\$([\\d,]+)(?:\\s*(?:to|–|-)\\s*\\$[\\d,]+)?`,
    'i'
  )
  const m = text.match(re)
  if (!m) return null
  const v = parseInt(m[1].replace(/,/g, ''))
  return v > 500 && v < 200_000 ? v : null
}

/** Extract the upper dollar value from a price range near a keyword */
function extractHigh(text: string, keyword: string): number | null {
  const re = new RegExp(
    `(?:${keyword})[^$]{0,80}\\$[\\d,]+\\s*(?:to|–|-)\\s*\\$([\\d,]+)`,
    'i'
  )
  const m = text.match(re)
  if (!m) return null
  const v = parseInt(m[1].replace(/,/g, ''))
  return v > 500 && v < 200_000 ? v : null
}
