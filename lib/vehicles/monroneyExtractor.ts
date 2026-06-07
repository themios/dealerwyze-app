/**
 * Monroney photo vision extraction using Gemini 2.5 vision API.
 * Extracts VIN, year, make, model, price, mileage, color, condition from window stickers.
 */

import { aiComplete, imageBlock } from '@/lib/ai/client'
import type { ExtractedVehicle } from './extractionTypes'

export interface MonroneyExtractionResult {
  success: boolean
  vehicle?: ExtractedVehicle
  rawText?: string
  error?: string
}

export async function extractFromMonroneyPhoto(
  imageBase64: string,
  imageMimeType: string = 'image/jpeg'
): Promise<MonroneyExtractionResult> {
  if (!imageBase64) {
    return { success: false, error: 'No image provided' }
  }

  try {
    const prompt = buildMonroneyExtractionPrompt()

    const response = await aiComplete({
      model: 'google/gemini-2.5-flash-lite',
      messages: [
        {
          role: 'user',
          content: [
            imageBlock(imageMimeType, imageBase64),
            {
              type: 'text',
              text: prompt,
            },
          ],
        },
      ],
      max_tokens: 1024,
      temperature: 0.1, // Very low: precise extraction
    })

    const text = response.choices?.[0]?.message?.content
    if (!text || typeof text !== 'string') {
      return { success: false, error: 'No response from vision model' }
    }

    // Try to parse JSON
    try {
      const cleaned = text.replace(/```(?:json)?\n?|\n?```/g, '').trim()
      const parsed = JSON.parse(cleaned) as Partial<ExtractedVehicle>

      // Validate required fields
      if (!parsed.year || !parsed.make || !parsed.model) {
        return {
          success: false,
          error: 'Could not extract year, make, or model from sticker',
          rawText: text,
        }
      }

      return {
        success: true,
        vehicle: {
          year: parsed.year,
          make: parsed.make,
          model: parsed.model,
          vin: parsed.vin ?? undefined,
          price: parsed.price ?? undefined,
          mileage: parsed.mileage ?? undefined,
          color: parsed.color ?? undefined,
          condition: parsed.condition ?? undefined,
        },
        rawText: text,
      }
    } catch {
      // JSON parse failed; return raw text for fallback handling
      return { success: false, error: 'Could not parse extracted data', rawText: text }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, error: `Vision extraction failed: ${message}` }
  }
}

export function buildMonroneyExtractionPrompt(): string {
  return `You are extracting vehicle data from a Monroney (window sticker) photo.

Extract ONLY these fields from the sticker image:
- vin: Vehicle Identification Number (17 chars)
- year: Model year (4 digits)
- make: Manufacturer name
- model: Model name
- price: MSRP or window sticker price (numeric, USD)
- mileage: If shown on sticker
- color: Exterior color
- condition: If shown (e.g., "new", "certified")

IMPORTANT:
1. Return ONLY valid JSON (no markdown, no extra text)
2. year, make, model are REQUIRED
3. All other fields optional (omit if not visible on sticker)
4. For price: extract number only (no $ or commas)
5. If you cannot read a field clearly, omit it
6. Do NOT hallucinate data

Return JSON object:
{
  "vin": "...",
  "year": 2024,
  "make": "...",
  "model": "...",
  "price": 45000,
  "mileage": null,
  "color": "...",
  "condition": null
}

Return ONLY the JSON object. No explanation.`
}
