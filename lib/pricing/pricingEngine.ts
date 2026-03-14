import 'server-only'
import { MarketCheckStats } from './marketCheck'
import { NhtsaResult } from './nhtsa'
import { CompoundMarketIntel } from './groqCompound'
import { SerpapiPricing } from './serpapiPricing'

/**
 * Pricing tiers + market intelligence.
 * Stored in vehicles.market_data_json.
 */
export interface MarketIntelligence {
  // Pricing tiers
  fastSalePrice:   number | null  // sell within ~60d — below market
  fairMarketPrice: number | null  // 90d typical market value
  maxReturnPrice:  number | null  // 120d+ premium listing

  // Confidence
  confidence:      'high' | 'medium' | 'low' | 'insufficient'
  nComps:          number          // # of comps used
  fmvRangeLow:     number | null
  fmvRangeHigh:    number | null

  // Market context
  medianMiles:     number | null
  avgDom:          number | null   // avg days on market
  totalActive:     number | null   // national active listings
  sources:         string[]        // data sources used

  // Legacy reliability fields (kept for cached data compatibility)
  topProblems:     string[]
  expertConsensus: string
  repairPalScore:  number | null
  annualMaintCost: number | null
  consumerRating:  number | null

  // Full Groq Compound market intelligence report (markdown)
  marketIntelReport: string

  checkedAt:       string
}

// ─── Groq synthesis ──────────────────────────────────────────────────────────

interface GroqSynthesis {
  fairMarketPrice: number | null
  fastSalePrice:   number | null
  maxReturnPrice:  number | null
  confidence:      'high' | 'medium' | 'low' | 'insufficient'
  nComps:          number
  sanityNote:      string
}

async function groqSynthesis(
  year: number,
  make: string,
  model: string,
  mileage: number,
  mc: MarketCheckStats | null,
  serp: SerpapiPricing | null,
): Promise<GroqSynthesis | null> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) return null

  const { default: Groq } = await import('groq-sdk')
  const client = new Groq({ apiKey })

  const mcSummary = mc ? JSON.stringify({
    medianPrice: mc.medianPrice,
    p25Price: mc.p25Price,
    p90Price: mc.p90Price,
    meanPrice: mc.meanPrice,
    sampleSize: mc.sampleSize,
    medianMiles: mc.medianMiles,
    avgDom: mc.avgDom,
  }) : 'null'

  const serpSummary = serp ? JSON.stringify({
    tradeInLow:       serp.tradeInLow,
    tradeInHigh:      serp.tradeInHigh,
    privatePartyLow:  serp.privatePartyLow,
    privatePartyHigh: serp.privatePartyHigh,
    dealerRetailLow:  serp.dealerRetailLow,
    dealerRetailHigh: serp.dealerRetailHigh,
  }) : 'null'

  const systemPrompt = `You are a vehicle pricing expert for independent used-car dealers.
Given MarketCheck active listing statistics and KBB/Edmunds pricing data from web search, calculate accurate pricing tiers.
OUTPUT: single raw JSON object only. No markdown, no explanation.`

  const userPrompt = `Vehicle: ${year} ${make} ${model}, ${mileage.toLocaleString()} miles

MarketCheck stats (active clean-title listings, mileage-banded): ${mcSummary}
KBB/Edmunds web pricing (trade-in, private-party, dealer-retail ranges): ${serpSummary}

Calculate three pricing tiers. Rules:
- fairMarketPrice: Use MC medianPrice if sampleSize >= 5. Otherwise use midpoint of KBB dealer retail range. Otherwise use KBB private party high. Otherwise null.
- fastSalePrice: Use MC p25Price × 0.92 if available. Otherwise use KBB trade-in high × 1.05. Otherwise fairMarketPrice × 0.82. Otherwise null.
- maxReturnPrice: Use fairMarketPrice × 1.12; floor at MC p90Price or KBB dealer retail high if higher.
- confidence: "high" if MC sampleSize >= 10, "medium" if 5-9 or KBB dealer range available, "low" if 1-4 MC comps or KBB private party only, "insufficient" if all sources null.
- nComps: MC sampleSize or 0.
- sanityNote: one sentence on data quality and primary source used.

Respond with JSON:
{"fairMarketPrice": number|null, "fastSalePrice": number|null, "maxReturnPrice": number|null, "confidence": "high"|"medium"|"low"|"insufficient", "nComps": number, "sanityNote": "string"}`

  try {
    const completion = await client.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 200,
      temperature: 0.1,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    })

    const text = completion.choices[0]?.message?.content ?? ''
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start === -1 || end === -1) return null

    return JSON.parse(text.slice(start, end + 1)) as GroqSynthesis
  } catch (err) {
    console.warn('[PricingEngine] Groq synthesis error:', err)
    return null
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function buildMarketIntelligence(
  year: number,
  make: string,
  model: string,
  mileage: number,
  mc: MarketCheckStats | null,
  nhtsa: NhtsaResult,
  compound: CompoundMarketIntel | null,
  serp: SerpapiPricing | null,
): Promise<MarketIntelligence> {
  const groq = await groqSynthesis(year, make, model, mileage, mc, serp)

  // Fallback: compute tiers directly if Groq fails
  let fastSale:   number | null = groq?.fastSalePrice   ?? null
  let fairMarket: number | null = groq?.fairMarketPrice ?? null
  let maxReturn:  number | null = groq?.maxReturnPrice  ?? null
  let confidence  = groq?.confidence ?? 'insufficient'
  const nComps    = groq?.nComps ?? mc?.sampleSize ?? 0

  // If Groq didn't fire, compute directly from available data
  if (!groq) {
    if (mc && mc.sampleSize >= 1) {
      fairMarket = mc.medianPrice
      fastSale   = mc.p25Price > 0 ? Math.round(mc.p25Price * 0.92) : Math.round(mc.medianPrice * 0.82)
      maxReturn  = Math.round(mc.medianPrice * 1.12)
      confidence = mc.sampleSize >= 10 ? 'high' : mc.sampleSize >= 5 ? 'medium' : 'low'
    } else if (serp?.dealerRetailLow && serp?.dealerRetailHigh) {
      fairMarket = Math.round((serp.dealerRetailLow + serp.dealerRetailHigh) / 2)
      fastSale   = serp.tradeInHigh ? Math.round(serp.tradeInHigh * 1.05) : Math.round(fairMarket * 0.82)
      maxReturn  = serp.dealerRetailHigh ?? Math.round(fairMarket * 1.12)
      confidence = 'low'
    } else if (serp?.privatePartyHigh) {
      // Estimate dealer retail as private party + typical 18% markup
      fairMarket = Math.round(serp.privatePartyHigh * 1.18)
      fastSale   = serp.tradeInHigh ? Math.round(serp.tradeInHigh * 1.05) : Math.round(serp.privatePartyHigh * 0.95)
      maxReturn  = Math.round(serp.privatePartyHigh * 1.35)
      confidence = 'low'
    }
  }

  // Sanity check: prices must be ordered fastSale <= fairMarket <= maxReturn
  // Groq occasionally swaps labels — sort and reassign
  if (fastSale && fairMarket && maxReturn) {
    const sorted = [fastSale, fairMarket, maxReturn].sort((a, b) => a - b)
    fastSale   = sorted[0]
    fairMarket = sorted[1]
    maxReturn  = sorted[2]
  }

  // Range margins by confidence
  const margin = confidence === 'high' ? 0.08 : confidence === 'medium' ? 0.15 : confidence === 'low' ? 0.22 : 0.30
  const fmvRangeLow  = fairMarket ? Math.round(fairMarket * (1 - margin)) : null
  const fmvRangeHigh = fairMarket ? Math.round(fairMarket * (1 + margin)) : null

  const sources: string[] = []
  if (mc && mc.sampleSize > 0) sources.push(`MarketCheck (${mc.sampleSize} comps)`)
  if (serp && (serp.dealerRetailLow || serp.tradeInLow)) sources.push('KBB')
  if (compound) sources.push('Groq Compound')
  sources.push('NHTSA')

  return {
    fastSalePrice:   fastSale,
    fairMarketPrice: fairMarket,
    maxReturnPrice:  maxReturn,
    confidence,
    nComps,
    fmvRangeLow,
    fmvRangeHigh,
    medianMiles:     mc?.medianMiles ?? null,
    avgDom:          mc?.avgDom ?? null,
    totalActive:     mc?.totalActive ?? null,
    sources,
    topProblems:     [],
    expertConsensus: '',
    repairPalScore:  null,
    annualMaintCost: null,
    consumerRating:  null,
    marketIntelReport: compound?.report ?? '',
    checkedAt:       new Date().toISOString(),
  }
}

/**
 * Compute consumer-facing deal rating relative to fair market price.
 * Used on public VDPs.
 */
export function computeDealRating(
  listPrice: number,
  fairMarketPrice: number,
): { label: 'Great Deal' | 'Good Deal' | 'Fair Price' | 'High Price'; color: 'green' | 'blue' | 'yellow' | 'red' } {
  const ratio = listPrice / fairMarketPrice
  if (ratio <= 0.90) return { label: 'Great Deal', color: 'green' }
  if (ratio <= 0.97) return { label: 'Good Deal',  color: 'blue' }
  if (ratio <= 1.06) return { label: 'Fair Price',  color: 'yellow' }
  return { label: 'High Price', color: 'red' }
}
