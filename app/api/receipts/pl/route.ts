import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import { buildPlReport } from '@/lib/receipts/buildPlReport'

export async function GET(req: NextRequest) {
  const profile = await requireProfile()
  const supabase = await createClient()

  const { searchParams } = new URL(req.url)
  const dateFrom = searchParams.get('date_from')
  const dateTo = searchParams.get('date_to')

  let ledgerQuery = supabase
    .from('ledger_transactions')
    .select(`
      id, date, entry_type, amount_total, category_id, vehicle_id,
      receipt_categories (name, category_type)
    `)
    .eq('user_id', profile.org_id)
    .eq('status', 'posted')
    .order('date', { ascending: true })
    .limit(2000)

  if (dateFrom) ledgerQuery = ledgerQuery.gte('date', dateFrom)
  if (dateTo) ledgerQuery = ledgerQuery.lte('date', dateTo)

  const [{ data: ledgerRows }, { data: vehicles }] = await Promise.all([
    ledgerQuery,
    supabase
      .from('vehicles')
      .select('id, stock_no, year, make, model, status, purchase_price, sold_price, price')
      .eq('user_id', profile.org_id)
      .limit(500),
  ])

  const vehicleIds = [...new Set((ledgerRows ?? []).map(r => r.vehicle_id).filter(Boolean))] as string[]

  let reconCosts: { vehicle_id: string; cost: number | null }[] = []
  if (vehicleIds.length > 0) {
    const { data: recon } = await supabase
      .from('recon_checklist_items')
      .select('vehicle_id, cost')
      .eq('org_id', profile.org_id)
      .in('vehicle_id', vehicleIds)
    reconCosts = recon ?? []
  }

  const ledger = (ledgerRows ?? []).map(r => {
    const raw = r.receipt_categories
    const cat = (Array.isArray(raw) ? raw[0] : raw) as { name: string; category_type: string } | null
    return {
      id: r.id,
      date: (r.date ?? '').slice(0, 10),
      entry_type: r.entry_type ?? 'expense',
      amount_total: r.amount_total,
      category_id: r.category_id,
      vehicle_id: r.vehicle_id,
      category_name: cat?.name ?? null,
      category_type: cat?.category_type ?? null,
    }
  })

  const report = buildPlReport(ledger, vehicles ?? [], reconCosts)

  return NextResponse.json({ report })
}
