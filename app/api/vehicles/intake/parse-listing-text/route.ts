import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { parseListingText } from '@/lib/listings/parseListingText'

interface ParsedListing {
  address?: string
  price?: number
  bedrooms?: number
  bathrooms?: number
  sqft?: number
  property_type?: string
  year_built?: number
  lot_size?: string
  mls_number?: string
  description?: string
  features?: string
}

export async function POST(req: NextRequest) {
  try {
    await requireProfile()

    const body: { text: string } = await req.json()
    if (!body.text || body.text.trim().length === 0) {
      return NextResponse.json({ error: 'No text provided' }, { status: 400 })
    }

    // Use simple regex parsing - no AI needed for structured data
    const listing = parseListingText(body.text)

    return NextResponse.json({
      address: listing.address,
      price: listing.price,
      bedrooms: listing.bedrooms,
      bathrooms: listing.bathrooms,
      sqft: listing.sqft,
      property_type: listing.property_type,
      year_built: listing.year_built,
      lot_size: listing.lot_size,
      mls_number: listing.mls_number,
      description: listing.description,
      features: listing.features,
    })
  } catch (err) {
    console.error('[parse-listing-text] error:', err)
    if (err instanceof SyntaxError) {
      return NextResponse.json({ error: 'Could not extract listing info from text' }, { status: 400 })
    }
    return NextResponse.json({ error: 'Failed to parse listing text' }, { status: 500 })
  }
}
