import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import {
  isDealerAdminProfile,
  requireDealerAdminProfile,
} from '@/lib/settings/locationsAdmin'
import { logLocationAudit } from '@/lib/locations/logLocationAudit'

async function getOrgLocation(
  supabase: ReturnType<typeof createServiceClient>,
  orgId: string,
  locationId: string,
) {
  return supabase
    .from('dealer_locations')
    .select('id, org_id, name, address, phone, inventory_url, short_code, is_active, sort_order')
    .eq('id', locationId)
    .eq('org_id', orgId)
    .maybeSingle()
}

/** PATCH — update location fields. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const profileResult = await requireDealerAdminProfile()
  if (!isDealerAdminProfile(profileResult)) return profileResult
  const profile = profileResult
  const { id: locationId } = await params
  // Service client: settings mutation on org tables; auth enforced by requireDealerAdminProfile();
  // all queries scoped with .eq('org_id', ...).
  const supabase = createServiceClient()

  const { data: existing } = await getOrgLocation(supabase, profile.org_id, locationId)
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const patch: Record<string, string | boolean | null> = {
    updated_at: new Date().toISOString(),
  }

  if (body.name !== undefined) {
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name) return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 })
    patch.name = name
  }
  if (body.address !== undefined) {
    patch.address = typeof body.address === 'string' && body.address.trim() ? body.address.trim() : null
  }
  if (body.phone !== undefined) {
    patch.phone = typeof body.phone === 'string' && body.phone.trim() ? body.phone.trim() : null
  }
  if (body.inventory_url !== undefined) {
    patch.inventory_url = typeof body.inventory_url === 'string' && body.inventory_url.trim()
      ? body.inventory_url.trim()
      : null
  }
  if (body.short_code !== undefined) {
    const code = typeof body.short_code === 'string' ? body.short_code.trim().slice(0, 8) : ''
    patch.short_code = code || null
  }
  if (body.is_active !== undefined) {
    patch.is_active = !!body.is_active
  }

  if (Object.keys(patch).length === 1) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const { data: location, error } = await supabase
    .from('dealer_locations')
    .update(patch)
    .eq('id', locationId)
    .eq('org_id', profile.org_id)
    .select('id, org_id, name, address, phone, inventory_url, short_code, is_active, sort_order')
    .single()

  if (error || !location) {
    return NextResponse.json({ error: error?.message ?? 'Update failed' }, { status: 500 })
  }

  logLocationAudit({
    orgId: profile.org_id,
    actorId: profile.id,
    action: 'location_updated',
    entityType: 'dealer_location',
    entityId: location.id,
    metadata: { changed_keys: Object.keys(patch).filter(k => k !== 'updated_at') },
  })

  const { data: staffProfiles } = await supabase
    .from('profiles')
    .select('id, display_name, role')
    .eq('org_id', profile.org_id)
    .eq('location_id', locationId)
    .is('deactivated_at', null)

  return NextResponse.json({
    location: {
      ...location,
      staff: (staffProfiles ?? []).map(p => ({
        id: p.id,
        display_name: p.display_name ?? 'Unknown',
        role: p.role,
      })),
    },
  })
}

/** DELETE — soft delete (is_active = false). */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const profileResult = await requireDealerAdminProfile()
  if (!isDealerAdminProfile(profileResult)) return profileResult
  const profile = profileResult
  const { id: locationId } = await params
  // Service client: same justification as PATCH above.
  const supabase = createServiceClient()

  const { data: existing } = await getOrgLocation(supabase, profile.org_id, locationId)
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { data: location, error } = await supabase
    .from('dealer_locations')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', locationId)
    .eq('org_id', profile.org_id)
    .select('id, org_id, name, address, phone, inventory_url, short_code, is_active, sort_order')
    .single()

  if (error || !location) {
    return NextResponse.json({ error: error?.message ?? 'Delete failed' }, { status: 500 })
  }

  logLocationAudit({
    orgId: profile.org_id,
    actorId: profile.id,
    action: 'location_updated',
    entityType: 'dealer_location',
    entityId: location.id,
    metadata: { is_active: false, soft_deleted: true },
  })

  const { data: staffProfiles } = await supabase
    .from('profiles')
    .select('id, display_name, role')
    .eq('org_id', profile.org_id)
    .eq('location_id', locationId)
    .is('deactivated_at', null)

  return NextResponse.json({
    location: {
      ...location,
      staff: (staffProfiles ?? []).map(p => ({
        id: p.id,
        display_name: p.display_name ?? 'Unknown',
        role: p.role,
      })),
    },
  })
}
