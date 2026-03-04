import { NextResponse } from 'next/server'
import { getProfile } from '@/lib/auth/profile'
import { canAccessAdminArea } from '@/lib/auth/platform'

export async function GET() {
  const profile = await getProfile()
  if (!profile) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  const is_platform_admin = await canAccessAdminArea(profile.id)
  return NextResponse.json({
    id: profile.id,
    role: profile.role,
    org_id: profile.org_id,
    is_platform_admin,
  })
}
