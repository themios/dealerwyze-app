import Anthropic from '@anthropic-ai/sdk'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * Fetch a vehicle document from Supabase Storage, send to Haiku Vision,
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
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  // Only supported image types + PDF
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

    const client = new Anthropic({ apiKey })

    // Build content block — PDFs use document type, images use image type
    const contentBlock = isPdf
      ? ({
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: base64 },
        } as const)
      : ({
          type: 'image',
          source: { type: 'base64', media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/webp', data: base64 },
        } as const)
      // isImage guard above ensures mimeType is one of the three supported values

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [
        {
          role: 'user',
          content: [
            contentBlock,
            {
              type: 'text',
              text: 'You are summarizing a vehicle document for a used-car dealer. Extract the most important facts in 3-5 short bullet points. Focus on: mileage history, accidents or damage, major service records, overall condition, and any red flags. Be concise — these bullets will be read aloud by a voice agent. Output ONLY the bullet list, no intro or headers.',
            },
          ],
        },
      ],
    })

    const text = response.content.find(b => b.type === 'text')?.text ?? null
    return text?.trim() ?? null
  } catch (err) {
    console.error('[summarizeVehicleDoc] error:', err)
    return null
  }
}
