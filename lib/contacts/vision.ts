import Anthropic from '@anthropic-ai/sdk'

export interface CardExtraction {
  name: string | null
  company: string | null
  title: string | null
  phone: string | null
  email: string | null
  fax: string | null
  address: string | null
  website: string | null
}

const SYSTEM_PROMPT = `You are a business card OCR engine.
CRITICAL: Output ONLY a single raw JSON object. No markdown, no code fences, no explanation.`

const USER_PROMPT = `Extract all contact information from this business card image.

OUTPUT a single JSON object with these EXACT fields (null if not found):
{
  "name": "full name of the person",
  "company": "company or business name",
  "title": "job title or role",
  "phone": "primary phone number as printed",
  "email": "email address",
  "fax": "fax number as printed",
  "address": "full address as a single string",
  "website": "website URL"
}

RULES:
- If multiple phone numbers exist, prefer the direct/mobile number for phone, put fax number in fax
- Preserve numbers exactly as printed (including formatting)
- If a field is not visible or not present, use null`

export async function scanBusinessCard(
  imageBase64: string,
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp',
): Promise<CardExtraction> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set')

  const client = new Anthropic({ apiKey })

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 400,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mimeType, data: imageBase64 },
          },
          { type: 'text', text: USER_PROMPT },
        ],
      },
    ],
  })

  const text = response.content[0]?.type === 'text' ? response.content[0].text : ''
  const start = text.indexOf('{')
  const end   = text.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`No JSON in Haiku response: ${text.slice(0, 200)}`)
  }

  try {
    return JSON.parse(text.slice(start, end + 1)) as CardExtraction
  } catch {
    throw new Error(`Invalid JSON from Haiku: ${text.slice(start, start + 200)}`)
  }
}
