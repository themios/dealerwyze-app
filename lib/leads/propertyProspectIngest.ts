import 'server-only'
import { aiComplete, AI_MODEL, imageBlock } from '@/lib/ai/client'
import type { ProspectExtractionResult } from '@/components/prospects/types'
export { scanResultToParsedLead } from './scanResultToParsedLead'

export type { Confidence, ScanField, LeadScanResult } from './visionIngestTypes'

// ── Prompts ───────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a property prospect data extraction engine for a real estate brokerage CRM.
CRITICAL: Output ONLY a raw JSON array. No markdown, no code fences, no explanation.`

// Shared extraction rules for RE prospects
const SHARED_RULES = `
PROSPECT vs AGENT — CRITICAL:
- The PROSPECT is the person interested in buying/selling/renting a property. Extract ONLY their info.
- The AGENT is the business professional receiving the lead. NEVER extract agent/brokerage info as the prospect.
- AGENT EMAIL: Any email in the "To:", "Reply-To:", or that belongs to the brokerage is NOT the prospect's. Return null if no prospect email exists.
- AGENT ADDRESS: The brokerage's city/state/zip is NOT the prospect's location. Return null if only the agent address is visible.
- AGENT PHONE: Any number labeled "Agent phone", "Office number", or clearly the brokerage's line is NOT the prospect's.

NON-LEAD EMAILS — return null for ALL contact fields (including email) if the input is:
- Digest emails (subject contains "Daily Digest", "Weekly Summary", "Lead Reminder")
- Aggregate stats emails from the MLS or listing services
- Any email where the prominent name/account shown is the BROKERAGE with no individual prospect
- A platform admin or marketing email to the agent with no specific prospect name/phone/email
- If you cannot identify a prospect's name distinct from the brokerage name, return all null

MULTI-PROSPECT DOCUMENTS (summary emails, batch PDFs, multi-lead forms):
- Extract ALL individual prospects present — one array entry per person
- If no individual prospect contact info is extractable, return an empty array []

PORTAL / WEBSITE SUBMISSIONS:
- The PROSPECT is the person who filled out the form or inquiry
- The agent account name and email shown as portal owner is NOT the prospect
- If only a first name is visible for the prospect, use it; leave last_name null and email null

EMAIL REPLY CHAINS (Re: subject lines):
- In a "Re:" email chain, look at the ORIGINAL message at the bottom for prospect contact info
- The reply-from address (agent responding) is NOT the prospect's email
- If the reply is from the agent and no prospect email appears in the original message, return email as null

RELAY / SYSTEM EMAILS — treat as null:
- Portal relay addresses: info@zillow.com, noreply@realtor.com, leads@mls.com, etc.
- Any email address that is clearly auto-generated or a system relay

PLACEHOLDER VALUES — treat as null:
- "N/A", "Prospect did not specify", "Not provided", "Not specified", "Unknown", "—", "None", "n/a" → return null for that field

FIELD LABELS — strip them completely (CRITICAL):
- The label is NOT part of the value. Wrong: first_name="First Name: Alex". Right: first_name="Alex".
- "First Name: John" → first_name "John" (NOT "First Name: John")
- "Last Name: De Asis" → last_name "De Asis"
- "Email: prospect@gmail.com" → email "prospect@gmail.com" only
- "Phone: (714) 555-1234" → "7145551234"

NAME:
- When both "First Name" and "Last Name" lines exist, put given name in first_name and family name in last_name
- "First Name: Alex" + "Last Name: De Asis" → first_name "Alex", last_name "De Asis"
- Split full names on one line into first_name / last_name; one word only → first_name, last_name null
- Normalize ALL CAPS to Title Case: "ALEX SOLIS" → "Alex" / "Solis"; "gloria ruiz" → "Gloria" / "Ruiz"
- Strip titles: Mr., Mrs., Dr., etc.
- NEVER return the words "First", "Name", "Last", or "Email" as field values

PHONE:
- 10 digits only, no formatting, no country code. "(323) 548-8594" → "3235488594"
- Phone leads: the prominent callback number IS the prospect's phone

EMAIL:
- Return exactly ONE email string — never duplicate the same address
- If two different addresses appear, return the complete prospect address (longer local part)
- Extract ONLY a prospect email explicitly associated with them in the lead body
- Do NOT extract emails from: email headers (From:, To:, CC:, Reply-To:), signatures, or agent/brokerage addresses
- If the prospect's first name is null, email must also be null
- Null if: only header/footer email visible, relay address, noreply, system address, or agent address

CITY / STATE / ZIP:
- Prospect's location/where they want to buy/sell/rent
- Do NOT use the agent's or brokerage's address

PROPERTY:
- The property the prospect is interested in (buying, selling, or renting)
- Can be address if known, or property type (condo, single family, etc.)

PROPERTY TYPE:
- "single_family" | "condo" | "townhouse" | "multi_family" | "land" | "commercial" | null

BUDGET / PRICE RANGE:
- Integer only (500000 from "$500,000" or "500k")
- Listed property price is valid if prospect is inquiring about it
- Do NOT use agent's estimate without explicit prospect statement

PROSPECT INTENT:
- "buy" | "sell" | "rent" | "refinance" | "other" | null

LEAD SOURCE — use these exact values:
- "Zillow" | "Realtor.com" | "Homes.com" | "Redfin" | "Trulia" | "Facebook" | "Instagram" | "open_house" | "email" | "phone" | "referral" | "mls" | "other"

URGENCY:
- "high" if prospect says "ASAP", "this week", "urgent", "need to move quickly", or it's a direct phone call
- "low" if browsing or no timeline
- "normal" otherwise

OVERALL CONFIDENCE:
- "high" = name + (phone or personal email)
- "medium" = partial contact info
- "low" = guessing or not a real prospect lead`

const PROSPECT_SHAPE = `{
  "first_name":      { "value": "string or null", "confidence": "high|medium|low" },
  "last_name":       { "value": "string or null", "confidence": "high|medium|low" },
  "phone":           { "value": "10-digit string or null", "confidence": "high|medium|low" },
  "phone2":          { "value": "10-digit string or null", "confidence": "high|medium|low" },
  "email":           { "value": "string or null", "confidence": "high|medium|low" },
  "city":            { "value": "string or null", "confidence": "high|medium|low" },
  "state":           { "value": "string or null", "confidence": "high|medium|low" },
  "zip":             { "value": "string or null", "confidence": "high|medium|low" },
  "property_type":   { "value": "single_family|condo|townhouse|multi_family|land|commercial or null", "confidence": "high|medium|low" },
  "property_address":{ "value": "string or null", "confidence": "high|medium|low" },
  "property_city":   { "value": "string or null", "confidence": "high|medium|low" },
  "budget":          { "value": number or null,   "confidence": "high|medium|low" },
  "prospect_intent": { "value": "buy|sell|rent|refinance|other or null", "confidence": "high|medium|low" },
  "lead_source":     { "value": "string or null", "confidence": "high|medium|low" },
  "notes":           { "value": "string or null", "confidence": "high|medium|low" },
  "urgency":         { "value": "high|normal|low or null", "confidence": "high|medium|low" },
  "overall_confidence": "high|medium|low"
}`

// Always return an array — one object per prospect found
const JSON_SHAPE = `[${PROSPECT_SHAPE}]`

const USER_PROMPT = `Extract property prospect information from this image or screenshot.
Return ONLY this JSON (no extra text):
${JSON_SHAPE}
${SHARED_RULES}`

const TEXT_PROSPECT_PROMPT = `Extract property prospect information from this text input.

INPUT TYPES (handle all):
- Prospect inquiry forms: Zillow, Realtor.com, Homes.com, agent websites
- Email forwards from listing platforms
- Text/iMessage/WhatsApp conversations about property
- Verbal referrals: "my friend Maria wants a 3-bed house in Pasadena, 714-555-0000"
- Handwritten notes: "Jose Reyes wants to sell condo, 626 555 0000"
- English, Spanish, or mixed language

Return ONLY this JSON — no markdown, no code fences, no commentary:
${JSON_SHAPE}
${SHARED_RULES}`

// ── JSON extractor ────────────────────────────────────────────────────────────

function parseResponse(text: string): ProspectExtractionResult[] {
  // Try array first
  const arrStart = text.indexOf('[')
  const arrEnd   = text.lastIndexOf(']')
  if (arrStart !== -1 && arrEnd > arrStart) {
    try {
      const parsed = JSON.parse(text.slice(arrStart, arrEnd + 1))
      if (Array.isArray(parsed)) return parsed as ProspectExtractionResult[]
    } catch { /* fall through */ }
  }
  // Fallback: single object
  const start = text.indexOf('{')
  const end   = text.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`No JSON in AI response: ${text.slice(0, 200)}`)
  }
  return [JSON.parse(text.slice(start, end + 1)) as ProspectExtractionResult]
}

// ── Pasted text scan ──────────────────────────────────────────────────────────

export async function scanProspectText(pastedText: string): Promise<ProspectExtractionResult[]> {
  const response = await aiComplete({
    model:      AI_MODEL,
    max_tokens: 800,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `${TEXT_PROSPECT_PROMPT}\n\n---\nINPUT TEXT:\n${pastedText.slice(0, 8000)}` },
    ],
  })

  const text = response.choices[0]?.message?.content ?? ''
  return parseResponse(text)
}

// ── Image scan ────────────────────────────────────────────────────────────────

export async function scanProspectImage(
  imageBase64: string,
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
): Promise<ProspectExtractionResult[]> {
  const response = await aiComplete({
    model: AI_MODEL,
    max_tokens: 600,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          imageBlock(mimeType, imageBase64),
          { type: 'text', text: USER_PROMPT },
        ],
      },
    ],
  })

  const text = response.choices[0]?.message?.content ?? ''
  return parseResponse(text)
}

// ── PDF scan — OpenRouter Gemini supports native multi-page PDFs ──

export async function scanProspectPdf(pdfBase64: string): Promise<ProspectExtractionResult[]> {
  const response = await aiComplete({
    model: AI_MODEL,
    max_tokens: 600,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: USER_PROMPT },
          imageBlock('application/pdf', pdfBase64),
        ],
      },
    ],
  })

  const text = response.choices[0]?.message?.content ?? ''
  return parseResponse(text)
}
