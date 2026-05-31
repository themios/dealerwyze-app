/**
 * parseListingPhoto — Gemini vision prompt for listing photo/flyer extraction.
 *
 * Validates image size (max 5MB) and MIME type before calling the model.
 * Returns extracted RE fields or null if the model cannot parse them.
 *
 * photo_url is NOT returned — photos are managed via vehicle_photos upload.
 */

import { getAiClient, AI_MODEL, imageBlock } from '@/lib/ai/client'

const ALLOWED_TYPES = new Set<string>(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
const MAX_BYTES = 5 * 1024 * 1024 // 5 MB

const RE_PHOTO_PROMPT = `Extract real estate listing information from this image or flyer.
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
  "year_built": "number|null",
  "property_type": "string|null",
  "mls_number": "string|null",
  "listing_agent": "string|null"
}
Do not include any text outside the JSON object.`

/**
 * Scan a base64 listing photo or flyer and extract RE listing fields.
 *
 * @param imageBase64 - Base64-encoded image data
 * @param mimeType - MIME type of the image (jpeg, png, webp, or gif)
 * @returns Extracted RE fields with import_source set, or null on failure
 */
export async function parseListingPhoto(
  imageBase64: string,
  mimeType: string,
): Promise<Record<string, unknown> | null> {
  if (!ALLOWED_TYPES.has(mimeType)) {
    throw new Error('Unsupported image type. Use JPEG, PNG, WEBP, or GIF.')
  }

  const bytes = Buffer.from(imageBase64, 'base64')
  if (bytes.length > MAX_BYTES) {
    throw new Error('Image too large (max 5MB). Compress the image and try again.')
  }

  const response = await getAiClient().chat.completions.create({
    model: AI_MODEL,
    max_tokens: 512,
    messages: [{
      role: 'user',
      content: [
        imageBlock(mimeType, imageBase64),
        { type: 'text', text: RE_PHOTO_PROMPT },
      ],
    }],
  })

  const text = response.choices[0]?.message?.content ?? ''
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return null

  let extracted: Record<string, unknown>
  try {
    extracted = JSON.parse(jsonMatch[0]) as Record<string, unknown>
  } catch {
    return null
  }

  return {
    ...extracted,
    import_source: 'photo_scan',
  }
}
