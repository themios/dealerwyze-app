export const dynamic = 'force-dynamic'

import { createClientForRequest } from '@/lib/supabase/forRequest'
import { requireProfile } from '@/lib/auth/profile'
import Link from 'next/link'
import TopBar from '@/components/layout/TopBar'
import VehicleCard from '@/components/vehicle/VehicleCard'
import VehicleFilterChips from './VehicleFilterChips'
import SyncInventoryButton from '@/components/vehicle/SyncInventoryButton'
import SyncRemovedSection from '@/components/vehicle/SyncRemovedSection'
import VehicleIntakeButton from '@/components/vehicle/VehicleIntakeButton'
import RunMarketIntelligenceButton from '@/components/vehicle/RunMarketIntelligenceButton'
import { Button } from '@/components/ui/button'
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

      <div className="divide-y divide-border bg-card border rounded-xl mx-3 my-2 overflow-hidden">
        {!vehicles || vehicles.length === 0 ? (
          <EmptyState
            icon={Car}
            title={validStatus ? `No ${validStatus} vehicles` : 'No vehicles yet'}
            description={!validStatus ? 'Add your first vehicle to get started' : undefined}
            action={!validStatus ? { label: 'Add First Vehicle', href: '/vehicles/new' } : undefined}
          />
        ) : (
          vehicles.map(vehicle => (
            <VehicleCard key={vehicle.id} vehicle={vehicle} />
          ))
        )}
      </div>
    </div>
  )
}
