import Groq from 'groq-sdk'

export async function generateSocialListingCaption(input: {
  dealerName: string
  listingUrl?: string | null
  vehicleLabel: string
  mileage?: number | null
  price?: number | null
  city?: string | null
  state?: string | null
  vertical?: 'dealer' | 'real_estate'
}): Promise<string | null> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) return null

  const isRe = input.vertical === 'real_estate'
  const loc = [input.city, input.state].filter(Boolean).join(', ')
  const groq = new Groq({ apiKey })
  const listingLine = input.listingUrl?.trim()
    ? `Public listing URL (include verbatim on its own final line):\n${input.listingUrl.trim()}`
    : 'No listing URL provided -- omit links.'

  const prompt = isRe
    ? `Write ONE short real estate social caption for Facebook / Instagram promoting this property listing.

RULES:
- Under 420 characters total (Instagram caption limit safe zone).
- First 2 lines: punchy hook + key property facts. Optional third line if needed.
- One emoji maximum in the caption body (optional).
- Do not invent features, upgrades, or neighborhood details not provided.
- Compliant wording (no guarantees, “as-is” where appropriate, “Questions welcome”).
- Plain text -- no markdown.
- Last line MUST be optional hashtags (0-5), only generic real estate tags like #HomesForSale etc., skip if cramped.

CONTEXT:
Brokerage name: ${input.dealerName}
${loc ? `Location: ${loc}\n` : ''}Property: ${input.vehicleLabel}
List price: ${input.price != null ? `$${Number(input.price).toLocaleString('en-US')}` : 'Price on request'}
${listingLine}`
    : `Write ONE short dealership social caption for Facebook / Instagram promoting this USED vehicle inventory unit.

RULES:
- Under 420 characters total (Instagram caption limit safe zone).
- First 2 lines: punchy hook + key facts. Optional third line if needed.
- One emoji maximum in the caption body (optional).
- Do not invent options, warranties, inspections, financing, or title history -- only mileage/price/year/make/model vibe.
- Compliant wording (no guarantees, “AS-IS” implication ok as “Questions welcome”).
- Plain text -- no markdown.
- Last line MUST be optional hashtags (0-5), only generic auto tags like #UsedCars etc., skip if cramped.

CONTEXT:
Dealer display name: ${input.dealerName}
${loc ? `Location: ${loc}\n` : ''}Vehicle: ${input.vehicleLabel}
Odometer: ${input.mileage != null ? `${input.mileage.toLocaleString('en-US')} mi` : 'not specified'}
Ask / price focus: ${input.price != null ? `$${Number(input.price).toLocaleString('en-US')} asking` : 'Call for pricing'}
${listingLine}`

  try {
    const response = await groq.chat.completions.create({
      model: process.env.GROQ_VEHICLE_MODEL ?? 'llama-3.3-70b-versatile',
      max_tokens: 280,
      temperature: 0.75,
      messages: [{ role: 'user', content: prompt }],
    })
    const text = response.choices[0]?.message?.content?.trim()
    return text && text.length > 0 ? text.slice(0, 2_200) : null
  } catch (e) {
    console.error('[generateSocialListingCaption] Groq error:', e instanceof Error ? e.message : e)
    return null
  }
}
