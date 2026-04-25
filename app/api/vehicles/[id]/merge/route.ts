import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import { canAccessLedger } from '@/lib/auth/dealerRoles'

const VIN_REGEX = /^[A-HJ-NPR-Z0-9]{17}$/i

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const profile = await requireProfile()

  if (!canAccessLedger(profile.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  // Auth client: RLS enforces org isolation for the vehicle read and field-merge update.
  const supabase = await createClient()

  // Verify vehicle belongs to this org
  const { data: vehicle } = await supabase
    .from('vehicles')
    .select('id, vin, trim, mileage, color')
    .eq('id', id)
    .eq('user_id', profile.org_id)
    .single()

  if (!vehicle) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const patch: Record<string, unknown> = {}

  // Only fill fields that are currently null/empty — never overwrite existing data
  if (!vehicle.vin && body.vin && VIN_REGEX.test(String(body.vin))) {
    patch.vin = String(body.vin).toUpperCase()
  }
  if (!vehicle.trim && body.trim) {
    patch.trim = String(body.trim).trim().slice(0, 60)
  }
  if (!vehicle.mileage && body.mileage) {
    const parsed = parseInt(String(body.mileage))
    if (!isNaN(parsed)) patch.mileage = parsed
  }
  if (!vehicle.color && body.color) {
    patch.color = String(body.color).trim().slice(0, 40)
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: true, updated: 0 })
  }

  const { error } = await supabase
    .from('vehicles')
    .update(patch)
    .eq('id', id)
    .eq('user_id', profile.org_id)

  if (error) {
    console.error('[vehicle merge PATCH] db error:', error.message)
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, updated: Object.keys(patch).length })
}
