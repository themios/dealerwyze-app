import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'
import { requirePlatformSuperAdmin } from '@/lib/auth/platform'

type Params = { params: Promise<{ id: string }> }

/** POST /api/admin/orgs/[id]/approve — approve a pending org */
export async function POST(req: NextRequest, { params }: Params) {
  const profile = await requireProfile()

  const denied = await requirePlatformSuperAdmin(profile.id)
  if (denied) return denied

  const { id: orgId } = await params
  const service = createServiceClient()

  const { error } = await service
    .from('organizations')
    .update({ approved_at: new Date().toISOString(), approved_by: profile.id, rejection_reason: null })
    .eq('id', orgId)

  if (error) {
    console.error('[admin/orgs/:id/approve][POST] Failed approving org:', error)
    return NextResponse.json({ error: 'An error occurred. Please try again.' }, { status: 500 })
  }

  // Log to audit trail
  await service.from('admin_audit_log').insert({
    admin_user_id: profile.id,
    target_org_id: orgId,
    action: 'approve_org',
    details: { approved_at: new Date().toISOString() },
  })

  return NextResponse.json({ success: true })
}

/** DELETE /api/admin/orgs/[id]/approve — reject a pending org */
export async function DELETE(req: NextRequest, { params }: Params) {
  const profile = await requireProfile()

  const denied = await requirePlatformSuperAdmin(profile.id)
  if (denied) return denied

  const { id: orgId } = await params
  const body = await req.json().catch((err) => {
    console.error('[admin/orgs/:id/approve][DELETE] Failed to parse request body:', err)
    return {}
  })
  const reason: string = body.reason ?? 'Application not approved.'

  const service = createServiceClient()

  const { error } = await service
    .from('organizations')
    .update({ rejection_reason: reason, approved_at: null })
    .eq('id', orgId)

  if (error) {
    console.error('[admin/orgs/:id/approve][DELETE] Failed rejecting org:', error)
    return NextResponse.json({ error: 'An error occurred. Please try again.' }, { status: 500 })
  }

  await service.from('admin_audit_log').insert({
    admin_user_id: profile.id,
    target_org_id: orgId,
    action: 'reject_org',
    details: { reason },
  })

  return NextResponse.json({ success: true })
}
