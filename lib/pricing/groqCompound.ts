import 'server-only'

const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions'
const GROQ_COMPOUND_MODEL = 'compound-beta-mini'

export interface CompoundMarketIntel {
  report: string
}

/** Convert HTML fragments the model sometimes emits into plain markdown. */
function htmlToMarkdown(text: string): string {
  return text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<strong>([\s\S]*?)<\/strong>/gi, '**$1**')
    .replace(/<b>([\s\S]*?)<\/b>/gi, '**$1**')
    .replace(/<em>([\s\S]*?)<\/em>/gi, '*$1*')
    .replace(/<i>([\s\S]*?)<\/i>/gi, '*$1*')
    .replace(/<[^>]+>/g, '') // strip any remaining HTML tags
}

/**
 * Calls Groq's Compound model (built-in live web search) to generate a
 * dealer-grade 6-section market intelligence report for a vehicle.
 */
export async function fetchCompoundMarketIntel(
  year: number,
  make: string,
  model: string,
  trim: string | null | undefined,
  mileage: number,
  zipCode: string | null,
): Promise<CompoundMarketIntel | null> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) return null

  const locationMarket = zipCode ? `ZIP ${zipCode} area` : 'Nationwide (US)'

  const prompt = `You are an automotive market intelligence analyst working for a vehicle pricing platform. Your task is to produce a structured, dealer-grade market intelligence report for the following vehicle.

Vehicle Input:
- Year: ${year}
- Make: ${make}
- Model: ${model}
- Trim: ${trim || 'Not specified'}
- Mileage: ${mileage > 0 ? mileage.toLocaleString() + ' miles' : 'Not specified'}
- Location/Market: ${locationMarket}

Analyze this vehicle from a real-world buying and selling perspective, not a brochure/spec perspective.
Deliver a structured report with the following sections. Use clear headings (## or ###) and bullet points.

## Market Position Summary
- What segment this vehicle competes in
- Who typically buys it
- How demand currently behaves in this market
- Whether it is considered high, medium, or slow-turn inventory
- Any seasonal or regional demand factors

## Current Market Pricing Intelligence
- Estimated trade-in value range (label as estimate)
- Estimated private-party value range (label as estimate)
- Estimated dealer retail asking price range (label as estimate)
- Why pricing sits in that range, mileage impact, trim desirability impact, regional pricing effects

## Competitive Landscape
- 3 to 5 direct competitors buyers cross-shop against this vehicle
- How this vehicle compares on reliability, perceived value, and ownership cost
- Why a buyer might choose this vehicle over competitors

## Ownership & Risk Factors
- Known reliability patterns, common repair concerns, ownership cost expectations, insurance and maintenance considerations
- Label clearly: high confidence facts, typical industry patterns, risk assumptions

## Buyer Psychology & Sales Angle
- What motivates buyers looking at this vehicle; emotional vs practical drivers; objections a buyer may raise; messaging angles a dealer could use

## Dealer Strategy Insight
- Ideal listing price positioning strategy, negotiation room expectations, recommended reconditioning priorities, inventory turn expectations

Rules: Separate facts vs estimates vs assumptions. Avoid marketing fluff. Write for a dealership decision-maker. Be concise but analytical. Use web search to support your analysis with current market data where possible.`

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 70_000)

    const res = await fetch(GROQ_CHAT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: GROQ_COMPOUND_MODEL,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 2800,
        search_settings: { country: 'united states' },
      }),
      signal: controller.signal,
    })

    clearTimeout(timeout)

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      console.error('[GroqCompound] API error:', res.status, errText.slice(0, 500))
      return null
    }

    const data = await res.json()
    const content: string = data.choices?.[0]?.message?.content?.trim() ?? ''
    console.log('[GroqCompound] response length:', content.length, '| model:', GROQ_COMPOUND_MODEL)

    if (content.length < 100) {
      console.warn('[GroqCompound] content too short:', content.slice(0, 200))
      return null
    }

    return { report: htmlToMarkdown(content) }
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      console.warn('[GroqCompound] Timed out after 55s')
    } else {
      console.warn('[GroqCompound] error:', err?.message)
    }
    return null
  }
}
