/**
 * PATCH  /api/admin/platform-users/[id] — update role + permissions + display_name
 * DELETE /api/admin/platform-users/[id] — remove platform access
 * Superadmin only.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { requirePlatformSuperAdmin } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/service'
import { logAdminAction } from '@/lib/admin/audit'

export const dynamic = 'force-dynamic'

const VALID_ROLES = ['platform_admin', 'platform_staff_manager', 'platform_sales_manager', 'platform_staff']
const VALID_AREAS = ['accounts','retention','sales','analytics','staff','tickets','alerts','audit','affiliates','commissions','billing']

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await requireProfile()
  const denied  = await requirePlatformSuperAdmin(profile.id)
  if (denied) return denied

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const { display_name, platform_role, platform_permissions } = body

  const update: Record<string, unknown> = {}
  if (display_name?.trim()) update.display_name = display_name.trim()
  if (platform_role !== undefined) {
    if (!VALID_ROLES.includes(platform_role)) {
      return NextResponse.json({ error: 'Invalid platform_role' }, { status: 400 })
    }
    update.platform_role = platform_role
  }
  if (platform_permissions !== undefined) {
    update.platform_permissions = (platform_permissions as string[]).filter(p => VALID_AREAS.includes(p))
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const service = createServiceClient()
  const { error } = await service.from('profiles').update(update).eq('id', id)
  if (error) return NextResponse.json({ error: 'Failed to update' }, { status: 500 })

  await logAdminAction(profile.id, 'update_platform_user', null, { user_id: id, ...update })
  return NextResponse.json({ ok: true })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await requireProfile()
  const denied  = await requirePlatformSuperAdmin(profile.id)
  if (denied) return denied

  const { id } = await params

  // Prevent self-removal
  if (id === profile.id) {
    return NextResponse.json({ error: 'Cannot remove your own platform access' }, { status: 400 })
  }

  const service = createServiceClient()
  const { error } = await service
    .from('profiles')
    .update({ platform_role: null, platform_permissions: [] })
    .eq('id', id)

  if (error) return NextResponse.json({ error: 'Failed to remove access' }, { status: 500 })

  await logAdminAction(profile.id, 'remove_platform_user', null, { user_id: id })
  return NextResponse.json({ ok: true })
}
