/**
 * GET  /api/admin/affiliates  — list all affiliate codes + dealer counts
 * POST /api/admin/affiliates  — create affiliate code (superadmin only)
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

  // Get affiliate codes with dealer count per code
  const { data: codes, error } = await supabase
    .from('affiliate_codes')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Enrich with dealer counts and MRR attribution
  const enriched = await Promise.all((codes ?? []).map(async (code) => {
    const { count: dealerCount } = await supabase
      .from('organizations')
      .select('id', { count: 'exact', head: true })
      .eq('affiliate_code', code.code)
      .eq('subscription_status', 'active')

    return { ...code, active_dealer_count: dealerCount ?? 0 }
  }))

  return NextResponse.json({ affiliates: enriched })
}

export async function POST(req: NextRequest) {
  const profile = await requireProfile()
  const denied  = await requirePlatformSuperAdmin(profile.id)
  if (denied) return denied

  const body = await req.json()
  const {
    code, type, owner_name, owner_email, notes,
    commission_first_pct = 10,
    commission_recurring_pct,
  } = body

  if (!code || !type || !owner_name) {
    return NextResponse.json({ error: 'code, type, owner_name required' }, { status: 400 })
  }
  if (!['flyer', 'advisor'].includes(type)) {
    return NextResponse.json({ error: 'type must be flyer or advisor' }, { status: 400 })
  }

  // Default recurring commission by type: flyer=0%, advisor=2%
  const recurringPct = commission_recurring_pct !== undefined
    ? commission_recurring_pct
    : type === 'advisor' ? 2 : 0

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('affiliate_codes')
    .insert({
      code:                     code.toUpperCase().trim(),
      type,
      owner_name,
      owner_email:              owner_email ?? null,
      notes:                    notes ?? null,
      commission_first_pct,
      commission_recurring_pct: recurringPct,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: `Code "${code.toUpperCase()}" already exists` }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ affiliate: data }, { status: 201 })
}
