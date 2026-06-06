/**
 * POST /api/listings/import
 * Import RE listings from CSV data. RE-only endpoint.
 * Parses listing objects and creates vehicle records with RE format.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/api/errorHandler'

const ListingSchema = z.object({
  address: z.string().min(1).max(200),
  price: z.number().optional().nullable(),
  bedrooms: z.number().int().optional().nullable(),
  bathrooms: z.number().optional().nullable(),
  sqft: z.number().int().optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
})

const ImportSchema = z.object({
  listings: z.array(ListingSchema).min(1).max(100),
})

export async function POST(req: NextRequest) {
  try {
    const profile = await requireProfile()
    const supabase = await createClient()

    // Verify org is real_estate vertical
    const { data: org } = await supabase
      .from('organizations')
      .select('vertical')
      .eq('id', profile.org_id)
      .maybeSingle()

    if (org?.vertical !== 'real_estate') {
      return NextResponse.json(
        { error: 'CSV import is only available for real estate organizations' },
        { status: 403 }
      )
    }

    // Parse request body
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const parsed = ImportSchema.safeParse(body)
    if (!parsed.success) {
      const firstError = parsed.error.issues[0]
      return NextResponse.json(
        { error: `Validation error: ${firstError.message}` },
        { status: 400 }
      )
    }

    const { listings } = parsed.data
    let imported = 0

    // Insert each listing as a vehicle with RE format
    for (const listing of listings) {
      const { error } = await supabase.from('vehicles').insert({
        user_id: profile.org_id,
        year: 0, // RE marker
        make: 'RE', // RE marker
        model: listing.address.slice(0, 100), // Address in model field
        address_line1: listing.address,
        price: listing.price,
        bedrooms: listing.bedrooms,
        bathrooms: listing.bathrooms,
        sqft: listing.sqft,
        status: 'available',
        notes: listing.description,
        stock_no: `CSV-${Date.now().toString().slice(-6)}`, // Unique identifier
      })

      if (!error) imported++
    }

    return NextResponse.json({
      imported,
      message: `Successfully imported ${imported} of ${listings.length} listings`,
    })
  } catch (err) {
    return apiError(err, {
      route: 'POST /api/listings/import',
      action: 'import_listings',
      userId: (await requireProfile().catch(() => ({ id: 'unknown' }))).id,
    })
  }
}
