import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/auth/profile'
import { matchVehicleWants } from '@/lib/vehicles/matchWants'

/**
 * POST /api/vehicles
 * Create a single vehicle or RE listing (e.g. from onboarding or other flows).
 * Dealer body: { vin?, year, make, model, trim?, price?, mileage?, status? }
 * RE listing body: { address, bedrooms?, bathrooms?, sqft?, mls_number?, price?, status? }
 * Requires auth. Scoped to caller's org. Free tier cap enforced by DB trigger.
 */
export async function POST(req: NextRequest) {
  const profile = await requireProfile()
  const supabase = await createClient()
  const body = await req.json().catch(() => ({}))

  // Determine vertical from org record (never trust request body for org_id).
  const { data: org } = await supabase
    .from('organizations')
    .select('vertical')
    .eq('id', profile.org_id)
    .single()
  const isRE = org?.vertical === 'real_estate'

  const validStatuses = ['available', 'pending', 'staging', 'sold', 'sync_removed']
  const finalStatus = validStatuses.includes(body.status) ? body.status : 'available'
  const stockNo = `ONB-${Date.now().toString().slice(-6)}`

  if (isRE) {
    // RE listing — address required, no year/make/model
    const address = body.address ? String(body.address).trim() : null
    if (!address) {
      return NextResponse.json({ error: 'Property address is required' }, { status: 400 })
    }

    const insertData: Record<string, unknown> = {
      user_id: profile.org_id,
      stock_no: stockNo,
      // year/make/model are NOT NULL in the schema — use placeholder values for RE listings
      year: 0,
      make: 'RE',
      model: address.slice(0, 100),
      address_line1: address,
      status: finalStatus,
    }
    if (body.price != null && body.price !== '')    insertData.price      = parseFloat(String(body.price))
    if (body.bedrooms != null)                       insertData.bedrooms   = parseInt(String(body.bedrooms), 10) || null
    if (body.bathrooms != null)                      insertData.bathrooms  = parseFloat(String(body.bathrooms)) || null
    if (body.sqft != null && body.sqft !== '')       insertData.sqft       = parseInt(String(body.sqft).replace(/\D/g, ''), 10) || null
    if (body.mls_number)                             insertData.mls_number = String(body.mls_number).trim() || null

    const { data, error } = await supabase
      .from('vehicles')
      .insert(insertData)
      .select('id')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message || 'Failed to add listing' }, { status: 500 })
    }
    return NextResponse.json({ id: data.id })
  }

  // ── Dealer vehicle path ────────────────────────────────────────────────────
  const { vin, year, make, model, trim, price, mileage } = body
  const cleanVin = vin ? String(vin).replace(/[^A-HJ-NPR-Z0-9]/gi, '').toUpperCase() : null

  if (!year || !make || !model) {
    return NextResponse.json(
      { error: 'Year, make, and model are required' },
      { status: 400 }
    )
  }

  const numYear = typeof year === 'number' ? year : parseInt(String(year), 10)
  if (isNaN(numYear) || numYear < 1900 || numYear > 2100) {
    return NextResponse.json({ error: 'Invalid year' }, { status: 400 })
  }

  const dealerStockNo = cleanVin && cleanVin.length >= 6
    ? cleanVin.slice(-6)
    : stockNo

  // Auth client: RLS enforces org isolation for the vehicles INSERT; get_org_id() scopes the new row automatically.
  const { data, error } = await supabase
    .from('vehicles')
    .insert({
      user_id: profile.org_id,
      stock_no: dealerStockNo,
      vin: cleanVin || null,
      year: numYear,
      make: String(make).trim(),
      model: String(model).trim(),
      trim: trim ? String(trim).trim() || null : null,
      price: price != null && price !== '' ? parseFloat(String(price)) : null,
      mileage: mileage != null && mileage !== '' ? parseInt(String(mileage).replace(/\D/g, ''), 10) || null : null,
      status: finalStatus,
    })
    .select('id')
    .single()

  if (error) {
    const msg = error.message || 'Failed to add vehicle'
    if (msg.includes('Free tier limit') || msg.includes('100 vehicles')) {
      return NextResponse.json(
        { error: 'You\'ve reached the 100-vehicle limit for the free beta. Contact support@dealerwyze.com to upgrade.' },
        { status: 403 }
      )
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  // Fire want-list match check for new available vehicles (fire-and-forget)
  if (finalStatus === 'available') {
    matchVehicleWants({
      id: data.id,
      user_id: profile.org_id,
      year: numYear,
      make: String(make).trim(),
      model: String(model).trim(),
      body_style: body.body_style ?? null,
      price: price != null && price !== '' ? parseFloat(String(price)) : null,
    }).catch(() => {})
  }

  return NextResponse.json({ id: data.id })
}
