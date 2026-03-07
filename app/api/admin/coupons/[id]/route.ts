/**
 * PATCH /api/admin/coupons/[id]  — activate/deactivate, edit notes/expiry
 * DELETE /api/admin/coupons/[id] — hard delete (only if never used)
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'
import { requirePlatformSuperAdmin } from '@/lib/auth/platform'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const profile = await requireProfile()
  const denied  = await requirePlatformSuperAdmin(profile.id)
  if (denied) return denied

  const { id } = await params
  const body = await req.json()
  const allowed = ['is_active', 'notes', 'valid_until', 'max_uses', 'discount_value', 'discount_type']
  const updates: Record<string, unknown> = {}
  for (const k of allowed) {
    if (k in body) updates[k] = body[k]
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('coupons')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ coupon: data })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const profile = await requireProfile()
  const denied  = await requirePlatformSuperAdmin(profile.id)
  if (denied) return denied

  const { id } = await params
  const supabase = createServiceClient()

  // Only allow delete if coupon has never been redeemed
  const { data: coupon } = await supabase
    .from('coupons')
    .select('used_count')
    .eq('id', id)
    .single()

  if (!coupon) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if ((coupon.used_count ?? 0) > 0) {
    return NextResponse.json(
      { error: 'Cannot delete a coupon that has been redeemed. Deactivate it instead (PATCH is_active=false).' },
      { status: 409 },
    )
  }

  const { error } = await supabase.from('coupons').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ deleted: true })
}
