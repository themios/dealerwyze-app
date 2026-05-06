import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { canManageUsers } from '@/lib/auth/dealerRoles'
import type { UserRole } from '@/types/index'
import { logOrgAudit } from '@/lib/audit/orgAudit'
import { writeAuditLog } from '@/lib/audit/log'

const ALLOWED_DEALER_ROLES: UserRole[] = [
  'dealer_admin',
  'dealer_manager',
  'dealer_finance',
  'dealer_rep',
  'dealer_staff',
]

type Params = { params: Promise<{ id: string }> }

/** PATCH /api/admin/users/[id] — change role of a user in this org */
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
  if (targetId === user.id) {
    return NextResponse.json({ error: 'Cannot change your own role' }, { status: 400 })
  }

  const { role: newRole } = await req.json()
  if (!ALLOWED_DEALER_ROLES.includes(newRole)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  }

  const service = createServiceClient()

  // Verify target is in same org
  const { data: target } = await service.from('profiles').select('org_id, role').eq('id', targetId).single()
  if (!target || target.org_id !== callerProfile.org_id) {
    return NextResponse.json({ error: 'Not in your org' }, { status: 403 })
  }

  const fromRole = target.role as string

  const { error } = await service
    .from('profiles')
    .update({ role: newRole })
    .eq('id', targetId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  void writeAuditLog({
    orgId:      callerProfile.org_id,
    actorId:    user.id,
    actorType:  'user',
    action:     'role_changed',
    entityType: 'profile',
    entityId:   targetId,
    metadata:   { from_role: fromRole, to_role: newRole },
  })

  void logOrgAudit({ org_id: callerProfile.org_id, actor_id: user.id, actor_type: 'user',
    action: 'user_role_changed', details: { target_user_id: targetId, new_role: newRole } })

  return NextResponse.json({ success: true, role: newRole })
}

/** POST /api/admin/users/[id] — reactivate a deactivated user */
export async function POST(req: NextRequest, { params }: Params) {
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
  const service = createServiceClient()

  const { data: target } = await service.from('profiles').select('org_id').eq('id', targetId).single()
  if (target?.org_id !== callerProfile.org_id) {
    return NextResponse.json({ error: 'Not in your org' }, { status: 403 })
  }

  const { error } = await service
    .from('profiles')
    .update({ deactivated_at: null })
    .eq('id', targetId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
