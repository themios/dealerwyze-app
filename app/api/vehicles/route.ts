import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/auth/profile'
import { matchVehicleWants } from '@/lib/vehicles/matchWants'

/**
 * POST /api/vehicles
 * Create a single vehicle (e.g. from onboarding "Add your first vehicle" or other flows).
 * Body: { vin?, year, make, model, trim?, price?, mileage?, status? }
 * Requires auth. Scoped to caller's org. Free tier cap (100 vehicles) enforced by DB trigger.
 */
export async function POST(req: NextRequest) {
  const profile = await requireProfile()
  const body = await req.json().catch(() => ({}))
  const { vin, year, make, model, trim, price, mileage, status = 'available' } = body
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

  const validStatuses = ['available', 'pending', 'staging', 'sold', 'sync_removed']
  const finalStatus = validStatuses.includes(status) ? status : 'available'

  const stockNo = cleanVin && cleanVin.length >= 6
    ? cleanVin.slice(-6)
    : `ONB-${Date.now().toString().slice(-6)}`

  // Auth client: RLS enforces org isolation for the vehicles INSERT; get_org_id() scopes the new row automatically.
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('vehicles')
    .insert({
      user_id: profile.org_id,
      stock_no: stockNo,
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
