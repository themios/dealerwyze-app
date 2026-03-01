export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/auth/profile'
import Link from 'next/link'
import TopBar from '@/components/layout/TopBar'
import VehicleCard from '@/components/vehicle/VehicleCard'
import VehicleFilterChips from './VehicleFilterChips'
import SyncInventoryButton from '@/components/vehicle/SyncInventoryButton'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'

interface PageProps {
  searchParams: Promise<{ status?: string; sort?: string }>
}

export default async function VehiclesPage({ searchParams }: PageProps) {
  const { status, sort } = await searchParams
  const profile = await requireProfile()
  const supabase = await createClient()

  const validStatus = ['available', 'pending', 'sold'].includes(status ?? '') ? status : undefined

  let vehicleQuery = supabase
    .from('vehicles')
    .select('*')
    .eq('user_id', profile.org_id)

  if (validStatus) {
    vehicleQuery = vehicleQuery.eq('status', validStatus)
  } else {
    // "All" tab shows only active inventory — sold vehicles appear only under the Sold tab
    vehicleQuery = vehicleQuery.neq('status', 'sold')
  }

  if (sort === 'price_asc') vehicleQuery = vehicleQuery.order('price', { ascending: true })
  else if (sort === 'price_desc') vehicleQuery = vehicleQuery.order('price', { ascending: false })
  else if (sort === 'year_desc') vehicleQuery = vehicleQuery.order('year', { ascending: false })
  else if (sort === 'oldest') vehicleQuery = vehicleQuery.order('created_at', { ascending: true })
  else vehicleQuery = vehicleQuery.order('created_at', { ascending: false })

  const [{ data: vehicles }, { data: allVehicles }] = await Promise.all([
    vehicleQuery,
    supabase.from('vehicles').select('status').eq('user_id', profile.org_id),
  ])

  const counts = { all: 0, available: 0, pending: 0, sold: 0 }
  allVehicles?.forEach(v => {
    const s = v.status as 'available' | 'pending' | 'sold'
    counts[s] = (counts[s] || 0) + 1
    if (s !== 'sold') counts.all++  // "All" count = active inventory only
  })

  return (
    <div>
      <TopBar
        title="Inventory"
        right={
          <div className="flex items-center gap-1">
            <SyncInventoryButton />
            <Link href="/vehicles/new">
              <Button size="sm" variant="ghost">
                <Plus className="h-5 w-5" />
              </Button>
            </Link>
          </div>
        }
      />

      <VehicleFilterChips current={validStatus ?? 'all'} counts={counts} currentSort={sort ?? 'newest'} />

      <div className="divide-y divide-border bg-card border rounded-xl mx-3 my-2 overflow-hidden">
        {!vehicles || vehicles.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-4xl mb-3">🚗</p>
            <p className="font-medium">
              {validStatus ? `No ${validStatus} vehicles` : 'No vehicles yet'}
            </p>
            {!validStatus && (
              <Link href="/vehicles/new">
                <Button className="mt-4">Add First Vehicle</Button>
              </Link>
            )}
          </div>
        ) : (
          vehicles.map(vehicle => (
            <VehicleCard key={vehicle.id} vehicle={vehicle} />
          ))
        )}
      </div>
    </div>
  )
}
