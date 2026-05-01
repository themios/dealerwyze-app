import 'server-only'
import type { LeadScanResult } from './visionIngestTypes'
export { scanResultToParsedLead } from './scanResultToParsedLead'

export type { Confidence, ScanField, LeadScanResult } from './visionIngestTypes'

// ── Prompts ───────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a lead data extraction engine for a car dealership CRM.
CRITICAL: Output ONLY a single raw JSON object. No markdown, no code fences, no explanation.`

const USER_PROMPT = `Extract all car buyer lead information from this input.

Each field must have a "value" and "confidence" ("high" | "medium" | "low").
Use "low" when you are guessing or the text is unclear. Use null for value when not found.

Return ONLY this JSON (no extra text):
{
  "first_name":    { "value": "string or null", "confidence": "high|medium|low" },
  "last_name":     { "value": "string or null", "confidence": "high|medium|low" },
  "phone":         { "value": "string or null", "confidence": "high|medium|low" },
  "phone2":        { "value": "string or null", "confidence": "high|medium|low" },
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
}

RULES:
- lead_source: detect from visual cues (Facebook Marketplace, CarGurus, AutoTrader, iMessage, handwritten form, etc.)
- urgency: "high" if buyer says "today", "ASAP", "urgent"; "low" if just browsing
- trade_in: if buyer mentions a trade, describe it briefly ("2018 Honda Civic, ~80k miles")
- notes: any buyer comments, questions, or additional info not captured in other fields
- phone: include dashes/parens as printed; if 10 digits with no formatting, add parens
- For screenshots: read all visible text including sender names, timestamps if helpful
- budget: extract as integer (e.g. 25000 from "$25,000" or "25k")`

const TEXT_LEAD_PROMPT = `You are a universal lead data extractor for a used-car dealership CRM.
Extract buyer information from ANY text input — regardless of format or completeness.

INPUT TYPES you may receive (handle all of them):
- Lead form pastes: CarGurus, AutoTrader, OfferUp, Facebook, KBB, Craigslist, Autolist
- Text/iMessage/WhatsApp conversations (identify the BUYER, not the dealer)
- Verbal referrals typed by staff: "my cousin Maria wants a Camry, 714-555-0000"
- Reply messages: "Is the 2019 Accord still available? — John 818-555-1234"
- Handwritten notes transcribed: "Jose Reyes cell 626 555 0000 wants SUV under 20k"
- Email threads, voicemail transcriptions, social media DMs
- English, Spanish, or mixed language input
- Incomplete fragments with only a name and number

EXTRACTION RULES:
- Extract ONLY what is explicitly present — do not invent or guess missing info
- first_name / last_name: split the buyer's full name; if only one word given, put it in first_name
- phone: digits only, 10 digits, strip country code (+1). Example: "(951) 427-9675" → "9514279675"
- vehicle_*: the vehicle the buyer is INTERESTED IN BUYING (not their trade-in)
- trade_in: brief description of vehicle they want to trade ("2018 Civic EX ~80k miles"), or null
- lead_source: infer from context → "CarGurus" | "AutoTrader" | "OfferUp" | "Facebook" | "KBB" | "Autolist" | "Carsforsale" | "text" | "email" | "referral" | "other"
- urgency: "high" if buyer says "today", "ASAP", "right now", "urgent"; "low" if just browsing
- notes: capture buyer's comments, questions, budget hints, special requests — anything not in other fields
- overall_confidence: "high" = extracted name + (phone or email); "medium" = partial contact info; "low" = mostly guessing

CONFIDENCE per field: "high" = explicitly stated; "medium" = inferred with reasonable certainty; "low" = uncertain or guessed

Return ONLY this JSON — no markdown, no code fences, no commentary:
{
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

// ── JSON extractor (same pattern as business card scanner) ────────────────────

function parseResponse(text: string): LeadScanResult {
  const start = text.indexOf('{')
  const end   = text.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`No JSON in AI response: ${text.slice(0, 200)}`)
  }
  return JSON.parse(text.slice(start, end + 1)) as LeadScanResult
}

// ── Pasted text scan (Haiku — any format: CarGurus, AutoTrader, OfferUp, generic) ─

export async function scanLeadText(pastedText: string): Promise<LeadScanResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set')
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic({ apiKey })

  const response = await client.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 800,
    system:     SYSTEM_PROMPT,
    messages: [{
      role:    'user',
      content: `${TEXT_LEAD_PROMPT}\n\n---\nINPUT TEXT:\n${pastedText.slice(0, 8000)}`,
    }],
  })

  const text = response.content[0]?.type === 'text' ? response.content[0].text : ''
  return parseResponse(text)
}

// ── Image scan (Haiku — fast + cheap) ─────────────────────────────────────────

export async function scanLeadImage(
  imageBase64: string,
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
): Promise<LeadScanResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set')
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic({ apiKey })

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 600,
    system: SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mimeType, data: imageBase64 } },
        { type: 'text', text: USER_PROMPT },
      ],
    }],
  })

  const text = response.content[0]?.type === 'text' ? response.content[0].text : ''
  return parseResponse(text)
}

// ── PDF scan (Sonnet — better multi-page reasoning) ───────────────────────────

export async function scanLeadPdf(pdfBase64: string): Promise<LeadScanResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set')
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic({ apiKey })

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 600,
    system: SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 },
          // Limit to first 10 pages to cap cost on large credit apps
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
        { type: 'text', text: USER_PROMPT },
      ],
    }],
  })

  const text = response.content[0]?.type === 'text' ? response.content[0].text : ''
  return parseResponse(text)
}
