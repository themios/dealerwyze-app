/**
 * GET  /api/admin/affiliates  — list all affiliate codes + dealer counts
 * POST /api/admin/affiliates  — create affiliate code (superadmin only)
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'
import { requirePlatformArea } from '@/lib/auth/platform'
import { getAdminVerticalScope } from '@/lib/admin/verticalScope'

export async function GET(req: NextRequest) {
  const profile = await requireProfile()
  const denied  = await requirePlatformArea(profile.id, 'affiliates')
  if (denied) return denied

  const supabase = createServiceClient()
  const scope = await getAdminVerticalScope(req)

  // Get affiliate codes with org count scoped to current vertical
  const { data: codes, error } = await supabase
    .from('affiliate_codes')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Enrich with counts scoped to the current vertical
  const enriched = await Promise.all((codes ?? []).map(async (code) => {
    let query = supabase
      .from('organizations')
      .select('id', { count: 'exact', head: true })
      .eq('affiliate_code', code.code)
      .eq('subscription_status', 'active')
    if (scope.orgIds.length > 0) {
      query = query.in('id', scope.orgIds)
    }
    const { count: dealerCount } = await query

    return { ...code, active_dealer_count: dealerCount ?? 0 }
  }))

  return NextResponse.json({ affiliates: enriched })
}

export async function POST(req: NextRequest) {
  const profile = await requireProfile()
  const denied  = await requirePlatformArea(profile.id, 'affiliates')
  if (denied) return denied

  const body = await req.json()
  const {
    code, type, owner_name, owner_email, notes,
    commission_first_pct = 10,
    commission_recurring_pct,
  } = body

  if (!type || !owner_name) {
    return NextResponse.json({ error: 'type, owner_name required' }, { status: 400 })
  }
  if (!['flyer', 'advisor'].includes(type)) {
    return NextResponse.json({ error: 'type must be flyer or advisor' }, { status: 400 })
  }

  // Default recurring commission by type: flyer=0%, advisor=2%
  const recurringPct = commission_recurring_pct !== undefined
    ? commission_recurring_pct
    : type === 'advisor' ? 2 : 0

  const supabase = createServiceClient()

  // Auto-generate code if not provided (AFF-XXXX, no O/0/I/1 confusion)
  let finalCode: string
  if (code) {
    finalCode = String(code).toUpperCase().trim()
  } else {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    let candidate = ''
    let attempts = 0
    do {
      candidate = 'AFF-' + Array.from({ length: 4 }, () =>
        chars[Math.floor(Math.random() * chars.length)]
      ).join('')
      const { data: existing } = await supabase
        .from('affiliate_codes').select('code').eq('code', candidate).maybeSingle()
      if (!existing) break
      attempts++
    } while (attempts < 10)
    finalCode = candidate
  }

  const { data, error } = await supabase
    .from('affiliate_codes')
    .insert({
      code:                     finalCode,
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
      return NextResponse.json({ error: `Code "${finalCode}" already exists` }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ affiliate: data }, { status: 201 })
}
