import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requirePlatformSuperAdmin } from '@/lib/auth/platform'

type Params = { params: Promise<{ id: string }> }

/** POST /api/admin/transfers/[id]/approve — execute the ownership transfer */
export async function POST(_req: NextRequest, { params }: Params) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const denied = await requirePlatformSuperAdmin(user.id)
  if (denied) return denied

  const { id: transferId } = await params
  const service = createServiceClient()

  // 1. Fetch the transfer and validate it's ready
  const { data: transfer } = await service
    .from('business_transfers')
    .select('id, org_id, initiated_by, new_owner_user_id, status')
    .eq('id', transferId)
    .single()

  if (!transfer) {
    return NextResponse.json({ error: 'Transfer not found' }, { status: 404 })
  }
  if (transfer.status !== 'pending_approval') {
    return NextResponse.json(
      { error: `Cannot approve transfer with status: ${transfer.status}` },
      { status: 400 }
    )
  }
  if (!transfer.new_owner_user_id) {
    return NextResponse.json({ error: 'Transfer has not been claimed yet' }, { status: 400 })
  }

  // 2. Get old owner's auth user id (need for signOut)
  const { data: oldOwnerProfile } = await service
    .from('profiles')
    .select('id, user_id')
    .eq('id', transfer.initiated_by)
    .single()

  if (!oldOwnerProfile) {
    return NextResponse.json({ error: 'Could not find current owner profile' }, { status: 500 })
  }

  // 3. Update new owner: set role=dealer_admin + org_id on their profile
  const { error: newOwnerErr } = await service
    .from('profiles')
    .update({ role: 'dealer_admin', org_id: transfer.org_id })
    .eq('id', transfer.new_owner_user_id)

  if (newOwnerErr) {
    return NextResponse.json({ error: 'Failed to update new owner profile' }, { status: 500 })
  }

  // 4. Deactivate old owner
  const { error: deactivateErr } = await service
    .from('profiles')
    .update({ deactivated_at: new Date().toISOString() })
    .eq('id', transfer.initiated_by)

  if (deactivateErr) {
    return NextResponse.json({ error: 'Failed to deactivate old owner' }, { status: 500 })
  }

  // Sign out old owner globally (non-fatal)
  if (oldOwnerProfile.user_id) {
    await service.auth.admin.signOut(oldOwnerProfile.user_id, 'global').catch(() => null)
  }

  // 5. Mark transfer complete
  const now = new Date().toISOString()
  await service
    .from('business_transfers')
    .update({
      status:       'completed',
      approved_by:  user.id,
      approved_at:  now,
      completed_at: now,
    })
    .eq('id', transferId)

  // 6. Audit log
  await service.from('admin_audit_log').insert({
    admin_user_id: user.id,
    target_org_id: transfer.org_id,
    action:        'transfer_ownership',
    details: {
      from_profile: transfer.initiated_by,
      to_profile:   transfer.new_owner_user_id,
      transfer_id:  transferId,
    },
  })

  return NextResponse.json({ success: true })
}

/** DELETE /api/admin/transfers/[id]/approve — reject / cancel the transfer */
export async function DELETE(req: NextRequest, { params }: Params) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const denied = await requirePlatformSuperAdmin(user.id)
  if (denied) return denied

  const { id: transferId } = await params
  const body = await req.json().catch(() => ({}))
  const reason: string = body.reason ?? 'Transfer not approved.'

  const service = createServiceClient()

  const { data: transfer } = await service
    .from('business_transfers')
    .select('id, org_id, status')
    .eq('id', transferId)
    .single()

  if (!transfer) return NextResponse.json({ error: 'Transfer not found' }, { status: 404 })

  await service
    .from('business_transfers')
    .update({ status: 'cancelled' })
    .eq('id', transferId)

  await service.from('admin_audit_log').insert({
    admin_user_id: user.id,
    target_org_id: transfer.org_id,
    action:        'reject_transfer',
    details:       { transfer_id: transferId, reason },
  })

  return NextResponse.json({ success: true })
}
