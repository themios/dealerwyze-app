import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import {
  scanProspectText,
  scanProspectImage,
  scanProspectPdf,
} from '@/lib/leads/propertyProspectIngest'

export const maxDuration = 60

/**
 * POST /api/prospects/extract
 *
 * Extract property prospect information from text, image, or PDF.
 * Routes to appropriate extraction function based on method.
 *
 * Request body (text):
 * {
 *   method: "text"
 *   text: string
 * }
 *
 * Request body (image/pdf):
 * {
 *   method: "image" | "pdf"
 *   mime_type: string
 *   file_base64: string
 * }
 */
export async function POST(req: NextRequest) {
  try {
    await requireProfile()

    const body = await req.json() as {
      method: 'text' | 'image' | 'pdf'
      text?: string
      mime_type?: string
      file_base64?: string
    }

    const { method } = body

    if (!method || !['text', 'image', 'pdf'].includes(method)) {
      return NextResponse.json(
        { error: 'Invalid method. Must be: text, image, or pdf' },
        { status: 400 }
      )
    }

    // Text extraction
    if (method === 'text') {
      const { text } = body
      if (!text || text.trim().length === 0) {
        return NextResponse.json(
          { error: 'text field is required and cannot be empty' },
          { status: 400 }
        )
      }

      try {
        const results = await scanProspectText(text)
        const valid = results.filter(r => r.phone?.value || r.email?.value || r.first_name?.value)
        if (valid.length === 0) return NextResponse.json({ error: 'No prospects found in this text.' }, { status: 422 })
        return NextResponse.json({ prospects: valid })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Extraction failed'
        console.error('[prospects/extract] text scan error:', msg)
        return NextResponse.json(
          { error: `Extraction failed: ${msg}` },
          { status: 400 }
        )
      }
    }

    // Image/PDF extraction
    const { mime_type: mimeType, file_base64: fileBase64 } = body

    if (!mimeType || !fileBase64) {
      return NextResponse.json(
        { error: 'mime_type and file_base64 are required for image/pdf extraction' },
        { status: 400 }
      )
    }

    // Validate base64 size (~4MB limit for base64 string)
    if (fileBase64.length > 4 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'File too large. Maximum 3MB' },
        { status: 413 }
      )
    }

    try {
      let result

      if (method === 'image') {
        // Validate image MIME type
        const validImageMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
        if (!validImageMimes.includes(mimeType)) {
          return NextResponse.json(
            { error: `Invalid image type. Supported: ${validImageMimes.join(', ')}` },
            { status: 400 }
          )
        }
        result = await scanProspectImage(
          fileBase64,
          mimeType as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'
        )
      } else {
        // PDF extraction
        if (mimeType !== 'application/pdf') {
          return NextResponse.json(
            { error: 'For pdf method, mime_type must be application/pdf' },
            { status: 400 }
          )
        }
        result = await scanProspectPdf(fileBase64)
      }

      const valid = result.filter(r => r.phone?.value || r.email?.value || r.first_name?.value)
      if (valid.length === 0) return NextResponse.json({ error: 'No prospects found in this document.' }, { status: 422 })
      return NextResponse.json({ prospects: valid })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Extraction failed'
      console.error(`[prospects/extract] ${method} scan error:`, msg)
      return NextResponse.json(
        { error: `Extraction failed: ${msg}` },
        { status: 400 }
      )
    }
  } catch (err) {
    console.error('[prospects/extract] error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
