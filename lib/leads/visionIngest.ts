import 'server-only'
import type { ParsedLead } from './parser'
import type { LeadScanResult } from './visionIngestTypes'

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

const TEXT_LEAD_PROMPT = `The following is pasted lead text (e.g. from a CarGurus, AutoTrader, OfferUp, or generic lead form/email). Extract all car buyer lead information.

Each field must have a "value" and "confidence" ("high" | "medium" | "low"). Use null for value when not found.
lead_source: set to "CarGurus", "AutoTrader", "OfferUp", "Facebook", "KBB", "Autolist", "Carsforsale", or "other" based on wording (e.g. "Lead Submission from CarGurus" → "CarGurus", "Kelley Blue Book" or "KBB" → "KBB").
phone: normalize to digits only in value; if you see (951) 427-9675, use "9514279675" and high confidence.
Return ONLY the same JSON structure as the image prompt (first_name, last_name, phone, email, city, state, zip, vehicle_*, vehicle_vin, budget, lead_source, notes, urgency, trade_in, overall_confidence). No markdown, no code fences.`

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
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) throw new Error('GROQ_API_KEY is not set')
  const { default: Groq } = await import('groq-sdk')
  const groq = new Groq({ apiKey })

  const resp = await groq.chat.completions.create({
    model:           'llama-3.3-70b-versatile',
    max_tokens:      600,
    temperature:     0.1,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user',   content: `${TEXT_LEAD_PROMPT}\n\n---\nTEXT:\n${pastedText.slice(0, 8000)}` },
    ],
  })

  const text = resp.choices[0]?.message?.content ?? ''
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

// ── Convert scan result → ParsedLead ─────────────────────────────────────────

export function scanResultToParsedLead(scan: LeadScanResult): ParsedLead {
  const firstName = scan.first_name.value ?? ''
  const lastName  = scan.last_name.value  ?? ''
  const name = `${firstName} ${lastName}`.trim() || 'Unknown'

  const vehicleParts = [
    scan.vehicle_year.value,
    scan.vehicle_make.value,
    scan.vehicle_model.value,
    scan.vehicle_trim.value,
  ].filter(Boolean).join(' ')

  const noteParts = [
    scan.notes.value,
    scan.trade_in.value ? `Trade-in: ${scan.trade_in.value}` : null,
    scan.budget.value   ? `Budget: $${scan.budget.value.toLocaleString()}` : null,
    scan.urgency.value === 'high' ? 'Buyer marked as urgent' : null,
  ].filter(Boolean).join('\n')

  const src = scan.lead_source.value?.toLowerCase() ?? ''
  let source: ParsedLead['source'] = 'other'
  if (src.includes('cargurus'))     source = 'cargurus'
  else if (src.includes('autotrader')) source = 'autotrader'
  else if (src.includes('offerup'))    source = 'offerup'
  else if (src.includes('facebook'))   source = 'facebook'
  else if (src.includes('kbb'))        source = 'kbb'
  else if (src.includes('autolist'))   source = 'autolist'
  else if (src.includes('carsforsale')) source = 'carsforsale'

  return {
    name,
    email:        scan.email.value        ?? '',
    phone:        scan.phone.value        ?? '',
    zip:          scan.zip.value          ?? '',
    vehicle:      vehicleParts,
    vin:          scan.vehicle_vin.value  ?? '',
    listed_price: null,
    comments:     noteParts,
    source,
    raw_text:     '[scanned]',
  }
}
