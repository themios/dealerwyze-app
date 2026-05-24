import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { isPlatformSuperAdmin } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/service'
import { writeAuditLog } from '@/lib/audit/log'

export const dynamic = 'force-dynamic'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const profile = await requireProfile()
  const isSuperAdmin = await isPlatformSuperAdmin(profile.id)
  if (!isSuperAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const body = (await req.json().catch(() => null)) as { is_active?: unknown } | null
  if (!body || typeof body.is_active !== 'boolean') {
    return NextResponse.json({ error: 'is_active must be a boolean' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data: row, error } = await supabase
    .from('platform_social_accounts')
    .update({ is_active: body.is_active, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, platform, account_label, is_active')
    .single()

  if (error) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 })
  }

  await writeAuditLog({
    orgId: null,
    actorId: profile.id,
    actorType: 'staff',
    action: 'settings_updated',
    entityType: 'platform_social_accounts',
    entityId: id,
    metadata: { is_active: body.is_active },
  })

  return NextResponse.json({ data: row })
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const profile = await requireProfile()
  const isSuperAdmin = await isPlatformSuperAdmin(profile.id)
  if (!isSuperAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const supabase = createServiceClient()

  const { data: row, error: fetchError } = await supabase
    .from('platform_social_accounts')
    .select('id, platform, account_label')
    .eq('id', id)
    .single()

  if (fetchError || !row) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 })
  }

  const { error: deleteError } = await supabase
    .from('platform_social_accounts')
    .delete()
    .eq('id', id)

  if (deleteError) {
    return NextResponse.json({ error: 'Failed to remove account' }, { status: 500 })
  }

  await writeAuditLog({
    orgId: null,
    actorId: profile.id,
    actorType: 'staff',
    action: 'settings_updated',
    entityType: 'platform_social_accounts',
    entityId: id,
    metadata: {
      action: 'deleted',
      platform: row.platform,
      account_label: row.account_label,
    },
  })

  return NextResponse.json({ ok: true })
}
