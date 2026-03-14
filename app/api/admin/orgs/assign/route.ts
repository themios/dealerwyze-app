import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { requirePlatformArea } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

/**
 * PATCH /api/admin/orgs/assign
 * Body: { org_ids: string[], staff_id: string | null }
 * Bulk-assigns (or unassigns) dealerships to a platform staff member.
 * Superadmin only.
 */
export async function PATCH(req: NextRequest) {
  const profile = await requireProfile()
  const denied  = await requirePlatformArea(profile.id, 'staff')
  if (denied) return denied

  const body = await req.json().catch(() => null)
  if (!body || !Array.isArray(body.org_ids) || body.org_ids.length === 0) {
    return NextResponse.json({ error: 'org_ids array required' }, { status: 400 })
  }

  const orgIds:  string[]     = body.org_ids
  const staffId: string | null = body.staff_id ?? null

  // If staffId provided, verify it's a valid platform_staff profile
  if (staffId) {
    const service = createServiceClient()
    const { data: staffCheck } = await service
      .from('profiles')
      .select('id, platform_role')
      .eq('id', staffId)
      .eq('platform_role', 'platform_staff')
      .maybeSingle()
    if (!staffCheck) {
      return NextResponse.json({ error: 'Staff member not found' }, { status: 404 })
    }
  }

  const service = createServiceClient()
  const { error } = await service
    .from('organizations')
    .update({ assigned_staff_id: staffId })
    .in('id', orgIds)

  if (error) {
    // Column may not exist yet (migration 060 pending)
    if (error.message?.includes('assigned_staff_id')) {
      return NextResponse.json({ error: 'Migration 060 not yet applied. Apply in Supabase SQL editor first.' }, { status: 503 })
    }
    return NextResponse.json({ error: 'Assignment failed' }, { status: 500 })
  }

  return NextResponse.json({ updated: orgIds.length, staff_id: staffId })
}
