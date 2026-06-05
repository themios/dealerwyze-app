import { aiComplete, AI_MODEL, imageBlock } from '@/lib/ai/client'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * Fetch a property document from Supabase Storage, send to Claude vision,
 * and return a 3-5 bullet summary of key findings.
 *
 * Supports: inspection reports, appraisal reports, disclosure documents.
 * Called at upload time only — never during a live call.
 * Returns null on failure so callers can proceed without blocking.
 */
export async function summarizePropertyDoc(
  fileKey: string,
  bucket: string,
  mimeType: string,
): Promise<string | null> {
  if (!process.env.OPENROUTER_API_KEY) return null

  const SUPPORTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
  if (!SUPPORTED_TYPES.has(mimeType)) return null

  try {
    const storage = createServiceClient()
    const { data: blob, error } = await storage.storage.from(bucket).download(fileKey)
    if (error || !blob) {
      console.error('[summarizePropertyDoc] download error:', error?.message)
      return null
    }

    const arrayBuffer = await blob.arrayBuffer()
    const base64 = Buffer.from(arrayBuffer).toString('base64')

    const response = await aiComplete({
      model: AI_MODEL,
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: [
          imageBlock(mimeType, base64),
          {
            type: 'text',
            text: `You are summarizing a property inspection, appraisal, or disclosure document for a real estate agent.
Extract the most important findings in 3-5 short bullet points. Focus on:
- Structural condition and major systems (roof, foundation, HVAC)
- Any disclosed defects, repairs, or safety concerns
- Year built and major renovation dates if available
- Overall condition assessment and inspector recommendations
Be concise — these bullets will be reviewed by an agent assessing the property.
Output ONLY the bullet list, no intro or headers.`,
          },
        ],
      }],
    })

    const text = response.choices[0]?.message?.content ?? null
    return text?.trim() ?? null
  } catch (err) {
    console.error('[summarizePropertyDoc] error:', err)
    return null
  }
}

/**
 * Property document types that can be summarized.
 */
export type PropertyDocumentType = 'inspection' | 'appraisal' | 'disclosure' | 'title' | 'insurance'

/**
 * Enhanced property document analyzer that categorizes document type and extracts structured data.
 * For future use when property document filing system is built out.
 */
export async function analyzePropertyDoc(
  fileKey: string,
  bucket: string,
  mimeType: string,
): Promise<{
  docType: PropertyDocumentType | null
  summary: string | null
  extractedFields: Record<string, string | null>
} | null> {
  if (!process.env.OPENROUTER_API_KEY) return null

  const SUPPORTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
  if (!SUPPORTED_TYPES.has(mimeType)) return null

  try {
    const storage = createServiceClient()
    const { data: blob, error } = await storage.storage.from(bucket).download(fileKey)
    if (error || !blob) {
      console.error('[analyzePropertyDoc] download error:', error?.message)
      return null
    }

    const arrayBuffer = await blob.arrayBuffer()
    const base64 = Buffer.from(arrayBuffer).toString('base64')

    const response = await aiComplete({
      model: AI_MODEL,
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: [
          imageBlock(mimeType, base64),
          {
            type: 'text',
            text: `Analyze this property document and extract structured data. Return ONLY valid JSON (no markdown, no explanation).

{
  "doc_type": "inspection" | "appraisal" | "disclosure" | "title" | "insurance" | null,
  "summary": "3-5 bullet summary of key findings, or null",
  "property_address": "full address if visible, or null",
  "inspection_date": "YYYY-MM-DD or null",
  "overall_condition": "good" | "fair" | "poor" | null,
  "major_issues": ["issue1", "issue2"] or [],
  "year_built": number or null,
  "roof_condition": "good" | "fair" | "poor" | null,
  "foundation_condition": "good" | "fair" | "poor" | null,
  "hvac_age": number or null,
  "estimated_value": number or null,
  "estimated_repairs": number or null
}`,
          },
        ],
      }],
    })

    const text = response.choices[0]?.message?.content ?? ''
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start === -1 || end <= start) return null

    const parsed = JSON.parse(text.slice(start, end + 1))
    return {
      docType: parsed.doc_type ?? null,
      summary: parsed.summary ?? null,
      extractedFields: {
        property_address: parsed.property_address ?? null,
        inspection_date: parsed.inspection_date ?? null,
        overall_condition: parsed.overall_condition ?? null,
        year_built: parsed.year_built ? String(parsed.year_built) : null,
        roof_condition: parsed.roof_condition ?? null,
        foundation_condition: parsed.foundation_condition ?? null,
        hvac_age: parsed.hvac_age ? String(parsed.hvac_age) : null,
        estimated_value: parsed.estimated_value ? String(parsed.estimated_value) : null,
        estimated_repairs: parsed.estimated_repairs ? String(parsed.estimated_repairs) : null,
      },
    }
  } catch (err) {
    console.error('[analyzePropertyDoc] error:', err)
    return null
  }
}
