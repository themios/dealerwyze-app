import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { aiComplete, AI_MODEL, imageBlock, aiText } from '@/lib/ai/client'

interface ScannedListing {
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

    const body: { image: string } = await req.json()
    if (!body.image) {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 })
    }

    const response = await aiComplete({
      model: AI_MODEL,
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            imageBlock('image/jpeg', body.image),
            {
              type: 'text',
              text: `Extract the following property listing information from this document/photo. Return a JSON object with these exact keys (use null for missing data):
{
  "address": "full street address with city and state",
  "price": number (numeric price only),
  "bedrooms": number,
  "bathrooms": number (can be decimal like 2.5),
  "sqft": number (square footage)
}

Return ONLY the JSON object, no other text.`,
            },
          ],
        },
      ],
    })

    const content = aiText(response)
    // Strip markdown code fences if present
    const jsonStr = content.replace(/```(?:json)?\n?|\n?```/g, '').trim()
    const listing: ScannedListing = JSON.parse(jsonStr)

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
    console.error('[scan-listing] error:', err)
    if (err instanceof SyntaxError) {
      return NextResponse.json({ error: 'Could not extract listing info from image' }, { status: 400 })
    }
    return NextResponse.json({ error: 'Failed to scan listing' }, { status: 500 })
  }
}
