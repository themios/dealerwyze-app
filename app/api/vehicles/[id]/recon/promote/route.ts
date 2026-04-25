import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import { isDealerAdmin } from '@/lib/auth/dealerRoles'
import { matchVehicleWants } from '@/lib/vehicles/matchWants'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const profile = await requireProfile()
  if (!isDealerAdmin(profile.role) && profile.role !== 'dealer_manager' && profile.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  // Auth client: RLS enforces org isolation for vehicles and recon_checklist_items reads, and the status update.
  const supabase = await createClient()

  const { data: vehicle } = await supabase
    .from('vehicles')
    .select('id, status, year, make, model, body_style, price')
    .eq('id', id)
    .eq('user_id', profile.org_id)
    .single()

  if (!vehicle) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (vehicle.status !== 'staging') return NextResponse.json({ error: 'Vehicle is not in staging' }, { status: 400 })

  const { data: blocking } = await supabase
    .from('recon_checklist_items')
    .select('label')
    .eq('vehicle_id', id)
    .eq('org_id', profile.org_id)
    .eq('is_required', true)
    .eq('checked', false)

  if (blocking && blocking.length > 0) {
    return NextResponse.json({
      error: 'Some required items are not done yet.',
      blocking_items: blocking.map(b => b.label),
    }, { status: 409 })
  }

  const { error } = await supabase
    .from('vehicles')
    .update({ status: 'available' })
    .eq('id', id)
    .eq('user_id', profile.org_id)

  if (error) return NextResponse.json({ error: 'Promote failed' }, { status: 500 })

  // Fire want-list match check after vehicle promoted to available
  matchVehicleWants({
    id: vehicle.id,
    user_id: profile.org_id,
    year: vehicle.year ?? null,
    make: vehicle.make ?? null,
    model: vehicle.model ?? null,
    body_style: vehicle.body_style ?? null,
    price: vehicle.price ?? null,
  }).catch(() => {})

  return NextResponse.json({ ok: true })
}
