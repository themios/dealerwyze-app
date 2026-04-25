import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import { canAccessLedger } from '@/lib/auth/dealerRoles'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const profile = await requireProfile()
  // Auth client: RLS enforces org isolation for recon_checklist_items, vehicles, and ledger_transactions reads.
  const supabase = await createClient()

  const [{ data: items }, { data: vehicle }, { data: ledger }] = await Promise.all([
    supabase
      .from('recon_checklist_items')
      .select('*')
      .eq('vehicle_id', id)
      .eq('org_id', profile.org_id)
      .order('sort_order'),
    supabase
      .from('vehicles')
      .select('purchase_price, price, flooring_fee, floor_plan_interest')
      .eq('id', id)
      .eq('user_id', profile.org_id)
      .single(),
    supabase
      .from('ledger_transactions')
      .select('amount_total')
      .eq('vehicle_id', id)
      .eq('user_id', profile.org_id)
      .eq('status', 'posted'),
  ])

  if (!vehicle) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const recon_checklist_total = (items ?? []).reduce((s, i) => s + (i.cost ?? 0), 0)
  const ledger_expenses_total = (ledger ?? []).reduce((s, t) => s + (t.amount_total ?? 0), 0)
  const purchase_price = vehicle.purchase_price ?? null
  const flooring_fee = vehicle.flooring_fee ?? 0
  const floor_plan_interest = vehicle.floor_plan_interest ?? 0
  const total_investment = (purchase_price ?? 0) + recon_checklist_total + ledger_expenses_total + flooring_fee + floor_plan_interest
  const list_price = vehicle.price ?? null
  const estimated_profit = list_price !== null && total_investment > 0
    ? list_price - total_investment
    : null

  return NextResponse.json({
    items: items ?? [],
    cost_summary: {
      purchase_price,
      recon_checklist_total,
      ledger_expenses_total,
      flooring_fee,
      floor_plan_interest,
      total_investment,
      list_price,
      estimated_profit,
    },
  })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const profile = await requireProfile()
  if (!canAccessLedger(profile.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  // Auth client: RLS enforces org isolation for vehicle check and recon_checklist_items INSERT.
  const supabase = await createClient()

  const { data: vehicle } = await supabase
    .from('vehicles')
    .select('id')
    .eq('id', id)
    .eq('user_id', profile.org_id)
    .single()

  if (!vehicle) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const label = String(body.label ?? '').trim().slice(0, 120)
  if (!label) return NextResponse.json({ error: 'Label required' }, { status: 400 })

  const cost = body.cost != null ? Math.max(0, parseFloat(body.cost)) : null
  const notes = body.notes ? String(body.notes).trim().slice(0, 500) : null

  const { data: maxRow } = await supabase
    .from('recon_checklist_items')
    .select('sort_order')
    .eq('vehicle_id', id)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  const sort_order = (maxRow?.sort_order ?? 0) + 1

  const { data: item, error } = await supabase
    .from('recon_checklist_items')
    .insert({
      vehicle_id: id,
      org_id: profile.org_id,
      label,
      is_required: false,
      sort_order,
      cost: isNaN(cost as number) ? null : cost,
      notes,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: 'Failed to add item' }, { status: 500 })

  return NextResponse.json({ item }, { status: 201 })
}
