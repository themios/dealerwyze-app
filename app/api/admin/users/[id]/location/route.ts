import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { canManageUsers, isDealerAdmin } from '@/lib/auth/dealerRoles'
import type { UserRole } from '@/types/index'
import { isValidOrgLocationId } from '@/lib/customers/listQuery'
import { logLocationAudit } from '@/lib/locations/logLocationAudit'

type Params = { params: Promise<{ id: string }> }

/** PATCH /api/admin/users/[id]/location — set staff home location (null = none). */
export async function PATCH(req: NextRequest, { params }: Params) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: callerProfile } = await supabase
    .from('profiles')
    .select('role, org_id')
    .eq('id', user.id)
    .single()

  if (!callerProfile || !canManageUsers(callerProfile.role as UserRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id: targetId } = await params
  // Service client: target profile lookup and update need to bypass RLS (callerProfile is already
  // verified above). All queries scoped with .eq('org_id', callerProfile.org_id).
  const service = createServiceClient()

  const { data: target } = await service
    .from('profiles')
    .select('id, org_id, role, location_id')
    .eq('id', targetId)
    .maybeSingle()

  if (!target || target.org_id !== callerProfile.org_id) {
    return NextResponse.json({ error: 'Not in your org' }, { status: 403 })
  }

  if (isDealerAdmin(target.role as UserRole) || target.id === target.org_id) {
    return NextResponse.json({ error: 'Cannot assign a location to an admin or owner' }, { status: 400 })
  }

  let body: { location_id?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  let nextLocationId: string | null = null
  if (body.location_id === null || body.location_id === '' || body.location_id === 'none') {
    nextLocationId = null
  } else if (typeof body.location_id === 'string' && body.location_id.trim()) {
    const valid = await isValidOrgLocationId(service, callerProfile.org_id, body.location_id.trim())
    if (!valid) {
      return NextResponse.json({ error: 'Invalid location' }, { status: 400 })
    }
    nextLocationId = body.location_id.trim()
  } else {
    return NextResponse.json({ error: 'location_id must be a location id or null' }, { status: 400 })
  }

  const { data: updated, error } = await service
    .from('profiles')
    .update({ location_id: nextLocationId })
    .eq('id', targetId)
    .eq('org_id', callerProfile.org_id)
    .select('id, location_id')
    .single()

  if (error || !updated) {
    return NextResponse.json({ error: error?.message ?? 'Update failed' }, { status: 500 })
  }

  logLocationAudit({
    orgId: callerProfile.org_id,
    actorId: user.id,
    action: nextLocationId ? 'location_staff_assigned' : 'location_staff_removed',
    entityType: 'profile',
    entityId: targetId,
    metadata: { location_id: nextLocationId },
  })

  let location_name: string | null = null
  if (updated.location_id) {
    const { data: loc } = await service
      .from('dealer_locations')
      .select('name')
      .eq('id', updated.location_id)
      .eq('org_id', callerProfile.org_id)
      .maybeSingle()
    location_name = loc?.name ?? null
  }

  return NextResponse.json({
    id: updated.id,
    location_id: updated.location_id,
    location_name,
  })
}
