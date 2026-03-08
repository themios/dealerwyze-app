/**
 * GET    /api/admin/affiliates/[code]  — fetch a single affiliate code
 * PATCH  /api/admin/affiliates/[code]  — update editable fields
 * DELETE /api/admin/affiliates/[code]  — deactivate (soft delete via is_active=false)
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { requirePlatformSuperAdmin } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const profile = await requireProfile()
  const denied  = await requirePlatformSuperAdmin(profile.id)
  if (denied) return denied

  const { code } = await params
  const supabase  = createServiceClient()

  const { data, error } = await supabase
    .from('affiliate_codes')
    .select('*')
    .eq('code', code)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Affiliate code not found' }, { status: 404 })
  }

  return NextResponse.json({ affiliate: data })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const profile = await requireProfile()
  const denied  = await requirePlatformSuperAdmin(profile.id)
  if (denied) return denied

  const { code } = await params
  const body = await req.json().catch(() => ({}))

  const {
    owner_name,
    owner_email,
    notes,
    type,
    commission_first_pct,
    commission_recurring_pct,
    is_active,
  } = body

  // Build update payload — only include provided fields
  const update: Record<string, unknown> = {}
  if (owner_name               !== undefined) update.owner_name               = owner_name
  if (owner_email              !== undefined) update.owner_email              = owner_email ?? null
  if (notes                    !== undefined) update.notes                    = notes ?? null
  if (is_active                !== undefined) update.is_active                = Boolean(is_active)

  if (type !== undefined) {
    if (!['flyer', 'advisor'].includes(type)) {
      return NextResponse.json({ error: 'type must be flyer or advisor' }, { status: 400 })
    }
    update.type = type
  }

  if (commission_first_pct !== undefined) {
    const pct = Number(commission_first_pct)
    if (isNaN(pct) || pct < 0 || pct > 100) {
      return NextResponse.json({ error: 'commission_first_pct must be 0–100' }, { status: 400 })
    }
    update.commission_first_pct = pct
  }

  if (commission_recurring_pct !== undefined) {
    const pct = Number(commission_recurring_pct)
    if (isNaN(pct) || pct < 0 || pct > 100) {
      return NextResponse.json({ error: 'commission_recurring_pct must be 0–100' }, { status: 400 })
    }
    update.commission_recurring_pct = pct
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('affiliate_codes')
    .update(update)
    .eq('code', code)
    .select()
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Affiliate code not found' }, { status: 404 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ affiliate: data })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const profile = await requireProfile()
  const denied  = await requirePlatformSuperAdmin(profile.id)
  if (denied) return denied

  const { code } = await params
  const supabase  = createServiceClient()

  const { data, error } = await supabase
    .from('affiliate_codes')
    .update({ is_active: false })
    .eq('code', code)
    .select()
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Affiliate code not found' }, { status: 404 })
  }

  return NextResponse.json({ ok: true, affiliate: data })
}
