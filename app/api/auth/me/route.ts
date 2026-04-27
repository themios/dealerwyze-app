import { NextResponse } from 'next/server'
import { getProfile } from '@/lib/auth/profile'
import { canAccessAdminArea } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET() {
  const profile = await getProfile()
  if (!profile) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  const is_platform_admin = await canAccessAdminArea(profile.id)

  const service = createServiceClient()

  // Get platform_role + platform_permissions for role-aware UI
  let platform_role: string | null = null
  let platform_permissions: string[] = []
  if (is_platform_admin) {
    const { data } = await service
      .from('profiles')
      .select('platform_role, platform_permissions')
      .eq('id', profile.id)
      .maybeSingle()
    platform_role = data?.platform_role ?? null
    platform_permissions = (data?.platform_permissions as string[]) ?? []
  }

  // Fetch org plan for free-tier gating on the client
  const { data: org } = await service
    .from('organizations')
    .select('plan')
    .eq('id', profile.org_id)
    .maybeSingle()
  const org_plan = (org?.plan as string | null) ?? 'free'

  return NextResponse.json({
    id: profile.id,
    role: profile.role,
    org_id: profile.org_id,
    display_name: profile.display_name,
    is_platform_admin,
    platform_role,
    platform_permissions,
    org_plan,
  })
}
