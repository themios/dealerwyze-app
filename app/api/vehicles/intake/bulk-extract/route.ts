import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { bulkExtractListings, ExtractedListing } from '@/lib/listings/bulkExtractor'
import { bulkExtractVehicles, type ExtractedVehicle } from '@/lib/vehicles/bulkExtractor'
import { createClient } from '@/lib/supabase/server'
import { orgBulkExtractLimiter } from '@/lib/rateLimit/upstash'

export async function POST(req: NextRequest) {
  try {
    // Authenticate user
    const profile = await requireProfile()

    // Get org to check vertical
    const supabase = await createClient()
    const { data: org } = await supabase
      .from('organizations')
      .select('vertical')
      .eq('id', profile.org_id)
      .single()

    const vertical = org?.vertical || 'dealer'

    // Rate limit: 3 bulk extractions per org per hour
    const limiter = await orgBulkExtractLimiter(profile.org_id)
    if (!limiter.allowed) {
      return NextResponse.json(
        {
          error: 'Rate limit exceeded. You can extract 3 batches per hour. Try again later.',
          vehicles: [],
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
          vehicles: [],
          listings: [],
          errors: ['Provide inventory text or HTML to extract'],
        },
        { status: 400 },
      )
    }

    // Dispatch by vertical
    let result: { vehicles?: ExtractedVehicle[]; listings?: ExtractedListing[]; errors: string[] }

    if (vertical === 'real_estate') {
      // RealtyWyze: extract listings
      const extracted = await bulkExtractListings(content)
      result = {
        listings: extracted.listings as ExtractedListing[],
        errors: extracted.errors,
      }
    } else {
      // DealerWyze: extract vehicles
      const extracted = await bulkExtractVehicles(content)
      result = {
        vehicles: extracted.vehicles as ExtractedVehicle[],
        errors: extracted.errors,
      }
    }

    // Return structured response
    return NextResponse.json({
      ...result,
      error: result.errors.length > 0 ? result.errors[0] : undefined,
    })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[bulk-extract] error:', errorMsg)

    return NextResponse.json(
      {
        error: 'Failed to process extraction request',
        vehicles: [],
        listings: [],
        errors: [errorMsg],
      },
      { status: 500 },
    )
  }
}
