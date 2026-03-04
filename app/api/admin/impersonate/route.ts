import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { canAccessAdminArea } from '@/lib/auth/platform'
import { buildStaffOrgCookie, clearStaffOrgCookie } from '@/lib/auth/staffSession'

/** POST /api/admin/impersonate { org_id } — start read-only impersonation session */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const canAccess = await canAccessAdminArea(user.id)
  if (!canAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { org_id } = await req.json()
  if (!org_id) return NextResponse.json({ error: 'org_id required' }, { status: 400 })

  // Verify the target org exists and is not the sentinel org
  const service = createServiceClient()
  const { data: org } = await service
    .from('organizations')
    .select('id, name')
    .eq('id', org_id)
    .neq('id', '00000000-0000-0000-0000-000000000001')
    .single()

  if (!org) return NextResponse.json({ error: 'Org not found' }, { status: 404 })

  // Log impersonation start
  await service.from('admin_audit_log').insert({
    admin_user_id: user.id,
    target_org_id: org_id,
    action: 'staff_impersonate_start',
    details: { org_name: org.name },
  })

  const cookie = buildStaffOrgCookie(org_id)
  const res = NextResponse.json({ success: true, org_id, org_name: org.name })
  res.cookies.set(cookie)
  return res
}

/** DELETE /api/admin/impersonate — end impersonation session */
export async function DELETE(_req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  await service.from('admin_audit_log').insert({
    admin_user_id: user.id,
    target_org_id: null,
    action: 'staff_impersonate_end',
    details: {},
  })

  const cookie = clearStaffOrgCookie()
  const res = NextResponse.json({ success: true })
  res.cookies.set(cookie)
  return res
}
