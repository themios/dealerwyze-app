import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'
import { requirePlatformSuperAdmin } from '@/lib/auth/platform'
import { buildStaffOrgCookie, clearStaffOrgCookie, getStaffSessionInfo } from '@/lib/auth/staffSession'
import { logOrgAudit } from '@/lib/audit/orgAudit'
import { writeAuditLog } from '@/lib/audit/log'
import { getAdminVerticalScope } from '@/lib/admin/verticalScope'

/**
 * POST /api/admin/impersonate { org_id, write_mode? }
 * write_mode=false (default) — read-only view; mutations blocked by proxy.ts
 * write_mode=true            — Remote Admin mode; mutations allowed, all audited
 */
export async function POST(req: NextRequest) {
  const profile = await requireProfile()
  const denied = await requirePlatformSuperAdmin(profile.id)
  if (denied) return denied

  const { org_id, write_mode = false } = await req.json()
  if (!org_id) return NextResponse.json({ error: 'org_id required' }, { status: 400 })

  // Verify the target org belongs to the current vertical (critical for multi-vertical isolation)
  const scope = await getAdminVerticalScope(req)
  if (!scope.orgIds.includes(org_id)) {
    return NextResponse.json({ error: 'Org not found' }, { status: 404 })
  }

  // Verify the target org exists and is not the sentinel org
  const service = createServiceClient()
  const { data: org } = await service
    .from('organizations')
    .select('id, name')
    .eq('id', org_id)
    .neq('id', '00000000-0000-0000-0000-000000000001')
    .single()

  if (!org) return NextResponse.json({ error: 'Org not found' }, { status: 404 })

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
  const action = write_mode ? 'staff_remote_admin_start' : 'staff_impersonate_start'

  // Log start — distinguish read-only vs write-enabled for audit
  await service.from('admin_audit_log').insert({
    admin_user_id: profile.id,
    target_org_id: org_id,
    action,
    details: { org_name: org.name, write_mode: !!write_mode, ip },
  })

  // Also write to org_audit_log so the org's events are queryable by org_id
  void logOrgAudit({ org_id, actor_id: profile.id, actor_type: 'staff', action, ip,
    details: { org_name: org.name, write_mode: !!write_mode } })

  void writeAuditLog({
    orgId:     org_id,
    actorId:   profile.id,
    actorType: 'staff',
    action:    'impersonation_start',
    metadata:  { write_mode: !!write_mode, org_name: org.name },
    ipAddress: ip,
  })

  const cookie = buildStaffOrgCookie(org_id, !!write_mode)
  const res = NextResponse.json({ success: true, org_id, org_name: org.name, write_mode: !!write_mode })
  res.cookies.set(cookie)
  return res
}

/** DELETE /api/admin/impersonate — end impersonation session */
export async function DELETE() {
  const profile = await requireProfile()
  const denied = await requirePlatformSuperAdmin(profile.id)
  if (denied) return denied

  // Read the staff session cookie before clearing it so we can log the org that was impersonated
  const cookieStore = await cookies()
  const staffSession = getStaffSessionInfo(cookieStore)

  const service = createServiceClient()
  await service.from('admin_audit_log').insert({
    admin_user_id: profile.id,
    target_org_id: staffSession?.orgId ?? null,
    action: 'staff_impersonate_end',
    details: { write_mode: staffSession?.writeMode ?? false },
  })

  if (staffSession?.orgId) {
    void logOrgAudit({ org_id: staffSession.orgId, actor_id: profile.id, actor_type: 'staff',
      action: 'staff_impersonate_end', details: { write_mode: staffSession.writeMode ?? false } })
  }

  void writeAuditLog({
    orgId:     staffSession?.orgId ?? null,
    actorId:   profile.id,
    actorType: 'staff',
    action:    'impersonation_end',
    metadata:  { write_mode: staffSession?.writeMode ?? false },
  })

  const cookie = clearStaffOrgCookie()
  const res = NextResponse.json({ success: true })
  res.cookies.set(cookie)
  return res
}
