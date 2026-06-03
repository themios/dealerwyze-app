export const dynamic = 'force-dynamic'

import { createClientForRequest } from '@/lib/supabase/forRequest'
import { requireProfile } from '@/lib/auth/profile'
import TopBar from '@/components/layout/TopBar'
import BackButton from '@/components/layout/BackButton'
import PlReportClient from '@/components/receipts/PlReportClient'
import { buildPlReport } from '@/lib/receipts/buildPlReport'

export default async function PlPage() {
  const profile = await requireProfile()
  const supabase = await createClientForRequest()

  const now = new Date()
  const yearStart = `${now.getFullYear()}-01-01`
  const today = now.toISOString().slice(0, 10)

  const [{ data: ledgerRows }, { data: vehicles }] = await Promise.all([
    supabase
      .from('ledger_transactions')
      .select(`
        id, date, entry_type, amount_total, category_id, vehicle_id,
        receipt_categories (name, category_type)
      `)
      .eq('user_id', profile.org_id)
      .eq('status', 'posted')
      .gte('date', yearStart)
      .lte('date', today)
      .order('date', { ascending: true })
      .limit(2000),
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

  return (
    <div className="pb-4">
      <TopBar
        left={
          <div className="flex items-center gap-2">
            <BackButton href="/receipts/ledger" />
            <h1 className="text-lg font-semibold">Profit &amp; Loss</h1>
          </div>
        }
      />
      <PlReportClient
        initialReport={report}
        defaultDateFrom={yearStart}
        defaultDateTo={today}
      />
    </div>
  )
}
