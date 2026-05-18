import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import {
  isDealerAdminProfile,
  requireDealerAdminProfile,
} from '@/lib/settings/locationsAdmin'
import type { LocationStaffMember, SettingsLocationRow } from '@/lib/settings/locationsTypes'
import { logLocationAudit } from '@/lib/locations/logLocationAudit'

/** GET — list org locations (all, including inactive) with assigned staff. */
export async function GET() {
  const profileResult = await requireDealerAdminProfile()
  if (!isDealerAdminProfile(profileResult)) return profileResult
  const profile = profileResult
  // Service client: reads dealer_locations + profiles across org tables; auth is
  // enforced by requireDealerAdminProfile() above; all queries filtered by org_id.
  const supabase = createServiceClient()

  const [{ data: locations, error: locErr }, { data: profiles, error: profErr }] = await Promise.all([
    supabase
      .from('dealer_locations')
      .select('id, org_id, name, address, phone, inventory_url, is_active, sort_order')
      .eq('org_id', profile.org_id)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true }),
    supabase
      .from('profiles')
      .select('id, display_name, role, location_id')
      .eq('org_id', profile.org_id)
      .is('deactivated_at', null),
  ])

  if (locErr) {
    return NextResponse.json({ error: locErr.message }, { status: 500 })
  }
  if (profErr) {
    return NextResponse.json({ error: profErr.message }, { status: 500 })
  }

  const staffByLocation = new Map<string, LocationStaffMember[]>()
  const unassignedReps: LocationStaffMember[] = []

  for (const p of profiles ?? []) {
    const member: LocationStaffMember = {
      id: p.id,
      display_name: p.display_name ?? 'Unknown',
      role: p.role,
    }
    if (p.role === 'dealer_rep' && !p.location_id) {
      unassignedReps.push(member)
    }
    if (p.location_id) {
      const list = staffByLocation.get(p.location_id) ?? []
      list.push(member)
      staffByLocation.set(p.location_id, list)
    }
  }

  const rows: SettingsLocationRow[] = (locations ?? []).map(loc => ({
    ...loc,
    staff: staffByLocation.get(loc.id) ?? [],
  }))

  return NextResponse.json({ locations: rows, unassigned_reps: unassignedReps })
}

/** POST — create a new location. */
export async function POST(req: NextRequest) {
  const profileResult = await requireDealerAdminProfile()
  if (!isDealerAdminProfile(profileResult)) return profileResult
  const profile = profileResult
  // Service client: same justification as GET above.
  const supabase = createServiceClient()

  let body: {
    name?: unknown
    address?: unknown
    phone?: unknown
    inventory_url?: unknown
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  const address = typeof body.address === 'string' ? body.address.trim() || null : null
  const phone = typeof body.phone === 'string' ? body.phone.trim() || null : null
  const inventory_url = typeof body.inventory_url === 'string' ? body.inventory_url.trim() || null : null

  const { data: maxRow } = await supabase
    .from('dealer_locations')
    .select('sort_order')
    .eq('org_id', profile.org_id)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  const sort_order = (maxRow?.sort_order ?? -1) + 1
  const now = new Date().toISOString()

  const { data: location, error } = await supabase
    .from('dealer_locations')
    .insert({
      org_id: profile.org_id,
      name,
      address,
      phone,
      inventory_url,
      is_active: true,
      sort_order,
      updated_at: now,
    })
    .select('id, org_id, name, address, phone, inventory_url, is_active, sort_order')
    .single()

  if (error || !location) {
    return NextResponse.json({ error: error?.message ?? 'Create failed' }, { status: 500 })
  }

  logLocationAudit({
    orgId: profile.org_id,
    actorId: profile.id,
    action: 'location_created',
    entityType: 'dealer_location',
    entityId: location.id,
    metadata: { name: location.name },
  })

  return NextResponse.json({ location: { ...location, staff: [] } })
}
