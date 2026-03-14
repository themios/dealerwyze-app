import 'server-only'

/**
 * Perplexity sonar-pro: single comprehensive query for pricing + reliability + known issues.
 * Returns a raw text response that the pricing engine (Groq) will parse and synthesize.
 */

export interface PerplexityResearch {
  raw: string
  /** Dealer retail range extracted if available */
  dealerRetailLow: number | null
  dealerRetailMid: number | null
  dealerRetailHigh: number | null
  /** Trade-in / fast sale context */
  tradeInLow: number | null
  /** Reliability indicators */
  repairPalScore: number | null        // 1-5
  annualMaintenanceCost: number | null
  topProblems: string[]                // max 5 plain-text issues
  consumerRating: number | null        // 1-5
  expertConsensus: string
}

export async function fetchPerplexityResearch(
  year: number,
  make: string,
  model: string,
  mileage: number,
  zipCode?: string | null,
): Promise<PerplexityResearch | null> {
  const apiKey = process.env.PERPLEXITY_API_KEY
  if (!apiKey) {
    console.warn('[Perplexity] PERPLEXITY_API_KEY not set')
    return null
  }

  const location = zipCode ? `ZIP ${zipCode}` : 'Los Angeles area'

  const prompt = `You are a used-car market analyst. Output ONLY the exact labeled lines below with real numbers for a ${year} ${make} ${model} with ${mileage.toLocaleString()} miles in ${location}. NO tables, NO markdown headers, NO extra text — only these lines:

Dealer Retail Low: $[NUMBER]
Dealer Retail Mid: $[NUMBER]
Dealer Retail High: $[NUMBER]
Trade-In Low: $[NUMBER]
RepairPal Score: [X.X]/5.0
Annual Maintenance Cost: $[NUMBER]
Consumer Owner Rating: [X.X]/5.0

TOP ISSUES AT ${mileage.toLocaleString()} MILES:
1. [Issue name]: $[cost range], [frequency %]
2. [Issue name]: $[cost range], [frequency %]
3. [Issue name]: $[cost range], [frequency %]

EXPERT VERDICT: [2 sentences max on whether this is a good dealer buy at this mileage and price range]

Use current actual dealer listing data from CarGurus, Cars.com, or AutoTrader. If no listings exist, estimate from KBB/Edmunds guide values and label as estimated.`

  try {
    const res = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar-pro',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1200,
      }),
      signal: AbortSignal.timeout(25_000),
    })

    if (!res.ok) {
      console.warn(`[Perplexity] ${res.status} ${res.statusText}`)
      return null
    }

    const data = await res.json()
    const raw: string = data.choices?.[0]?.message?.content ?? ''

    if (!raw) return null

    // Flexible extraction — handles labeled format AND table/narrative formats
    const firstDollarNum = (text: string): number | null => {
      const m = text.match(/\$\s*([\d,]+)/)
      return m ? parseInt(m[1].replace(/,/g, ''), 10) : null
    }
    const lastDollarNum = (text: string): number | null => {
      const matches = [...text.matchAll(/\$\s*([\d,]+)/g)]
      if (!matches.length) return null
      return parseInt(matches[matches.length - 1][1].replace(/,/g, ''), 10)
    }

    // Try exact label first, then broader keyword matches
    const extractPrice = (labels: string[]): number | null => {
      for (const label of labels) {
        const re = new RegExp(`${label}[^\\n]{0,60}\\$[\\s]*(\\d[\\d,]+)`, 'i')
        const m = raw.match(re)
        if (m) return parseInt(m[1].replace(/,/g, ''), 10)
      }
      return null
    }
    const extractFloat = (labels: string[]): number | null => {
      for (const label of labels) {
        const re = new RegExp(`${label}[^\\d]*(\\d+\\.\\d+)`, 'i')
        const m = raw.match(re)
        if (m) return parseFloat(m[1])
      }
      return null
    }

    // Dealer retail: try labeled format, then table format, then narrative range mid-point
    const dealerRetailLow  = extractPrice(['Dealer Retail Low'])
    const dealerRetailHigh = extractPrice(['Dealer Retail High'])
    let   dealerRetailMid  = extractPrice(['Dealer Retail Mid'])

    // Table format fallback: "Dealer retail.*$X,XXX" — use midpoint of range
    if (!dealerRetailMid) {
      const tableMatch = raw.match(/dealer\s+retail[^$\n]{0,60}\$\s*([\d,]+)[^$\n]{0,20}\$\s*([\d,]+)/i)
      if (tableMatch) {
        const lo = parseInt(tableMatch[1].replace(/,/g, ''), 10)
        const hi = parseInt(tableMatch[2].replace(/,/g, ''), 10)
        dealerRetailMid = Math.round((lo + hi) / 2)
      }
    }

    // Trade-in: labeled or table
    let tradeInLow = extractPrice(['Trade-In Low', 'Trade-In'])
    if (!tradeInLow) {
      const m = raw.match(/trade[- ]in[^$\n]{0,40}\$\s*([\d,]+)/i)
      if (m) tradeInLow = parseInt(m[1].replace(/,/g, ''), 10)
    }

    // Extract top problems as plain strings
    const problemMatches = [...raw.matchAll(/^\d+\.\s+(.+)/gm)].slice(0, 5)
    const topProblems = problemMatches.map(m => m[1].trim().slice(0, 120))

    // Expert verdict
    const verdictMatch = raw.match(/EXPERT VERDICT[:\s]+([\s\S]+?)(?=\n\n|$)/i)
    const expertConsensus = verdictMatch ? verdictMatch[1].trim().slice(0, 300) : ''

    return {
      raw,
      dealerRetailLow:         dealerRetailLow  ?? extractPrice(['Dealer retail.*low', 'asking.*low']),
      dealerRetailMid,
      dealerRetailHigh:        dealerRetailHigh ?? extractPrice(['Dealer retail.*high', 'asking.*high']),
      tradeInLow,
      repairPalScore:          extractFloat(['RepairPal Score']),
      annualMaintenanceCost:   extractPrice(['Annual Maintenance Cost', 'annual maintenance']),
      topProblems,
      consumerRating:          extractFloat(['Consumer Owner Rating', 'owner rating']),
      expertConsensus,
    }
  } catch (err) {
    console.warn('[Perplexity] fetch error (non-fatal):', err)
    return null
  }
}
