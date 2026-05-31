import { getAiClient, AI_MODEL, imageBlock } from '@/lib/ai/client'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * Fetch a vehicle document from Supabase Storage, send to Gemini vision,
 * and return a 3-5 bullet summary (mileage history, accidents, service, condition).
 *
 * Called at upload time only — never during a live call.
 * Returns null on failure so callers can proceed without blocking.
 */
export async function summarizeVehicleDoc(
  fileKey: string,
  bucket: string,
  mimeType: string
): Promise<string | null> {
  if (!process.env.OPENROUTER_API_KEY) return null

  const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
  const isPdf   = mimeType === 'application/pdf'
  const isImage = SUPPORTED_IMAGE_TYPES.has(mimeType)
  if (!isImage && !isPdf) return null

  try {
    const storage = createServiceClient()
    const { data: blob, error } = await storage.storage.from(bucket).download(fileKey)
    if (error || !blob) {
      console.error('[summarizeVehicleDoc] download error:', error?.message)
      return null
    }

    const arrayBuffer = await blob.arrayBuffer()
    const base64 = Buffer.from(arrayBuffer).toString('base64')

    const response = await getAiClient().chat.completions.create({
      model: AI_MODEL,
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: [
          imageBlock(mimeType, base64),
          {
            type: 'text',
            text: 'You are summarizing a vehicle document for a used-car dealer. Extract the most important facts in 3-5 short bullet points. Focus on: mileage history, accidents or damage, major service records, overall condition, and any red flags. Be concise — these bullets will be read aloud by a voice agent. Output ONLY the bullet list, no intro or headers.',
          },
        ],
      }],
    })

    const text = response.choices[0]?.message?.content ?? null
    return text?.trim() ?? null
  } catch (err) {
    console.error('[summarizeVehicleDoc] error:', err)
    return null
  }
}
