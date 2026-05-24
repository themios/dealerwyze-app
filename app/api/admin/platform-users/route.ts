/**
 * GET  /api/admin/platform-users — list all platform users (all roles)
 * POST /api/admin/platform-users — invite a new platform user with any role
 * Superadmin only.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { requirePlatformSuperAdmin } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/service'
import { logAdminAction } from '@/lib/admin/audit'

export const dynamic = 'force-dynamic'

const VALID_ROLES = ['platform_admin', 'platform_staff_manager', 'platform_sales_manager', 'platform_staff'] as const
const VALID_AREAS = ['accounts','retention','sales','analytics','staff','tickets','alerts','audit','affiliates','commissions','billing']

export async function GET() {
  const profile = await requireProfile()
  const denied  = await requirePlatformSuperAdmin(profile.id)
  if (denied) return denied

  const service = createServiceClient()
  const { data: profiles, error } = await service
    .from('profiles')
    .select('id, display_name, created_at, platform_role, platform_permissions')
    .not('platform_role', 'is', null)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: 'Failed to load' }, { status: 500 })

  const ids = (profiles ?? []).map(p => p.id)
  const { data: { users: authUsers } } = await service.auth.admin.listUsers({ perPage: 1000 })
  const authMap = new Map((authUsers ?? []).filter(u => ids.includes(u.id)).map(u => [u.id, u]))

  const result = (profiles ?? []).map(p => ({
    id:                   p.id,
    display_name:         p.display_name,
    email:                authMap.get(p.id)?.email ?? null,
    last_sign_in_at:      authMap.get(p.id)?.last_sign_in_at ?? null,
    platform_role:        p.platform_role,
    platform_permissions: (p.platform_permissions as string[]) ?? [],
    created_at:           p.created_at,
  }))

  return NextResponse.json(result)
}

export async function POST(req: NextRequest) {
  const profile = await requireProfile()
  const denied  = await requirePlatformSuperAdmin(profile.id)
  if (denied) return denied

  const body = await req.json().catch(() => ({}))
  const { email, display_name, platform_role, platform_permissions = [] } = body

  if (!email?.trim() || !display_name?.trim()) {
    return NextResponse.json({ error: 'email and display_name required' }, { status: 400 })
  }
  if (!VALID_ROLES.includes(platform_role)) {
    return NextResponse.json({ error: `platform_role must be one of: ${VALID_ROLES.join(', ')}` }, { status: 400 })
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
  }
  const perms: string[] = (platform_permissions as string[]).filter(p => VALID_AREAS.includes(p))

  const service = createServiceClient()

  const { data: invited, error: inviteErr } = await service.auth.admin.inviteUserByEmail(email.trim(), {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/admin`,
  })
  if (inviteErr || !invited?.user) {
    const msg = inviteErr?.message ?? ''
    if (msg.toLowerCase().includes('already registered') || msg.toLowerCase().includes('already exists')) {
      return NextResponse.json({ error: 'An account with that email already exists.' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Failed to send invite.' }, { status: 500 })
  }

  const SENTINEL_ORG_ID = '00000000-0000-0000-0000-000000000001'
  await service.from('organizations').upsert(
    { id: SENTINEL_ORG_ID, name: 'Platform Staff Sentinel', plan: 'platform', subscription_status: 'active' },
    { onConflict: 'id', ignoreDuplicates: true }
  )

  const { error: profileErr } = await service.from('profiles').upsert({
    id: invited.user.id,
    display_name: display_name.trim(),
    role: 'agent',
    org_id: SENTINEL_ORG_ID,
    platform_role,
    platform_permissions: perms,
  }, { onConflict: 'id' })

  if (profileErr) {
    await service.auth.admin.deleteUser(invited.user.id)
    return NextResponse.json({ error: 'Failed to create profile.' }, { status: 500 })
  }

  await logAdminAction(profile.id, 'create_platform_user', null, { email, display_name, platform_role })
  return NextResponse.json({ id: invited.user.id, email, display_name, platform_role })
}
