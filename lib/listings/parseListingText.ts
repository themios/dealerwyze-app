/**
 * parseListingText — Claude Haiku text extraction for pasted listing descriptions.
 *
 * Primary import path for Realtor.com listings (URL scraping unavailable) and
 * a fallback for any other source. Adapts the vehicle pasteExtract pattern with
 * an RE-specific prompt.
 *
 * Input validation:
 * - Max 10,000 characters (truncated silently if over)
 * - Min 50 characters — returns null if under (not enough to extract from)
 *
 * Model: claude-haiku-4-5 (cost-efficient; same model as vehicle parse-text)
 */

import { aiClient, AI_MODEL } from '@/lib/ai/client'

const MAX_TEXT_LENGTH = 10_000
const MIN_TEXT_LENGTH = 50

const RE_TEXT_PROMPT_TEMPLATE = `Extract real estate listing information from the following listing description text.
Return ONLY valid JSON with these exact keys (use null if not found):
{
  "address_line1": "string|null",
  "city": "string|null",
  "state": "string|null",
  "zip": "string|null",
  "price": "number|null",
  "bedrooms": "number|null",
  "bathrooms": "number|null",
  "sqft": "number|null",
  "lot_size": "number|null",
  "year_built": "number|null",
  "property_type": "string|null",
  "hoa_monthly": "number|null",
  "mls_number": "string|null",
  "listing_agent": "string|null",
  "listing_url": "string|null",
  "agent_notes": "string|null"
}

For "agent_notes": Format all descriptive content from the listing (property description, highlights, features, disclosures, showing instructions, neighborhood info, etc.) as clean HTML. Use <p> tags for paragraphs, <ul><li> for feature lists, and <strong> for section labels. Do not include structured fields already captured above (price, beds, baths, sqft, address). If no descriptive content is present, use null.

Do not include any text outside the JSON object.

Listing text:
{text}`

/**
 * Extract RE listing fields from pasted listing description text using Gemini Flash Lite.
 *
 * @param text - Raw listing description text (Realtor.com, MLS copy, or any source)
 * @returns Extracted RE fields with import_source set, or null if extraction fails
 */
export async function parseListingText(
  text: string,
): Promise<Record<string, unknown> | null> {
  if (text.length < MIN_TEXT_LENGTH) return null

  // Silently truncate if over max length
  const safeText = text.length > MAX_TEXT_LENGTH ? text.slice(0, MAX_TEXT_LENGTH) : text

  const prompt = RE_TEXT_PROMPT_TEMPLATE.replace('{text}', safeText)

  const response = await aiClient.chat.completions.create({
    model: AI_MODEL,
    max_tokens: 700,
    messages: [{ role: 'user', content: prompt }],
  })

  const responseText = response.choices[0]?.message?.content ?? ''

  // Extract JSON from model response (handles any leading/trailing prose)
  const start = responseText.indexOf('{')
  const end = responseText.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null

  let extracted: Record<string, unknown>
  try {
    extracted = JSON.parse(responseText.slice(start, end + 1)) as Record<string, unknown>
  } catch {
    return null
  }

  return {
    ...extracted,
    import_source: 'text_paste',
  }
}
