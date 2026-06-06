import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import {
  DEALER_REP_ROLE,
  isDealerAdminProfile,
  requireDealerAdminProfile,
} from '@/lib/settings/locationsAdmin'
import { logLocationAudit } from '@/lib/locations/logLocationAudit'
import { apiError } from '@/lib/api/errorHandler'

/** PATCH — assign or remove a dealer_rep from this location. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const profileResult = await requireDealerAdminProfile()
  if (!isDealerAdminProfile(profileResult)) return profileResult
  const profile = profileResult
  const { id: locationId } = await params
  // Service client: writes profiles.location_id across org tables; auth enforced by
  // requireDealerAdminProfile(); all queries scoped with .eq('org_id', ...).
  const supabase = createServiceClient()

  const { data: location } = await supabase
    .from('dealer_locations')
    .select('id')
    .eq('id', locationId)
    .eq('org_id', profile.org_id)
    .maybeSingle()

  if (!location) {
    return NextResponse.json({ error: 'Location not found' }, { status: 404 })
  }

  let body: { profile_id?: unknown; action?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const profileId = typeof body.profile_id === 'string' ? body.profile_id.trim() : ''
  const action = body.action === 'remove' ? 'remove' : body.action === 'assign' ? 'assign' : null

  if (!profileId || !action) {
    return NextResponse.json({ error: 'profile_id and action (assign|remove) are required' }, { status: 400 })
  }

  const { data: target } = await supabase
    .from('profiles')
    .select('id, role, location_id, org_id')
    .eq('id', profileId)
    .eq('org_id', profile.org_id)
    .is('deactivated_at', null)
    .maybeSingle()

  if (!target) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  }

  if (target.role !== DEALER_REP_ROLE) {
    return NextResponse.json({ error: 'Only sales reps can be assigned to a location' }, { status: 400 })
  }

  if (action === 'assign') {
    if (target.location_id && target.location_id !== locationId) {
      return NextResponse.json({ error: 'Rep is already assigned to another location' }, { status: 400 })
    }
    const { error } = await supabase
      .from('profiles')
      .update({ location_id: locationId })
      .eq('id', profileId)
      .eq('org_id', profile.org_id)

    if (error) {
      return apiError(error, {
        route: 'PATCH /api/settings/locations/[id]/staff',
        action: 'assign_staff',
        userId: profile.id,
        orgId: profile.org_id,
      })
    }
    logLocationAudit({
      orgId: profile.org_id,
      actorId: profile.id,
      action: 'location_staff_assigned',
      entityType: 'profile',
      entityId: profileId,
      metadata: { location_id: locationId },
    })
  } else {
    if (target.location_id !== locationId) {
      return NextResponse.json({ error: 'Rep is not assigned to this location' }, { status: 400 })
    }
    const { error } = await supabase
      .from('profiles')
      .update({ location_id: null })
      .eq('id', profileId)
      .eq('org_id', profile.org_id)

    if (error) {
      return apiError(error, {
        route: 'PATCH /api/settings/locations/[id]/staff',
        action: 'remove_staff',
        userId: profile.id,
        orgId: profile.org_id,
      })
    }
    logLocationAudit({
      orgId: profile.org_id,
      actorId: profile.id,
      action: 'location_staff_removed',
      entityType: 'profile',
      entityId: profileId,
      metadata: { location_id: locationId },
    })
  }

  const [{ data: locationRow }, { data: staffProfiles }] = await Promise.all([
    supabase
      .from('dealer_locations')
      .select('id, name, address, phone, is_active')
      .eq('id', locationId)
      .eq('org_id', profile.org_id)
      .maybeSingle(),
    supabase
      .from('profiles')
      .select('id, display_name, role')
      .eq('org_id', profile.org_id)
      .eq('location_id', locationId)
      .is('deactivated_at', null),
  ])

  return NextResponse.json({
    location: locationRow ?? { id: locationId },
    staff: (staffProfiles ?? []).map(p => ({
      id: p.id,
      display_name: p.display_name ?? 'Unknown',
      role: p.role,
    })),
  })
}
