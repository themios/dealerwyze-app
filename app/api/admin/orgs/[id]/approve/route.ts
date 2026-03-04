import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requirePlatformSuperAdmin } from '@/lib/auth/platform'

type Params = { params: Promise<{ id: string }> }

/** POST /api/admin/orgs/[id]/approve — approve a pending org */
export async function POST(req: NextRequest, { params }: Params) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const denied = await requirePlatformSuperAdmin(user.id)
  if (denied) return denied

  const { id: orgId } = await params
  const service = createServiceClient()

  const { error } = await service
    .from('organizations')
    .update({ approved_at: new Date().toISOString(), approved_by: user.id, rejection_reason: null })
    .eq('id', orgId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Log to audit trail
  await service.from('admin_audit_log').insert({
    admin_user_id: user.id,
    target_org_id: orgId,
    action: 'approve_org',
    details: { approved_at: new Date().toISOString() },
  })

  return NextResponse.json({ success: true })
}

/** DELETE /api/admin/orgs/[id]/approve — reject a pending org */
export async function DELETE(req: NextRequest, { params }: Params) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const denied = await requirePlatformSuperAdmin(user.id)
  if (denied) return denied

  const { id: orgId } = await params
  const body = await req.json().catch(() => ({}))
  const reason: string = body.reason ?? 'Application not approved.'

  const service = createServiceClient()

  const { error } = await service
    .from('organizations')
    .update({ rejection_reason: reason, approved_at: null })
    .eq('id', orgId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await service.from('admin_audit_log').insert({
    admin_user_id: user.id,
    target_org_id: orgId,
    action: 'reject_org',
    details: { reason },
  })

  return NextResponse.json({ success: true })
}
