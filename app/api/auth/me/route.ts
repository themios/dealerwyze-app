import { NextResponse } from 'next/server'
import { getProfile } from '@/lib/auth/profile'
import { canAccessAdminArea } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET() {
  const profile = await getProfile()
  if (!profile) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  const is_platform_admin = await canAccessAdminArea(profile.id)

  // Get platform_role + platform_permissions for role-aware UI
  let platform_role: string | null = null
  let platform_permissions: string[] = []
  if (is_platform_admin) {
    const service = createServiceClient()
    const { data } = await service
      .from('profiles')
      .select('platform_role, platform_permissions')
      .eq('id', profile.id)
      .maybeSingle()
    platform_role = data?.platform_role ?? null
    platform_permissions = (data?.platform_permissions as string[]) ?? []
  }

  return NextResponse.json({
    id: profile.id,
    role: profile.role,
    org_id: profile.org_id,
    display_name: profile.display_name,
    is_platform_admin,
    platform_role,
    platform_permissions,
  })
}
