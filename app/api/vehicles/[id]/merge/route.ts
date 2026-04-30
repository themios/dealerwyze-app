import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import { canAccessLedger } from '@/lib/auth/dealerRoles'
import { computeVehicleIntakeMerge, type VehicleIntakeIncoming } from '@/lib/vehicles/intakeMerge'

async function loadVehicleForMerge(supabase: Awaited<ReturnType<typeof createClient>>, id: string, orgId: string) {
  const { data: vehicle } = await supabase
    .from('vehicles')
    .select(`
      id,
      stock_no,
      vin,
      year,
      make,
      model,
      trim,
      mileage,
      color,
      purchase_price,
      purchased_from,
      purchased_at,
      acquisition_source,
      auction_name,
      auction_lot,
      acquisition_notes
    `)
    .eq('id', id)
    .eq('user_id', orgId)
    .single()

  return vehicle
}

async function authorizeAndLoad(id: string) {
  const profile = await requireProfile()

  if (!canAccessLedger(profile.role)) {
    return { profile, error: NextResponse.json({ error: 'Unauthorized' }, { status: 403 }) }
  }

  const supabase = await createClient()
  const vehicle = await loadVehicleForMerge(supabase, id, profile.org_id)

  if (!vehicle) {
    return { profile, supabase, error: NextResponse.json({ error: 'Not found' }, { status: 404 }) }
  }

  return { profile, supabase, vehicle }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const auth = await authorizeAndLoad(id)
  if (auth.error) return auth.error

  const body = await req.json().catch(() => ({})) as VehicleIntakeIncoming
  const preview = computeVehicleIntakeMerge(auth.vehicle, body)

  return NextResponse.json({
    ok: true,
    additions: preview.additions,
    ignored: preview.ignored,
    updated: preview.additions.length,
    deleted: [],
  })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const auth = await authorizeAndLoad(id)
  if (auth.error) return auth.error

  const body = await req.json().catch(() => ({})) as VehicleIntakeIncoming
  const merge = computeVehicleIntakeMerge(auth.vehicle, body)

  if (Object.keys(merge.patch).length === 0) {
    return NextResponse.json({ ok: true, updated: 0, additions: [], ignored: merge.ignored, deleted: [] })
  }

  const { error } = await auth.supabase
    .from('vehicles')
    .update(merge.patch)
    .eq('id', id)
    .eq('user_id', auth.profile.org_id)

  if (error) {
    console.error('[vehicle merge PATCH] db error:', error.message)
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    updated: merge.additions.length,
    additions: merge.additions,
    ignored: merge.ignored,
    deleted: [],
  })
}
