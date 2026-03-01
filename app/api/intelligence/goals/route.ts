import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/auth/profile'

export async function GET() {
  const profile = await requireProfile()
  const supabase = await createClient()

  const { data: goals } = await supabase
    .from('dealer_goals')
    .select('id, period, metric, target, why, sort_order')
    .eq('org_id', profile.org_id)
    .order('period')
    .order('sort_order')

  return NextResponse.json({ goals: goals ?? [] })
}

export async function POST(req: Request) {
  const profile = await requireProfile()
  const supabase = await createClient()
  const body = await req.json()

  const { period, metric, target, why } = body
  if (!period || !metric || !target) {
    return NextResponse.json({ error: 'period, metric, target required' }, { status: 400 })
  }

  const { data: existing } = await supabase
    .from('dealer_goals')
    .select('sort_order')
    .eq('org_id', profile.org_id)
    .eq('period', period)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  const sort_order = (existing?.sort_order ?? 0) + 1

  await supabase.from('dealer_goals').insert({
    org_id: profile.org_id,
    period,
    metric,
    target,
    why: why ?? '',
    sort_order,
  })

  return NextResponse.json({ success: true })
}

export async function PATCH(req: Request) {
  const profile = await requireProfile()
  const supabase = await createClient()
  const body = await req.json()

  const { id, metric, target, why, period } = body
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  await supabase
    .from('dealer_goals')
    .update({ metric, target, why: why ?? '', period, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('org_id', profile.org_id)

  return NextResponse.json({ success: true })
}

export async function DELETE(req: Request) {
  const profile = await requireProfile()
  const supabase = await createClient()
  const { id } = await req.json()

  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  await supabase
    .from('dealer_goals')
    .delete()
    .eq('id', id)
    .eq('org_id', profile.org_id)

  return NextResponse.json({ success: true })
}
