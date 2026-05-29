/**
 * POST /api/listings/import-mls
 * LIST-03 — MLS# import via RentCast address lookup.
 *
 * Accepts { mls_number, address_line1, city, state, zip } and creates a vehicles
 * row immediately. No preview step: MLS# + address are authoritative. The UI
 * redirects to /vehicles/{id} after this call so the agent can review and edit.
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import { fetchPropertyByAddress, buildFullAddress } from '@/lib/listings/rentcast'

const schema = z.object({
  mls_number:   z.string().min(1).max(50),
  address_line1: z.string().min(5).max(200),
  city:          z.string().min(1).max(100),
  state:         z.string().length(2),
  zip:           z.string().regex(/^\d{5}$/),
})

export async function POST(req: NextRequest) {
  try {
    const profile = await requireProfile()
    const supabase = await createClient()

    // Vertical guard — RE orgs only
    const { data: org } = await supabase
      .from('organizations')
      .select('vertical')
      .eq('id', profile.org_id)
      .single()

    if (org?.vertical !== 'real_estate') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Parse and validate body
    const rawBody = await req.json().catch(() => ({}))
    const parsed = schema.safeParse(rawBody)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    const { mls_number, address_line1, city, state, zip } = parsed.data
    const fullAddress = buildFullAddress({ address_line1, city, state, zip })

    // Look up property data from RentCast (best-effort; missing key → 503)
    let rentcastData = null
    try {
      rentcastData = await fetchPropertyByAddress(fullAddress)
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (msg.includes('RENTCAST_API_KEY')) {
        return NextResponse.json(
          { error: 'RentCast is not configured. Enter listing details manually.' },
          { status: 503 },
        )
      }
      // RentCast API error — log but do not block import
      console.error('[import-mls] RentCast lookup failed, proceeding without data:', msg)
    }

    // Build insert payload — year/make/model are NOT NULL in schema; use RE placeholders
    const insertData: Record<string, unknown> = {
      user_id:       profile.org_id,
      year:          0,
      make:          'RE',
      model:         address_line1.slice(0, 100),
      stock_no:      `MLS-${mls_number}-${Date.now()}`,
      status:        'active',
      mls_number,
      address_line1,
      city,
      state,
      zip,
      import_source: 'mls_import',
    }

    // Merge RentCast fields when available
    if (rentcastData) {
      if (rentcastData.bedrooms != null)      insertData.bedrooms     = rentcastData.bedrooms
      if (rentcastData.bathrooms != null)     insertData.bathrooms    = rentcastData.bathrooms
      if (rentcastData.squareFootage != null) insertData.sqft         = rentcastData.squareFootage
      if (rentcastData.lotSize != null)       insertData.lot_size     = rentcastData.lotSize
      if (rentcastData.yearBuilt != null)     insertData.year_built   = rentcastData.yearBuilt
      if (rentcastData.propertyType != null)  insertData.property_type = rentcastData.propertyType
      // Store raw response for debugging
      insertData.import_raw_json = rentcastData
    }

    const { data: newRow, error: insertError } = await supabase
      .from('vehicles')
      .insert(insertData)
      .select('id, mls_number, address_line1, city, state, zip, bedrooms, bathrooms, sqft, lot_size, year_built, property_type, status')
      .single()

    if (insertError) {
      console.error('[import-mls] insert failed:', insertError.message)
      return NextResponse.json({ error: 'Failed to create listing' }, { status: 500 })
    }

    return NextResponse.json(newRow, { status: 201 })
  } catch (_err) {
    console.error('[import-mls] unexpected error:', _err instanceof Error ? _err.message : _err)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
