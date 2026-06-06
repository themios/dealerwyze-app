import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { bulkExtractListings, ExtractedListing } from '@/lib/listings/bulkExtractor'
import { orgBulkExtractLimiter } from '@/lib/rateLimit/upstash'

export async function POST(req: NextRequest) {
  try {
    // Authenticate user
    const profile = await requireProfile()

    // Rate limit: 3 bulk extractions per org per hour
    const limiter = await orgBulkExtractLimiter(profile.org_id)
    if (!limiter.allowed) {
      return NextResponse.json(
        {
          error: 'Rate limit exceeded. You can extract 3 batches per hour. Try again later.',
          listings: [],
          errors: [],
        },
        { status: 429 },
      )
    }

    const body = await req.json()
    const content = typeof body.content === 'string' ? body.content : ''

    if (!content || !content.trim()) {
      return NextResponse.json(
        {
          error: 'No content provided',
          listings: [],
          errors: ['Provide listing text or HTML to extract'],
        },
        { status: 400 },
      )
    }

    // Extract listings using Gemini
    const result = await bulkExtractListings(content)

    // Return structured response
    return NextResponse.json({
      listings: result.listings as ExtractedListing[],
      errors: result.errors,
    })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[bulk-extract] error:', errorMsg)

    return NextResponse.json(
      {
        error: 'Failed to process extraction request',
        listings: [],
        errors: [errorMsg],
      },
      { status: 500 },
    )
  }
}
