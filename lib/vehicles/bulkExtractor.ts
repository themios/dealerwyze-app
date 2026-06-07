/**
 * Bulk vehicle extraction utility using Gemini via OpenRouter.
 * Handles input validation, AI extraction, JSON parsing, and graceful degradation.
 */

import { aiComplete, aiText } from '@/lib/ai/client'
import { buildBulkVehicleExtractionPrompt } from '@/lib/ai/bulkPrompts'
import OpenAI from 'openai'
import type { ExtractedVehicle } from './extractionTypes'

export type { ExtractedVehicle }

export async function bulkExtractVehicles(content: string): Promise<{
  vehicles: ExtractedVehicle[]
  errors: string[]
}> {
  // Validate input
  if (!content?.trim()) {
    return { vehicles: [], errors: ['Invalid input: empty content'] }
  }

  if (content.length > 100_000) {
    return { vehicles: [], errors: ['Invalid input: content exceeds 100KB limit'] }
  }

  try {
    const prompt = buildBulkVehicleExtractionPrompt(content)
    const params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
      model: 'google/gemini-2.5-flash-lite',
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      max_tokens: 4096,
      temperature: 0.3,
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
        vehicles: [],
        errors: ['Failed to parse AI response as JSON'],
      }
    }

    // Validate array response
    if (!Array.isArray(parsed)) {
      return {
        vehicles: [],
        errors: ['Invalid response: expected array of vehicles'],
      }
    }

    // Filter and validate each vehicle
    const vehicles = parsed
      .filter((item) => item && typeof item === 'object')
      .map((item) => validateVehicle(item))
      .filter((item) => item !== null) as ExtractedVehicle[]

    return {
      vehicles,
      errors: vehicles.length === 0 && parsed.length > 0 ? ['No valid vehicles extracted'] : [],
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error during extraction'
    return {
      vehicles: [],
      errors: [errorMsg],
    }
  }
}

function validateVehicle(item: unknown): ExtractedVehicle | null {
  if (typeof item !== 'object' || item === null) return null

  const obj = item as Record<string, unknown>

  // Year, make, and model are required to be useful
  const year = typeof obj.year === 'number' ? obj.year : null
  const make = typeof obj.make === 'string' ? obj.make.trim() : null
  const model = typeof obj.model === 'string' ? obj.model.trim() : null

  if (!year || !make || !model) return null

  return {
    year,
    make,
    model,
    vin: typeof obj.vin === 'string' ? obj.vin.trim().toUpperCase() : undefined,
    price: typeof obj.price === 'number' ? obj.price : undefined,
    mileage: typeof obj.mileage === 'number' ? obj.mileage : undefined,
    color: typeof obj.color === 'string' ? obj.color.trim() : undefined,
    condition: typeof obj.condition === 'string' ? obj.condition.trim().toLowerCase() : undefined,
    description: typeof obj.description === 'string' ? obj.description.trim() : undefined,
  }
}
