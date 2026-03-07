/**
 * POST /api/admin/coupons  — create a coupon (superadmin only)
 * GET  /api/admin/coupons  — list all coupons with redemption counts
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'
import { requirePlatformSuperAdmin } from '@/lib/auth/platform'

export async function GET() {
  const profile = await requireProfile()
  const denied  = await requirePlatformSuperAdmin(profile.id)
  if (denied) return denied

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('coupons')
    .select(`
      id, code, discount_type, discount_value, org_id, max_uses, used_count,
      duration_months, valid_from, valid_until, notes, is_active, created_at,
      organizations!coupons_org_id_fkey(name, slug)
    `)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ coupons: data })
}

export async function POST(req: NextRequest) {
  const profile = await requireProfile()
  const denied  = await requirePlatformSuperAdmin(profile.id)
  if (denied) return denied

  const body = await req.json()
  const {
    code, discount_type, discount_value, org_id,
    max_uses = 1, duration_months, valid_until, notes,
  } = body

  if (!code || !discount_type || discount_value === undefined) {
    return NextResponse.json({ error: 'code, discount_type, discount_value required' }, { status: 400 })
  }
  if (!['percent', 'fixed'].includes(discount_type)) {
    return NextResponse.json({ error: 'discount_type must be percent or fixed' }, { status: 400 })
  }
  if (typeof discount_value !== 'number' || discount_value <= 0) {
    return NextResponse.json({ error: 'discount_value must be a positive number' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('coupons')
    .insert({
      code:           code.toUpperCase().trim(),
      discount_type,
      discount_value,
      org_id:         org_id ?? null,
      max_uses,
      duration_months: duration_months ?? null,
      valid_until:     valid_until ?? null,
      notes:           notes ?? null,
      created_by:      profile.id,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: `Coupon code "${code.toUpperCase()}" already exists` }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ coupon: data }, { status: 201 })
}
