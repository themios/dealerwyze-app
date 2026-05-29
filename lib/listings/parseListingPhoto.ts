/**
 * parseListingPhoto — Claude Vision RE prompt for listing photo/flyer extraction.
 *
 * Adapts the vehicle scan-image pattern with an RE-specific prompt.
 * Validates image size (max 5MB) and MIME type before calling the model.
 * Returns extracted RE fields or null if the model cannot parse them.
 *
 * photo_url is NOT returned — photos are managed via vehicle_photos upload.
 */

import Anthropic from '@anthropic-ai/sdk'

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

const client = new Anthropic()

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

  const message = await client.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 512,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
              data: imageBase64,
            },
          },
          {
            type: 'text',
            text: RE_PHOTO_PROMPT,
          },
        ],
      },
    ],
  })

  const text = message.content[0]?.type === 'text' ? message.content[0].text : ''
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
