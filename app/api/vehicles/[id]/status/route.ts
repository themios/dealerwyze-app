import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/auth/profile'
import { matchVehicleWants } from '@/lib/vehicles/matchWants'

// PATCH /api/vehicles/[id]/status
// Restore a sync_removed vehicle to available (dealer confirmed it's still in stock).
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await requireProfile()
  const { id } = await params
  const body = await req.json()

  const status = body?.status
  if (!['available', 'pending'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const supabase = await createClient()

  // Fetch vehicle details before update (needed for match engine)
  const { data: vehicle } = status === 'available'
    ? await supabase.from('vehicles').select('id, year, make, model, body_style, price').eq('id', id).eq('user_id', profile.org_id).single()
    : { data: null }

  const { data: currentVehicle } = await supabase
    .from('vehicles')
    .select('status')
    .eq('id', id)
    .eq('user_id', profile.org_id)
    .maybeSingle()

  const updates: Record<string, unknown> = { status, sync_removed_at: null }
  // If this was accidentally marked sold, fully restore to active inventory state.
  if (currentVehicle?.status === 'sold' && (status === 'available' || status === 'pending')) {
    updates.sold_price = null
    updates.sold_at = null
    updates.sold_to_customer_id = null
    updates.finance_type = null
    updates.finance_company = null
  }

  const { error } = await supabase
    .from('vehicles')
    .update(updates)
    .eq('id', id)
    .eq('user_id', profile.org_id)

  if (error) return NextResponse.json({ error: 'Update failed' }, { status: 500 })

  // Fire want-list match check when vehicle becomes available
  if (status === 'available' && vehicle) {
    matchVehicleWants({
      id: vehicle.id,
      user_id: profile.org_id,
      year: vehicle.year,
      make: vehicle.make,
      model: vehicle.model,
      body_style: vehicle.body_style ?? null,
      price: vehicle.price ?? null,
    }).catch(() => {})
  }

  return NextResponse.json({ ok: true })
}
