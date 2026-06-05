import 'server-only'

/**
 * RE Listing Pricing and Market Intelligence
 * Stored in listings.market_data_json or property analysis records
 */
export interface REMarketIntelligence {
  // Pricing tiers
  suggestedListPrice:  number | null  // competitive market listing price
  aggressivePrice:     number | null  // faster sale, under market
  premiumPrice:        number | null  // prime position, market premium

  // Confidence
  confidence:          'high' | 'medium' | 'low' | 'insufficient'
  nComps:              number          // # of comps analyzed
  priceRangeLow:       number | null
  priceRangeHigh:      number | null

  // Market context
  medianPricePerSqft:  number | null
  avgDom:              number | null   // avg days on market for similar properties
  totalActive:         number | null   // active listings in area
  pricePerSqft:        number | null   // subject property price/sqft estimate
  sources:             string[]        // data sources used (MLS, Zillow, Redfin, etc.)

  // Property-specific insights
  marketTrend:         'appreciating' | 'stable' | 'declining' | null
  competitionLevel:    'low' | 'moderate' | 'high' | null
  priceReductionOpportunity: boolean   // flag if price reduction could accelerate sale

  // Market report (markdown summary)
  marketAnalysisReport: string

  checkedAt:           string
}

// ─── Groq synthesis ──────────────────────────────────────────────────────────

interface GroqREPricingSynthesis {
  suggestedListPrice:  number | null
  aggressivePrice:     number | null
  premiumPrice:        number | null
  confidence:          'high' | 'medium' | 'low' | 'insufficient'
  nComps:              number
  marketTrend:         'appreciating' | 'stable' | 'declining' | null
  competitionLevel:    'low' | 'moderate' | 'high' | null
  sanityNote:          string
}

export interface REListingPricingInput {
  address:             string
  propertyType:        'single_family' | 'condo' | 'townhouse' | 'multi_family'
  bedrooms:            number | null
  bathrooms:           number | null
  sqft:                number | null
  lotSize:             string | null
  yearBuilt:           number | null
  condition:           'excellent' | 'good' | 'fair' | 'poor' | null
  recentRemodels:      string[]  // e.g., ["roof 2020", "kitchen 2022"]
  mlsComps:            Array<{ address: string; price: number; beds: number; baths: number; sqft: number; soldDate: string }>
  zillowEstimate:      number | null
  redfInEstimate:      number | null
}

async function groqREPricingSynthesis(
  input: REListingPricingInput,
): Promise<GroqREPricingSynthesis | null> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) return null

  const { default: Groq } = await import('groq-sdk')
  const client = new Groq({ apiKey })

  const compsSummary = input.mlsComps.length > 0
    ? `Recent MLS comps:\n${input.mlsComps.map(c =>
        `- ${c.address}: $${c.price.toLocaleString()} (${c.beds}bed/${c.baths}bath, ${c.sqft.toLocaleString()} sqft, sold ${c.soldDate})`
      ).join('\n')}`
    : 'No MLS comps available'

  const propertyDetails = `
Property: ${input.address}
Type: ${input.propertyType}
Beds/Baths: ${input.bedrooms ?? '?'}/${input.bathrooms ?? '?'}
Sqft: ${input.sqft ? input.sqft.toLocaleString() : '?'}
Year Built: ${input.yearBuilt ?? 'unknown'}
Condition: ${input.condition ?? 'unknown'}
${input.recentRemodels.length > 0 ? `Recent Upgrades: ${input.recentRemodels.join(', ')}` : ''}

Market Data:
${compsSummary}
Zillow Estimate: ${input.zillowEstimate ? '$' + input.zillowEstimate.toLocaleString() : 'unavailable'}
Redfin Estimate: ${input.redfInEstimate ? '$' + input.redfInEstimate.toLocaleString() : 'unavailable'}
`

  const systemPrompt = `You are a real estate pricing analyst for brokers and agents.
Given MLS comparable sales, online estimates (Zillow, Redfin), property condition, and market data, calculate competitive listing prices.
OUTPUT: single raw JSON object only. No markdown, no explanation.`

  const userPrompt = `Analyze this property for competitive pricing:

${propertyDetails}

Calculate three pricing tiers based on comparable sales and market conditions:
- suggestedListPrice: Recommended listing price for quick, competitive sale (90-120 days on market)
- aggressivePrice: Below-market price to generate immediate interest and quick sale (30-60 days)
- premiumPrice: Above-market price for premium features, excellent condition, or strong buyer demand (150+ days acceptable)

Pricing guidance:
- suggestedListPrice: Use median of MLS comps adjusted for condition/upgrades. If no comps, use average of Zillow/Redfin.
- aggressivePrice: suggestedListPrice × 0.92 (8% discount for faster sale)
- premiumPrice: suggestedListPrice × 1.08 (8% premium for strong market positioning)
- confidence: "high" if 3+ recent comps, "medium" if 1-2 comps or strong online estimates, "low" if limited data, "insufficient" if no data
- nComps: number of MLS comparables analyzed
- marketTrend: "appreciating" if recent sales trending up, "declining" if trending down, "stable" otherwise
- competitionLevel: "high" if many active listings, "moderate" if average supply, "low" if limited inventory

Return JSON:
{
  "suggestedListPrice": number or null,
  "aggressivePrice": number or null,
  "premiumPrice": number or null,
  "confidence": "high|medium|low|insufficient",
  "nComps": number,
  "marketTrend": "appreciating|stable|declining",
  "competitionLevel": "low|moderate|high",
  "sanityNote": "brief note on methodology or concerns"
}`

  try {
    const response = await client.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 400,
      temperature: 0.2,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    })

    const text = response.choices[0]?.message?.content ?? ''
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start === -1 || end <= start) return null

    return JSON.parse(text.slice(start, end + 1)) as GroqREPricingSynthesis
  } catch (err) {
    console.error('[reListingPricing] Groq synthesis failed:', err)
    return null
  }
}

export async function analyzeREListingPricing(
  input: REListingPricingInput,
): Promise<REMarketIntelligence> {
  const synthesis = await groqREPricingSynthesis(input)

  const avgCompPrice = input.mlsComps.length > 0
    ? input.mlsComps.reduce((sum, c) => sum + c.price, 0) / input.mlsComps.length
    : null

  const basePrice = synthesis?.suggestedListPrice ?? avgCompPrice
  const pricePerSqft = input.sqft && basePrice
    ? Math.round((basePrice / input.sqft) * 100) / 100
    : null

  const medianPricePerSqft = input.mlsComps.length > 0
    ? Math.round(
        (input.mlsComps.reduce((sum, c) => sum + (c.price / c.sqft), 0) / input.mlsComps.length) * 100
      ) / 100
    : null

  const priceReductionNeeded = input.mlsComps.length > 0 && avgCompPrice && (input.zillowEstimate || input.redfInEstimate)
    ? (input.zillowEstimate ?? input.redfInEstimate)! > avgCompPrice * 1.15
    : false

  return {
    suggestedListPrice: synthesis?.suggestedListPrice ?? null,
    aggressivePrice: synthesis?.aggressivePrice ?? null,
    premiumPrice: synthesis?.premiumPrice ?? null,
    confidence: synthesis?.confidence ?? 'insufficient',
    nComps: synthesis?.nComps ?? input.mlsComps.length,
    priceRangeLow: synthesis
      ? Math.round((synthesis.suggestedListPrice ?? 0) * 0.95)
      : null,
    priceRangeHigh: synthesis
      ? Math.round((synthesis.suggestedListPrice ?? 0) * 1.05)
      : null,
    medianPricePerSqft,
    avgDom: input.mlsComps.length > 0
      ? Math.round(input.mlsComps.length * 30) // Rough estimate based on comps
      : null,
    totalActive: null, // Would require MLS API for actual count
    pricePerSqft,
    sources: ['mls_comps', 'zillow', 'redfin'],
    marketTrend: synthesis?.marketTrend ?? null,
    competitionLevel: synthesis?.competitionLevel ?? null,
    priceReductionOpportunity: priceReductionNeeded,
    marketAnalysisReport: buildREMarketReport(input, synthesis),
    checkedAt: new Date().toISOString(),
  }
}

function buildREMarketReport(
  input: REListingPricingInput,
  synthesis: GroqREPricingSynthesis | null,
): string {
  if (!synthesis) {
    return `# Market Analysis: ${input.address}\n\nInsufficient data for pricing analysis. Consider obtaining MLS comparables.`
  }

  const lines: string[] = [
    `# Market Analysis: ${input.address}`,
    '',
    `## Recommended Pricing`,
    `- **Suggested List Price:** $${synthesis.suggestedListPrice?.toLocaleString()}`,
    `- **Aggressive Price (Quick Sale):** $${synthesis.aggressivePrice?.toLocaleString()}`,
    `- **Premium Price (Strong Positioning):** $${synthesis.premiumPrice?.toLocaleString()}`,
    '',
    `## Market Position`,
    `- **Confidence Level:** ${synthesis.confidence}`,
    `- **Comparable Sales:** ${synthesis.nComps} recent MLS transactions analyzed`,
    `- **Market Trend:** ${synthesis.marketTrend ? synthesis.marketTrend.charAt(0).toUpperCase() + synthesis.marketTrend.slice(1) : 'Unknown'}`,
    `- **Competition:** ${synthesis.competitionLevel ? synthesis.competitionLevel.charAt(0).toUpperCase() + synthesis.competitionLevel.slice(1) : 'Unknown'} inventory in area`,
    '',
    `## Key Insights`,
    `${synthesis.sanityNote || 'Pricing analysis complete.'}`,
  ]

  return lines.join('\n')
}
