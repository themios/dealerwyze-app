/**
 * AI prompts for public listing overviews — dealer (vehicles) vs real estate (properties).
 */

export type ListingVertical = 'dealer' | 'real_estate'

export const DEALER_REANALYZE_SELECT =
  'id, year, make, model, trim, color, mileage, price, notes, status, market_data_json, voice_summary, overview_enrichment_text, ai_last_analyzed_at'

export const RE_REANALYZE_SELECT =
  'id, address_line1, city, state, zip, property_type, bedrooms, bathrooms, sqft, lot_size, year_built, mls_number, listing_type, dom, listing_status, hoa_monthly, school_district, subdivision, price, notes, agent_notes, status, market_data_json, voice_summary, overview_enrichment_text, ai_last_analyzed_at'

export const RE_AI_DESCRIPTION_SELECT =
  'id, address_line1, city, state, zip, property_type, bedrooms, bathrooms, sqft, lot_size, year_built, mls_number, listing_type, dom, price, notes, agent_notes, status, market_data_json, voice_summary, school_district, subdivision'

export const DEALER_AI_DESCRIPTION_SELECT =
  'id, year, make, model, trim, color, mileage, price, notes, status, market_data_json, voice_summary'

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  single_family: 'Single Family',
  condo: 'Condo',
  townhouse: 'Townhouse',
  multi_family: 'Multi-Family',
  land: 'Land',
  commercial: 'Commercial',
}

export function propertyTypeLabel(t: string | null | undefined): string {
  if (!t) return 'Property'
  return PROPERTY_TYPE_LABELS[t] ?? t.replace(/_/g, ' ')
}

export interface ReListingFields {
  address_line1?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
  property_type?: string | null
  bedrooms?: number | null
  bathrooms?: number | null
  sqft?: number | null
  lot_size?: string | null
  year_built?: number | null
  mls_number?: string | null
  listing_type?: string | null
  dom?: number | null
  listing_status?: string | null
  hoa_monthly?: number | null
  school_district?: string | null
  subdivision?: string | null
  price?: number | null
  notes?: string | null
}

export function formatPropertyLabel(v: ReListingFields): string {
  const addr = [v.address_line1, v.city, v.state].filter(Boolean).join(', ')
  return addr || 'this property'
}

export function buildPropertyDetailsBlock(v: ReListingFields): string {
  const lines: string[] = []
  lines.push(`- Property: ${formatPropertyLabel(v)}`)
  if (v.property_type) lines.push(`- Type: ${propertyTypeLabel(v.property_type)}`)
  if (v.listing_type) {
    const lt =
      v.listing_type === 'sale'
        ? 'For sale'
        : v.listing_type === 'rental'
          ? 'For rent'
          : v.listing_type
    lines.push(`- Listing: ${lt}`)
  }
  if (v.bedrooms != null) lines.push(`- Bedrooms: ${v.bedrooms}`)
  if (v.bathrooms != null) lines.push(`- Bathrooms: ${v.bathrooms}`)
  if (v.sqft) lines.push(`- Living area: ${v.sqft.toLocaleString()} sq ft`)
  if (v.lot_size) lines.push(`- Lot: ${v.lot_size}`)
  if (v.year_built) lines.push(`- Year built: ${v.year_built}`)
  if (v.mls_number) lines.push(`- MLS #: ${v.mls_number}`)
  if (v.dom != null) lines.push(`- Days on market: ${v.dom}`)
  if (v.listing_status) lines.push(`- MLS status: ${v.listing_status}`)
  if (v.hoa_monthly != null) lines.push(`- HOA: $${v.hoa_monthly.toLocaleString()}/mo`)
  if (v.school_district) lines.push(`- School district: ${v.school_district}`)
  if (v.subdivision) lines.push(`- Subdivision: ${v.subdivision}`)
  if (v.zip) lines.push(`- ZIP: ${v.zip}`)
  lines.push(`- Asking price: ${v.price ? '$' + v.price.toLocaleString() : 'price on request'}`)
  return lines.join('\n')
}

/** Buyer-facing voice for public listing pages — not agent-to-agent briefing copy. */
const RE_BUYER_VOICE_RULES = `AUDIENCE & TONE (critical):
- You write for home buyers and investors reading a public listing page — not for the listing agent.
- Sound like strong MLS marketing copy: warm, confident, and inviting.
- Highlight what IS known (address, price, land/building facts, location cues from data).
- NEVER warn buyers about missing information, gaps in the listing, or need for "further research".
- NEVER use phrases like: unfortunately, not specified, not listed, not provided, lack of, unknown, buyers should be aware, exercise caution, due diligence, ask the seller, contact the seller, inquire about concerns, absence of notes, potential buyers will need to, may require further.
- If a detail is missing, omit it or use neutral positive framing (e.g. land: "Versatile parcel ready for your vision") — do not apologize or dwell on gaps.
- Do not repeat the asking price in every section.
- Internal realtor notes and disclosures may mention issues — use only verified positive facts on the public page; never publish deficiencies, risks, or "call to ask about problems".
- Do not invent beds/baths, upgrades, schools, parks, landmarks, or neighborhood perks not in the source data.
- Location and area sentences must come only from property fields, verified area context, documents, or explicit listing remarks — never from general knowledge about the city.
- Invite readers to schedule a showing with the listing agent — not to "contact the seller directly".
- Real estate only — never mention vehicles, mileage, VIN, dealers, or test drives.`

const RE_SECTION_FORMAT = `STRICT OUTPUT FORMAT (plain text only):
- 3–5 sections, separated by ONE completely blank line between sections.
- Each section starts with ONE title line: optional emoji, then a short punchy title (max 8 words). Examples: "✨ Property highlights", "📍 Location & setting", "📞 Schedule a showing"
- After the title: 2–5 lines. EVERY line must be ONE complete English sentence (clear subject + predicate, starts with a capital letter, ends with . ! or ?).
- NEVER put a phrase or bullet fragment alone on its own line.
- NEVER break one sentence across two lines.
${RE_BUYER_VOICE_RULES}
- No em dashes. No markdown, no "#" headers, no leading "-" bullets.`

const DEALER_SECTION_FORMAT = `STRICT OUTPUT FORMAT (plain text only):
- 3–5 sections, separated by ONE completely blank line between sections.
- Each section starts with ONE title line: optional emoji, then a short punchy title (max 8 words). Example: "✨ Why it stands out"
- After the title: 2–5 lines. EVERY line must be ONE complete English sentence (clear subject + predicate, starts with a capital letter, ends with . ! or ?).
- NEVER put a phrase, clause, or equipment name alone on its own line (wrong: "Bluetooth connectivity" as its own line). Fold list-like features into full sentences.
- NEVER break one sentence across two lines. If you need more detail, write a second sentence on the next line.
- Honest and transparent — if history is unknown, say so. Do not invent accidents or title brands.
- Use document summaries and pasted reference only for facts they actually state.
- Last section: simple call to action (e.g. "📞 Next step") with 1–2 short sentences.
- No em dashes. No markdown, no "#" headers, no leading "-" bullets.`

export function buildReReanalyzePrompt(args: {
  propertyLabel: string
  detailsBlock: string
  areaContextBlock: string
  marketContext: string
  docContext: string
  enrichmentContext: string
}): string {
  return `Write the PUBLIC website overview for a real estate listing: ${args.propertyLabel}. This copy is shown directly to buyers on the brokerage website.

Property facts (use for marketing — do not mention missing fields):
${args.detailsBlock}
${args.areaContextBlock}${args.marketContext}${args.docContext}${args.enrichmentContext}

${RE_SECTION_FORMAT}`
}

export function buildDealerReanalyzePrompt(args: {
  vehicleLabel: string
  mileage: number | null
  color: string | null
  price: number | null
  notes: string | null
  marketContext: string
  problemsContext: string
  docContext: string
  enrichmentContext: string
}): string {
  return `Write the PUBLIC website overview for a ${args.vehicleLabel}. Output will be split into short sections for mobile shoppers who skim — not a long paragraph.

Vehicle details:
- Mileage: ${args.mileage ? args.mileage.toLocaleString() + ' miles' : 'not listed'}
- Color: ${args.color ?? 'not specified'}
- Price: ${args.price ? '$' + args.price.toLocaleString() : 'call for price'}
- Dealer notes: ${args.notes ?? 'none'}
${args.marketContext}${args.problemsContext}${args.docContext}${args.enrichmentContext}

${DEALER_SECTION_FORMAT}`
}

export function buildReReflowPrompt(source: string): string {
  return `You rewrite public listing website copy for a real estate brokerage. Turn the source into buyer-facing marketing sections shoppers will read on the listing page.

RULES (critical):
- Preserve real facts: address, price, property type, beds/baths/sqft, lot size, MLS #, and other concrete details that appear in the source.
- REMOVE or rewrite any sentence meant for the listing agent (warnings about missing data, "ask the seller", "buyers should be aware", "lack of information", "not specified", "unfortunately", due diligence, etc.).
- Replace removed warnings with brief positive/neutral buyer copy drawn only from facts still in the source. Do not invent features.
- Do NOT add new numbers, claims, parks, landmarks, or neighborhood facts that are not in the source.
- Keep any "Location & area" / "Location & setting" section factual — only facts already in the source.
- This is REAL ESTATE — remove vehicle/dealer language (mileage, VIN, test drive, Carfax, "dealer").
${RE_BUYER_VOICE_RULES}
- 3–5 sections, each separated by ONE completely blank line (double newline).
- Each section: Line 1 = short title, optional emoji at the start, max 8 words, no period at end.
- Every following line = exactly ONE complete English sentence.
- Plain text only: no markdown, no # headers, no bullet characters at line starts.
- No em dashes.
- Last section invites scheduling a showing with the listing agent (1–2 short sentences).

SOURCE TEXT TO REWRITE:
---
${source.slice(0, 14_000)}
---`
}

export function buildDealerReflowPrompt(source: string): string {
  return `You fix website copy layout for a used vehicle dealer. Your job is ONLY to reorganize the text below into a skimmable format.

RULES (critical):
- Do NOT add, remove, or change facts, numbers, prices, mileage, trim names, or claims. Same meaning only.
- Do NOT invent history, accidents, or title status.
- 3–5 sections, each separated by ONE completely blank line (double newline).
- Each section: Line 1 = short title, optional emoji at the start, max 8 words, no period at end.
- Every following line in that section = exactly ONE complete English sentence: capital letter start, subject + predicate, ends with . or ! or ?
- NEVER put a phrase, clause, or list item alone on its own line (e.g. do not put "Bluetooth connectivity" on its own unless it is a full sentence like "Bluetooth connectivity is included.").
- NEVER break a sentence across two lines. If a thought needs two sentences, use two lines.
- Combine related ideas into clear sentences rather than many tiny fragments.
- Plain text only: no markdown, no # headers, no bullet characters at line starts.
- No em dashes.
- Last section title should invite action (e.g. "📞 Next step" or "Come see it") with 1–2 short sentences.

SOURCE TEXT TO REWRITE:
---
${source.slice(0, 14_000)}
---`
}

export function buildReMarketplaceBulletsPrompt(args: {
  propertyLabel: string
  detailsBlock: string
  areaContextBlock: string
  pricingContext: string
  docContext: string
}): string {
  return `Write 6–8 bullet points for a property listing on Zillow, Realtor.com, or Facebook Marketplace.

Property details:
${args.detailsBlock}
${args.areaContextBlock}${args.pricingContext}${args.docContext}

RULES:
- Output ONLY bullet lines. Start every line with "• " (bullet + space).
- Each bullet: one short phrase or fact, under 14 words. No full paragraphs.
- Buyer-facing marketing tone — never warn about missing data or tell readers to ask the seller about gaps.
${RE_BUYER_VOICE_RULES}
- Cover in order: property type and beds/baths/sqft if known, price, standout features, one or two location bullets from verified area context only (no invented landmarks), then positive facts from documents (only if explicitly stated), last bullet = schedule a showing.
- No headers, no markdown, no numbered lines, no blank lines between bullets.`
}
