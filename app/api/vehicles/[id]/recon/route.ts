import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import { canAccessLedger, isDealerAdmin } from '@/lib/auth/dealerRoles'
import { DEFAULT_RECON_CHECKLIST, type ReconChecklistTemplateItem } from '@/lib/recon/defaults'

const ACTIVE_RECON_STATUSES = ['staging', 'available', 'pending'] as const

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
  const applyToAll = Boolean(body.apply_to_all)
  if (applyToAll && !isDealerAdmin(profile.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const cost = body.cost != null ? Math.max(0, parseFloat(body.cost)) : null
  const notes = body.notes ? String(body.notes).trim().slice(0, 500) : null
  const normalizedLabel = label.toLowerCase()

  if (!applyToAll) {
    const { data: existing } = await supabase
      .from('recon_checklist_items')
      .select('*')
      .eq('vehicle_id', id)
      .eq('org_id', profile.org_id)
      .ilike('label', label)
      .maybeSingle()

    if (existing) return NextResponse.json({ item: existing, duplicate: true }, { status: 200 })

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

  const [{ data: settings }, { data: vehicles }, { data: existingItems }] = await Promise.all([
    supabase
      .from('org_settings')
      .select('recon_checklist_template')
      .eq('org_id', profile.org_id)
      .maybeSingle(),
    supabase
      .from('vehicles')
      .select('id')
      .eq('user_id', profile.org_id)
      .in('status', [...ACTIVE_RECON_STATUSES]),
    supabase
      .from('recon_checklist_items')
      .select('id, vehicle_id, label, sort_order, is_required, checked, notes, cost, completed_at, category')
      .eq('org_id', profile.org_id),
  ])

  const template = ((settings?.recon_checklist_template as ReconChecklistTemplateItem[] | null) ?? DEFAULT_RECON_CHECKLIST).slice()
  let templateUpdated = false
  if (!template.some(item => item.label.trim().toLowerCase() === normalizedLabel)) {
    templateUpdated = true
    template.push({
      label,
      is_required: false,
      sort_order: template.length + 1,
      category: 'standard',
    })
    const { error: templateError } = await supabase
      .from('org_settings')
      .update({
        recon_checklist_template: template.map((item, index) => ({
          ...item,
          sort_order: index + 1,
        })),
      })
      .eq('org_id', profile.org_id)

    if (templateError) {
      return NextResponse.json({ error: 'Failed to update checklist template' }, { status: 500 })
    }
  }

  const vehicleIds = (vehicles ?? []).map(vehicle => vehicle.id)
  if (vehicleIds.length === 0) {
    return NextResponse.json({ error: 'No active inventory vehicles found' }, { status: 404 })
  }

  const existingByVehicle = new Map<string, { id: string; vehicle_id: string; label: string; sort_order: number | null }[]>()
  for (const item of existingItems ?? []) {
    const list = existingByVehicle.get(item.vehicle_id) ?? []
    list.push(item)
    existingByVehicle.set(item.vehicle_id, list)
  }

  const rowsToInsert: Array<{
    vehicle_id: string
    org_id: string
    label: string
    is_required: boolean
    sort_order: number
    cost: number | null
    notes: string | null
  }> = []

  for (const vehicleId of vehicleIds) {
    const itemsForVehicle = existingByVehicle.get(vehicleId) ?? []
    const alreadyHasLabel = itemsForVehicle.some(item => item.label.trim().toLowerCase() === normalizedLabel)
    if (alreadyHasLabel) continue

    const nextSortOrder = itemsForVehicle.reduce((max, item) => Math.max(max, item.sort_order ?? 0), 0) + 1
    rowsToInsert.push({
      vehicle_id: vehicleId,
      org_id: profile.org_id,
      label,
      is_required: false,
      sort_order: nextSortOrder,
      cost: isNaN(cost as number) ? null : cost,
      notes,
    })
  }

  let inserted: Array<Record<string, unknown>> = []
  if (rowsToInsert.length > 0) {
    const { data, error } = await supabase
      .from('recon_checklist_items')
      .insert(rowsToInsert)
      .select()

    if (error) return NextResponse.json({ error: 'Failed to add item to all vehicles' }, { status: 500 })
    inserted = data ?? []
  }

  const existingCurrentItem = (existingItems ?? []).find(item =>
    item.vehicle_id === id && item.label.trim().toLowerCase() === normalizedLabel
  )
  const currentItem = inserted.find(item => item.vehicle_id === id) ?? existingCurrentItem ?? null

  return NextResponse.json(
    {
      item: currentItem,
      applied_to_all: true,
      added_vehicle_count: rowsToInsert.length,
      template_updated: templateUpdated,
    },
    { status: 201 },
  )
}
