import Anthropic from '@anthropic-ai/sdk'

export interface ParsedAppointment {
  customer_name:        string | null
  customer_phone:       string | null  // if included in message
  vehicle:              string | null
  appointment_datetime: string | null  // "YYYY-MM-DD HH:mm"
  location:             string | null
  notes:                string | null
  confidence:           number
}

/**
 * Use Claude Haiku to extract appointment details from a dealer's freeform text.
 * e.g. "Tim wants to see the 2009 Acura MDX on Monday at 2pm at El Monte"
 *
 * @param locationNames - dealer's location names (from org_settings.locations), used
 *   to help the model recognize location references in the text.
 */
export async function parseDealerAppointment(text: string, locationNames: string[] = []): Promise<ParsedAppointment | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  const client = new Anthropic({ apiKey })

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    timeZone: 'America/Los_Angeles',
  })

  const locationHint = locationNames.length > 0
    ? `\nPossible locations: ${locationNames.map(n => `"${n}"`).join(', ')}. Use one of these exact strings if matched, or null if unclear.`
    : '\n"location": string or null (location name if mentioned, else null),'

  const resp = await client.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 250,
    messages: [{
      role:    'user',
      content: `Today is ${today} (Pacific Time). Extract appointment details from this dealer note. Return ONLY a JSON object, no commentary.

Text: "${text}"

Return exactly:
{
  "customer_name": string or null,
  "customer_phone": string or null (10-digit if present),
  "vehicle": string or null (e.g. "2009 Acura MDX"),
  "appointment_datetime": string or null (format "YYYY-MM-DD HH:mm", resolve relative days like "Monday", "tomorrow", "next Friday"),${locationHint}
  "notes": string or null (any extra context),
  "confidence": number 0.0-1.0
}`,
    }],
  })

  const raw = resp.content[0]?.type === 'text' ? resp.content[0].text : ''
  const start = raw.indexOf('{')
  const end   = raw.lastIndexOf('}')
  if (start === -1 || end <= start) return null

  try {
    return JSON.parse(raw.slice(start, end + 1)) as ParsedAppointment
  } catch {
    return null
  }
}
