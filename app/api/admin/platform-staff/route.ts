import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { requirePlatformSuperAdmin } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/service'
import { logAdminAction } from '@/lib/admin/audit'

/** GET /api/admin/platform-staff — list all platform staff */
export async function GET() {
  const profile = await requireProfile()
  const denied = await requirePlatformSuperAdmin(profile.id)
  if (denied) return denied

  const service = createServiceClient()
  const { data, error } = await service
    .from('profiles')
    .select('id, display_name, created_at')
    .eq('platform_role', 'platform_staff')
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

/**
 * POST /api/admin/platform-staff
 * Body: { email, display_name, password }
 * Creates a platform staff user (no org affiliation).
 */
export async function POST(req: NextRequest) {
  const profile = await requireProfile()
  const denied = await requirePlatformSuperAdmin(profile.id)
  if (denied) return denied

  const { email, display_name, password } = await req.json() as {
    email?: string
    display_name?: string
    password?: string
  }
  if (!email || !display_name || !password) {
    return NextResponse.json({ error: 'email, display_name, and password are required' }, { status: 400 })
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
  }

  const service = createServiceClient()

  // Create auth user
  const { data: created, error: createErr } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (createErr || !created.user) {
    return NextResponse.json({ error: createErr?.message || 'Failed to create user' }, { status: 500 })
  }

  // Create profile with platform_staff role using sentinel org (no real dealership)
  const SENTINEL_ORG_ID = '00000000-0000-0000-0000-000000000001'
  const { error: profileErr } = await service.from('profiles').insert({
    id: created.user.id,
    display_name,
    role: 'agent',               // tenant role irrelevant for platform staff
    org_id: SENTINEL_ORG_ID,
    platform_role: 'platform_staff',
  })

  if (profileErr) {
    // Cleanup auth user on profile failure
    await service.auth.admin.deleteUser(created.user.id)
    return NextResponse.json({ error: profileErr.message }, { status: 500 })
  }

  await logAdminAction(profile.id, 'create_platform_staff', null, { email, display_name })

  return NextResponse.json({ id: created.user.id, email, display_name })
}

/**
 * DELETE /api/admin/platform-staff?id=uuid
 * Removes platform_role from the user (demotes to normal user or deletes).
 */
export async function DELETE(req: NextRequest) {
  const profile = await requireProfile()
  const denied = await requirePlatformSuperAdmin(profile.id)
  if (denied) return denied

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const service = createServiceClient()
  const { error } = await service
    .from('profiles')
    .update({ platform_role: null })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAdminAction(profile.id, 'remove_platform_staff', null, { user_id: id })
  return NextResponse.json({ ok: true })
}
