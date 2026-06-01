import { aiComplete, AI_MODEL, imageBlock } from '@/lib/ai/client'

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
  if (!process.env.OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY not set')

  const response = await aiComplete({
    model: AI_MODEL,
    max_tokens: 400,
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
  const start = text.indexOf('{')
  const end   = text.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`No JSON in AI response: ${text.slice(0, 200)}`)
  }

  try {
    return JSON.parse(text.slice(start, end + 1)) as CardExtraction
  } catch {
    throw new Error(`Invalid JSON from AI: ${text.slice(start, start + 200)}`)
  }
}
