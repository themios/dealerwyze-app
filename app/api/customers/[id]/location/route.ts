import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import { logLocationAudit } from '@/lib/locations/logLocationAudit'

/** PATCH — set lead location (manual assignment). */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const profile = await requireProfile()
  const { id: customerId } = await params
  const supabase = await createClient()

  let body: { location_id?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const locationId = typeof body.location_id === 'string' ? body.location_id.trim() : ''
  if (!locationId) {
    return NextResponse.json({ error: 'location_id is required' }, { status: 400 })
  }

  const { data: existing } = await supabase
    .from('customers')
    .select('id')
    .eq('id', customerId)
    .eq('user_id', profile.org_id)
    .maybeSingle()

  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { data: location } = await supabase
    .from('dealer_locations')
    .select('id, name')
    .eq('id', locationId)
    .eq('org_id', profile.org_id)
    .eq('is_active', true)
    .maybeSingle()

  if (!location) {
    return NextResponse.json({ error: 'Invalid location' }, { status: 400 })
  }

  const { data: customer, error } = await supabase
    .from('customers')
    .update({
      location_id: locationId,
      location_source: 'manual',
    })
    .eq('id', customerId)
    .eq('user_id', profile.org_id)
    .select('*')
    .single()

  if (error || !customer) {
    return NextResponse.json({ error: error?.message ?? 'Update failed' }, { status: 500 })
  }

  logLocationAudit({
    orgId: profile.org_id,
    actorId: profile.id,
    action: 'lead_location_changed',
    entityType: 'customer',
    entityId: customerId,
    metadata: {
      location_id: locationId,
      location_source: 'manual',
      location_name: location.name,
    },
  })

  return NextResponse.json({ customer, location_name: location.name })
}
