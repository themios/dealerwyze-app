import { aiComplete, aiText } from '@/lib/ai/client'
import OpenAI from 'openai'

export type ExtractedListing = {
  address: string
  price?: number
  beds?: number
  baths?: number
  sqft?: number
  property_type?: string
  year_built?: number
  lot_size?: string
  mls_number?: string
  description?: string
}

export async function bulkExtractListings(content: string): Promise<{
  listings: ExtractedListing[]
  errors: string[]
}> {
  // Validate input
  if (!content?.trim()) {
    return { listings: [], errors: ['Invalid input: empty content'] }
  }

  if (content.length > 100_000) {
    return { listings: [], errors: ['Invalid input: content exceeds 100KB limit'] }
  }

  try {
    const prompt = buildBulkExtractionPrompt(content)
    const params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
      model: 'google/gemini-2.5-flash-lite',
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      max_tokens: 4096,
      temperature: 0.3, // Lower temperature for more consistent parsing
    }

    const response = await aiComplete(params)
    const rawResponse = aiText(response)

    // Strip markdown code fences if present
    const cleaned = rawResponse.replace(/```(?:json)?\n?|\n?```/g, '').trim()

    // Parse JSON
    let parsed: unknown
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      return {
        listings: [],
        errors: ['Failed to parse AI response as JSON'],
      }
    }

    // Validate array response
    if (!Array.isArray(parsed)) {
      return {
        listings: [],
        errors: ['Invalid response: expected array of listings'],
      }
    }

    // Filter and validate each listing
    const listings = parsed
      .filter((item) => item && typeof item === 'object')
      .map((item) => validateListing(item))
      .filter((item) => item !== null) as ExtractedListing[]

    return {
      listings,
      errors: listings.length === 0 && parsed.length > 0 ? ['No valid listings extracted'] : [],
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error during extraction'
    return {
      listings: [],
      errors: [errorMsg],
    }
  }
}

function validateListing(item: unknown): ExtractedListing | null {
  if (typeof item !== 'object' || item === null) return null

  const obj = item as Record<string, unknown>

  // Address is required
  const address = typeof obj.address === 'string' ? obj.address.trim() : null
  if (!address) return null

  return {
    address,
    price: typeof obj.price === 'number' ? obj.price : undefined,
    beds: typeof obj.beds === 'number' ? obj.beds : undefined,
    baths: typeof obj.baths === 'number' ? obj.baths : undefined,
    sqft: typeof obj.sqft === 'number' ? obj.sqft : undefined,
    property_type: typeof obj.property_type === 'string' ? obj.property_type : undefined,
    year_built: typeof obj.year_built === 'number' ? obj.year_built : undefined,
    lot_size: typeof obj.lot_size === 'string' ? obj.lot_size : undefined,
    mls_number: typeof obj.mls_number === 'string' ? obj.mls_number : undefined,
    description: typeof obj.description === 'string' ? obj.description : undefined,
  }
}

function buildBulkExtractionPrompt(content: string): string {
  return `Extract all real estate listings from the provided text or HTML. For each distinct listing, return a JSON object with these fields:

- address (required): Full street address of the property
- price (optional): Numeric price in dollars (e.g., 250000)
- beds (optional): Number of bedrooms as integer
- baths (optional): Number of bathrooms as integer or decimal
- sqft (optional): Square footage as integer
- property_type (optional): Type like 'single_family', 'condo', 'townhouse', 'land', 'commercial', 'multi_family', etc.
- year_built (optional): 4-digit year the property was built
- lot_size (optional): Lot size as string, e.g. "0.5 acres" or "5000 sq ft"
- mls_number (optional): MLS# or listing ID if present
- description (optional): Any additional notes or features about the property

**Rules:**
- If a listing is incomplete (missing address or cannot be parsed), skip it entirely.
- Return ONLY a valid JSON array. Do not include any markdown, explanations, or text outside the JSON.
- Do not wrap the response in code fences. Just the raw JSON array.
- Each object in the array must be a valid listing object.
- If no listings can be extracted, return an empty array: []

**Input content:**

${content}`
}
