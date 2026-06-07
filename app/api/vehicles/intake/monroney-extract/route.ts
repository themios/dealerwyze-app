import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { extractFromMonroneyPhoto } from '@/lib/vehicles/monroneyExtractor'
import { orgBulkExtractLimiter } from '@/lib/rateLimit/upstash'

const MAX_IMAGE_SIZE = 5 * 1024 * 1024 // 5MB
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

export const maxDuration = 30

export async function POST(req: NextRequest) {
  const profile = await requireProfile()
  const orgId = profile.org_id

  // Check rate limit (shared with bulk extract: 3/hour)
  const limiter = await orgBulkExtractLimiter(orgId)
  if (!limiter.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Try again in 1 hour.' },
      { status: 429 }
    )
  }

  try {
    const body = await req.json()
    const { imageBase64, imageMimeType } = body

    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return NextResponse.json(
        { error: 'imageBase64 is required' },
        { status: 400 }
      )
    }

    const mimeType = imageMimeType || 'image/jpeg'
    if (!ALLOWED_TYPES.has(mimeType)) {
      return NextResponse.json(
        { error: 'Unsupported image type' },
        { status: 400 }
      )
    }

    // Validate size (rough estimate: base64 is ~33% larger)
    if (imageBase64.length > MAX_IMAGE_SIZE * 1.33) {
      return NextResponse.json(
        { error: 'Image exceeds 5MB limit' },
        { status: 413 }
      )
    }

    const result = await extractFromMonroneyPhoto(imageBase64, mimeType)

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: result.error,
          rawText: result.rawText, // For debugging / manual fallback
        },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      vehicle: result.vehicle,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[monroney-extract]', message)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
