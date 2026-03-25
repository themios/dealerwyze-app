import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import { canAccessLedger } from '@/lib/auth/dealerRoles'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const profile = await requireProfile()
  if (!canAccessLedger(profile.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const supabase = await createClient()

  const { data: vehicle } = await supabase
    .from('vehicles')
    .select('id')
    .eq('id', id)
    .eq('user_id', profile.org_id)
    .single()

  if (!vehicle) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const patch: Record<string, unknown> = {}

  if ('flooring_fee' in body) {
    const n = body.flooring_fee != null ? parseFloat(body.flooring_fee) : null
    patch.flooring_fee = n === null || isNaN(n) ? 0 : Math.max(0, Math.round(n * 100) / 100)
  }
  if ('floor_plan_interest' in body) {
    const n = body.floor_plan_interest != null ? parseFloat(body.floor_plan_interest) : null
    patch.floor_plan_interest = n === null || isNaN(n) ? 0 : Math.max(0, Math.round(n * 100) / 100)
  }

  if (Object.keys(patch).length === 0) return NextResponse.json({ ok: true })

  const { error } = await supabase.from('vehicles').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: 'Update failed' }, { status: 500 })

  return NextResponse.json({ ok: true })
}
