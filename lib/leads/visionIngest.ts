import 'server-only'
import { aiComplete, AI_MODEL, imageBlock } from '@/lib/ai/client'
import type { LeadScanResult } from './visionIngestTypes'
export { scanResultToParsedLead } from './scanResultToParsedLead'

export type { Confidence, ScanField, LeadScanResult } from './visionIngestTypes'

// ── Prompts ───────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a lead data extraction engine for a used-car dealership CRM.
CRITICAL: Output ONLY a single raw JSON object. No markdown, no code fences, no explanation.`

// Shared extraction rules used in both image and text prompts
const SHARED_RULES = `
BUYER vs DEALER — CRITICAL:
- The BUYER is the person interested in purchasing a vehicle. Extract ONLY their info.
- The DEALER is the business receiving the lead. NEVER extract dealer/dealership info as the buyer.
- DEALER EMAIL: Any email in the "To:", "Reply-To:", or that belongs to the dealership is NOT the buyer's. Return null if no buyer email exists.
- DEALER ADDRESS: The dealership's city/state/zip is NOT the buyer's location. Return null if only the dealer address is visible.
- DEALER PHONE: Any number labeled "Dealer phone", "Our number", or clearly the dealership's line is NOT the buyer's.

NON-LEAD EMAILS — return null for ALL contact fields (including email) if the input is:
- "Shopper Signals" digest emails (subject contains "Shopper Signals")
- "Daily Digest", "Weekly Summary", "Lead Reminder", aggregate stats emails
- Any email where the prominent name/account shown is the DEALERSHIP (e.g., "Apollo Auto", "KM Autos") with no individual buyer
- A platform admin or marketing email to the dealer with no specific buyer name/phone/email
- If you cannot identify a buyer's name distinct from the dealership name, return all null

MULTI-LEAD SUMMARY EMAILS (e.g., "LeadAI: 3 New Leads", "New leads"):
- These summary pages show multiple leads in a list/table
- Extract only the FIRST individual buyer with the most contact info available
- If no individual buyer contact info is extractable from the summary page, return all null

FACEBOOK / MESSENGER / OFFERUP CONVERSATIONS:
- The BUYER is the person who sent the first message inquiring about a vehicle
- The DEALER account name and email shown as sender/recipient is NOT the buyer
- If only a first name is visible for the buyer (e.g., "Carl"), use it; leave last_name null and email null

EMAIL REPLY CHAINS (Re: subject lines):
- In a "Re:" email chain, look at the ORIGINAL message at the bottom for buyer contact info
- The reply-from address (dealer responding) is NOT the buyer's email
- If the reply is from the dealer and no buyer email appears in the original message, return email as null

RELAY / SYSTEM EMAILS — treat as null:
- Platform relay addresses: comm+xxx@carsformalemail.com, noreply@cargurus.com, leads@autotrader.com, etc.
- Any email address that is clearly auto-generated or a system relay (contains "comm+", "+carsfor", "@carsforsale", etc.)

PLACEHOLDER VALUES — treat as null:
- "N/A", "Customer did not specify", "Not provided", "Not specified", "Unknown", "—", "None", "n/a" → return null for that field

FIELD LABELS — strip them:
- "First Name: John" → "John"; "Phone: (714) 555-1234" → "7145551234"
- Never include the label text in the value

NAME:
- Split full name into first_name / last_name; one word only → first_name, last_name null
- Normalize ALL CAPS to Title Case: "ALEX SOLIS" → "Alex" / "Solis"; "gloria ruiz" → "Gloria" / "Ruiz"
- Strip titles: Mr., Mrs., Dr., etc.

PHONE:
- 10 digits only, no formatting, no country code. "(323) 548-8594" → "3235488594"
- Phone leads: the prominent callback number IS the buyer's phone

EMAIL:
- Extract ONLY a buyer email that is explicitly associated with the buyer in the lead body (e.g., "Email: buyer@gmail.com", or "buyer@gmail.com has inquired about your listing")
- Do NOT extract emails from: email headers (From:, To:, CC:, Reply-To:), Gmail/Outlook footers, dealer reply signatures, or any address that belongs to the business/dealership
- If the buyer's first name is null, email must also be null
- Null if: only header/footer email visible, relay address, noreply, system address, or dealer address

CITY / STATE / ZIP:
- Buyer's location only, often labeled "Location:" or shown in their profile section
- Do NOT use the dealership's address

VEHICLE:
- The car the buyer is inquiring about or wants to BUY
- Do not confuse with their trade-in

BUDGET:
- Integer only (25000 from "$25,000" or "25k")
- Listed vehicle price is valid if buyer is inquiring about it
- Do NOT use dealer cost, invoice, or vague estimates

LEAD SOURCE — use these exact values:
- "CarGurus" | "AutoTrader" | "OfferUp" | "Facebook" | "KBB" | "Autolist" | "Carsforsale" | "Zillow" | "Realtor.com" | "Homes.com" | "open_house" | "text" | "email" | "referral" | "other"
- IMPORTANT: KBB (Kelley Blue Book) leads are often delivered via AutoTrader email infrastructure — if "KBB" or "Kelley Blue Book" appears anywhere in the content or subject, use "KBB" not "AutoTrader"
- "Autotrader Shopper Lead Reminder" emails are AutoTrader leads even if they say "reminder"

URGENCY:
- "high" if buyer says "today", "ASAP", "right now", "urgent", or it's a direct phone call lead
- "low" if browsing or no timeline
- "normal" otherwise

OVERALL CONFIDENCE:
- "high" = name + (phone or personal email)
- "medium" = partial contact info
- "low" = guessing or not a real buyer lead`

const JSON_SHAPE = `{
  "first_name":    { "value": "string or null", "confidence": "high|medium|low" },
  "last_name":     { "value": "string or null", "confidence": "high|medium|low" },
  "phone":         { "value": "10-digit string or null", "confidence": "high|medium|low" },
  "phone2":        { "value": "10-digit string or null", "confidence": "high|medium|low" },
  "email":         { "value": "string or null", "confidence": "high|medium|low" },
  "city":          { "value": "string or null", "confidence": "high|medium|low" },
  "state":         { "value": "string or null", "confidence": "high|medium|low" },
  "zip":           { "value": "string or null", "confidence": "high|medium|low" },
  "vehicle_year":  { "value": number or null,   "confidence": "high|medium|low" },
  "vehicle_make":  { "value": "string or null", "confidence": "high|medium|low" },
  "vehicle_model": { "value": "string or null", "confidence": "high|medium|low" },
  "vehicle_trim":  { "value": "string or null", "confidence": "high|medium|low" },
  "vehicle_vin":   { "value": "string or null", "confidence": "high|medium|low" },
  "budget":        { "value": number or null,   "confidence": "high|medium|low" },
  "lead_source":   { "value": "string or null", "confidence": "high|medium|low" },
  "notes":         { "value": "string or null", "confidence": "high|medium|low" },
  "urgency":       { "value": "high|normal|low or null", "confidence": "high|medium|low" },
  "trade_in":      { "value": "short description or null", "confidence": "high|medium|low" },
  "overall_confidence": "high|medium|low"
}`

const USER_PROMPT = `Extract car buyer lead information from this image or screenshot.
Return ONLY this JSON (no extra text):
${JSON_SHAPE}
${SHARED_RULES}`

const TEXT_LEAD_PROMPT = `Extract car buyer lead information from this text input.

INPUT TYPES (handle all):
- Lead form pastes: CarGurus, AutoTrader, OfferUp, Facebook, KBB, Craigslist, Autolist
- Email forwards from lead platforms
- Text/iMessage/WhatsApp conversations
- Verbal referrals: "my cousin Maria wants a Camry, 714-555-0000"
- Handwritten notes: "Jose Reyes cell 626 555 0000 wants SUV under 20k"
- English, Spanish, or mixed language

Return ONLY this JSON — no markdown, no code fences, no commentary:
${JSON_SHAPE}
${SHARED_RULES}`

// ── JSON extractor ────────────────────────────────────────────────────────────

function parseResponse(text: string): LeadScanResult {
  const start = text.indexOf('{')
  const end   = text.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`No JSON in AI response: ${text.slice(0, 200)}`)
  }
  return JSON.parse(text.slice(start, end + 1)) as LeadScanResult
}

// ── Pasted text scan ──────────────────────────────────────────────────────────

export async function scanLeadText(pastedText: string): Promise<LeadScanResult> {
  const response = await aiComplete({
    model:      AI_MODEL,
    max_tokens: 800,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `${TEXT_LEAD_PROMPT}\n\n---\nINPUT TEXT:\n${pastedText.slice(0, 8000)}` },
    ],
  })

  const text = response.choices[0]?.message?.content ?? ''
  return parseResponse(text)
}

// ── Image scan ────────────────────────────────────────────────────────────────

export async function scanLeadImage(
  imageBase64: string,
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
): Promise<LeadScanResult> {
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

// ── PDF scan — send as image_url with PDF mime (Gemini supports native PDF) ──

export async function scanLeadPdf(pdfBase64: string): Promise<LeadScanResult> {
  const response = await aiComplete({
    model: AI_MODEL,
    max_tokens: 600,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          imageBlock('application/pdf', pdfBase64),
          { type: 'text', text: USER_PROMPT },
        ],
      },
    ],
  })

  const text = response.choices[0]?.message?.content ?? ''
  return parseResponse(text)
}
