export const dynamic = 'force-dynamic'

import { createClientForRequest } from '@/lib/supabase/forRequest'
import { requireProfile } from '@/lib/auth/profile'
import TopBar from '@/components/layout/TopBar'
import VehicleCard from '@/components/vehicle/VehicleCard'
import VehicleFilterChips from './VehicleFilterChips'
import SyncInventoryButton from '@/components/vehicle/SyncInventoryButton'
import SyncRemovedSection from '@/components/vehicle/SyncRemovedSection'
import VehicleIntakeButton from '@/components/vehicle/VehicleIntakeButton'
import RunMarketIntelligenceButton from '@/components/vehicle/RunMarketIntelligenceButton'
import { Car } from 'lucide-react'
import EmptyState from '@/components/ui/EmptyState'

interface PageProps {
  searchParams: Promise<{ status?: string; sort?: string }>
}

export default async function VehiclesPage({ searchParams }: PageProps) {
  const { status, sort } = await searchParams
  const profile = await requireProfile()
  const supabase = await createClientForRequest()

  const validStatus = ['available', 'pending', 'sold', 'staging'].includes(status ?? '') ? status : undefined

  let vehicleQuery = supabase
    .from('vehicles')
    .select('*')
    .eq('user_id', profile.org_id)

  if (validStatus) {
    vehicleQuery = vehicleQuery.eq('status', validStatus)
  } else {
    // "All" tab shows active inventory — exclude sold, sync_removed, and staging (staging has its own tab)
    vehicleQuery = vehicleQuery.neq('status', 'sold').neq('status', 'sync_removed').neq('status', 'staging')
  }

  if (sort === 'price_asc') vehicleQuery = vehicleQuery.order('price', { ascending: true })
  else if (sort === 'price_desc') vehicleQuery = vehicleQuery.order('price', { ascending: false })
  else if (sort === 'year_desc') vehicleQuery = vehicleQuery.order('year', { ascending: false })
  else if (sort === 'oldest') vehicleQuery = vehicleQuery.order('created_at', { ascending: true })
  else vehicleQuery = vehicleQuery.order('created_at', { ascending: false })

  const [{ data: vehicles }, { data: allVehicles }, { data: syncRemoved }] = await Promise.all([
    vehicleQuery,
    supabase.from('vehicles').select('status').eq('user_id', profile.org_id),
    supabase
      .from('vehicles')
      .select('id, stock_no, year, make, model, trim, price, mileage, sync_removed_at')
      .eq('user_id', profile.org_id)
      .eq('status', 'sync_removed')
      .order('sync_removed_at', { ascending: false }),
  ])

  // Fetch recon costs + ledger totals for all vehicles on this page
  const stagingIds = (vehicles ?? []).map(v => v.id)
  const reconStatusMap: Record<string, 'red' | 'amber' | 'green'> = {}
  const reconCostMap: Record<string, number> = {}
  const ledgerTotalMap: Record<string, number> = {}

  if (stagingIds.length > 0) {
    const [{ data: checklistRows }, { data: ledgerRows }] = await Promise.all([
      supabase
        .from('recon_checklist_items')
        .select('vehicle_id, checked, category, cost')
        .in('vehicle_id', stagingIds)
        .eq('org_id', profile.org_id),
      supabase
        .from('ledger_transactions')
        .select('vehicle_id, amount_total')
        .in('vehicle_id', stagingIds)
        .eq('user_id', profile.org_id)
        .eq('status', 'posted'),
    ])

    const vehicleStatusById = Object.fromEntries((vehicles ?? []).map(v => [v.id, v.status]))
    for (const vid of stagingIds) {
      const rows = (checklistRows ?? []).filter(r => r.vehicle_id === vid)
      if (rows.length === 0) continue  // no checklist = no indicator
      const hasMandatoryUnchecked = rows.some(r => !r.checked && r.category === 'mandatory')
      const hasAnyUnchecked = rows.some(r => !r.checked)
      if (hasAnyUnchecked) {
        reconStatusMap[vid] = hasMandatoryUnchecked ? 'red' : 'amber'
      } else if (vehicleStatusById[vid] === 'staging') {
        reconStatusMap[vid] = 'green'  // all done + still staging = ready to promote
      }
      // available/pending with all items done = no indicator (expected state)
      reconCostMap[vid] = rows.reduce((s, r) => s + (r.cost ?? 0), 0)
    }
    for (const row of ledgerRows ?? []) {
      if (row.vehicle_id) {
        ledgerTotalMap[row.vehicle_id] = (ledgerTotalMap[row.vehicle_id] ?? 0) + (row.amount_total ?? 0)
      }
    }
  }

  // Build investment summary for every vehicle
  type InvestmentSummary = {
    purchase_price: number | null
    recon_total: number
    ledger_total: number
    flooring_fee: number
    floor_plan_interest: number
    total_investment: number | null
    list_price: number | null
    sold_price: number | null
  }
  const investmentMap: Record<string, InvestmentSummary> = {}
  for (const v of vehicles ?? []) {
    const purchase = v.purchase_price ?? null
    const recon = reconCostMap[v.id] ?? 0
    const ledger = ledgerTotalMap[v.id] ?? 0
    const flooring = v.flooring_fee ?? 0
    const interest = v.floor_plan_interest ?? 0
    const total = purchase !== null ? purchase + recon + ledger + flooring + interest : null
    investmentMap[v.id] = {
      purchase_price: purchase,
      recon_total: recon,
      ledger_total: ledger,
      flooring_fee: flooring,
      floor_plan_interest: interest,
      total_investment: total,
      list_price: v.price ?? null,
      sold_price: v.sold_price ?? null,
    }
  }

  const counts = { all: 0, available: 0, pending: 0, sold: 0, staging: 0 }
  allVehicles?.forEach(v => {
    const s = v.status as string
    if (s === 'available' || s === 'pending' || s === 'sold' || s === 'staging') {
      counts[s as keyof typeof counts] = (counts[s as keyof typeof counts] || 0) + 1
    }
    // "All" count: active inventory only — exclude sold, sync_removed, and staging
    if (s !== 'sold' && s !== 'sync_removed' && s !== 'staging') counts.all++
  })

  return (
    <div>
      <TopBar
        title="Inventory"
        right={
          <div className="flex items-center gap-1">
            {profile.role === 'admin' && <RunMarketIntelligenceButton />}
            <SyncInventoryButton />
            <VehicleIntakeButton />
          </div>
        }
      />

      <VehicleFilterChips current={validStatus ?? 'all'} counts={counts} currentSort={sort ?? 'newest'} />

      <SyncRemovedSection vehicles={syncRemoved ?? []} />

      <div className="py-1">
        {!vehicles || vehicles.length === 0 ? (
          <EmptyState
            icon={Car}
            title={validStatus ? `No ${validStatus} vehicles` : 'No vehicles yet'}
            description={!validStatus ? 'Add your first vehicle to get started' : undefined}
            action={!validStatus ? { label: 'Add First Vehicle', href: '/vehicles/new' } : undefined}
          />
        ) : (
          vehicles.map(vehicle => (
            <VehicleCard
              key={vehicle.id}
              vehicle={vehicle}
              reconStatus={reconStatusMap[vehicle.id]}
              investmentSummary={investmentMap[vehicle.id]}
            />
          ))
        )}
      </div>
    </div>
  )
}
