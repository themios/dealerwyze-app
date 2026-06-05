export interface VoiceSummaryJson {
  caller_name:                 string | null
  vehicle_interest:            string | null
  location:                    string | null
  appointment_exact:           string | null
  appointment_range:           'today_morning' | 'today_afternoon' | 'this_week' | 'general_inquiry' | null
  intent:                      'buy' | 'sell' | 'information' | 'service' | 'unknown' | null
  budget_mentioned:            string | null
  trade_in:                    boolean | null
  financing_interest:          boolean | null
  restricted_topics_attempted: string[]
  callback_phone:              string | null
  additional_notes:            string | null
  confidence_score:            number
}

function getSystemPrompt(vertical: 'dealer' | 'real_estate'): string {
  if (vertical === 'real_estate') {
    return `You are a CRM data extractor for a real estate brokerage.
Output ONLY a single raw JSON object matching the exact schema provided. No markdown, no code fences, no extra keys.`
  }
  return `You are a CRM data extractor for a used-car dealership.
Output ONLY a single raw JSON object matching the exact schema provided. No markdown, no code fences, no extra keys.`
}

/**
 * Generate a structured summary of a voice call using gathered step data.
 * Returns null on failure — caller should store null and continue.
 */
export async function generateVoiceSummary(input: {
  name:          string
  vehicle:       string
  phone:         string
  timeline:      string
  transcript:    string
  locationNames?: string[]   // org location names for hint
  vertical?:     'dealer' | 'real_estate'
}): Promise<VoiceSummaryJson | null> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) return null

  const { default: Groq } = await import('groq-sdk')
  const groq = new Groq({ apiKey })
  const vertical = input.vertical ?? 'dealer'

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    timeZone: 'America/Los_Angeles',
  })

  const locationHint = input.locationNames && input.locationNames.length > 0
    ? `Possible locations: ${input.locationNames.map(n => `"${n}"`).join(', ')}. Use one of these exact strings if matched, else null.`
    : 'string or null (location name if mentioned, else null)'

  const propertyLabel = vertical === 'real_estate' ? 'property' : 'vehicle'
  const businessType = vertical === 'real_estate' ? "a real estate agent or brokerage's virtual receptionist" : "a car dealership's virtual receptionist"

  const userPrompt = `You are analyzing a call between a client and ${businessType}.
Extract structured lead data. Return STRICT JSON only. No commentary, no markdown.
If information is missing use null. Do NOT guess or invent details.
Today is ${today} (Pacific Time). Use this to resolve relative dates like "tomorrow", "Saturday", "next week" into ISO datetime strings (format: "YYYY-MM-DD HH:mm").

Call data:
- Caller name: "${input.name}"
- ${vertical === 'real_estate' ? 'Property' : 'Vehicle'} mentioned: "${input.vehicle}"
- Callback phone: "${input.phone}"
- Timeline/appointment: "${input.timeline}"
- Full transcript: "${input.transcript}"

Return exactly this JSON structure:
{
  "caller_name": string or null,
  "vehicle_interest": string or null (exact year/make/model if mentioned, do not guess),
  "location": ${locationHint},
  "appointment_exact": string or null (ISO datetime if specific time confirmed, e.g. "2025-03-15 10:00"),
  "appointment_range": "today_morning" | "today_afternoon" | "this_week" | "general_inquiry" | null,
  "intent": "buy" | "sell" | "information" | "service" | "unknown",
  "budget_mentioned": string or null (exact amount if stated),
  "trade_in": true | false | null,
  "financing_interest": true | false | null,
  "restricted_topics_attempted": [] (array from: "financing_terms","apr","monthly_payment","out_the_door_price","refunds","warranty","negotiation"),
  "callback_phone": string or null,
  "additional_notes": string or null (max 2 short factual sentences),
  "confidence_score": number 0.0-1.0
}`

  const resp = await groq.chat.completions.create({
    model:           'llama-3.3-70b-versatile',
    max_tokens:      400,
    temperature:     0.1,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: getSystemPrompt(vertical) },
      { role: 'user',   content: userPrompt },
    ],
  })

  const text = resp.choices[0]?.message?.content ?? ''
  const start = text.indexOf('{')
  const end   = text.lastIndexOf('}')
  if (start === -1 || end <= start) return null

  try {
    return JSON.parse(text.slice(start, end + 1)) as VoiceSummaryJson
  } catch {
    return null
  }
}
