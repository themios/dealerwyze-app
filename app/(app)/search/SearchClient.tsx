'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Customer, Vehicle } from '@/types'
import TopBar from '@/components/layout/TopBar'
import CustomerCard from '@/components/customer/CustomerCard'
import VehicleCard from '@/components/vehicle/VehicleCard'
import { Input } from '@/components/ui/input'
import { Search } from 'lucide-react'

export default function SearchClient({ isRe }: { isRe: boolean }) {
  const [query, setQuery] = useState('')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  async function handleSearch(q: string) {
    setQuery(q)
    if (q.length < 2) {
      setCustomers([])
      setVehicles([])
      return
    }

    setLoading(true)
    const term = q.trim()

    const [{ data: c }, { data: v }] = await Promise.all([
      supabase
        .from('customers')
        .select('*')
        .or(`name.ilike.%${term}%,primary_phone.ilike.%${term}%,email.ilike.%${term}%`)
        .limit(10),
      supabase
        .from('vehicles')
        .select('*')
        .or(`stock_no.ilike.%${term}%,make.ilike.%${term}%,model.ilike.%${term}%,vin.ilike.%${term}%`)
        .limit(10),
    ])

    setCustomers(c || [])
    setVehicles(v || [])
    setLoading(false)
  }

  const hasResults = customers.length > 0 || vehicles.length > 0

  return (
    <div>
      <TopBar title="Search" />

      <div className="px-4 py-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={isRe ? 'Name, phone, address, MLS #…' : 'Name, phone, stock #, make…'}
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-9 h-12 text-base"
            autoFocus
          />
        </div>
      </div>

      {query.length < 2 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-4xl mb-3">🔍</p>
          <p className="text-sm">{isRe ? 'Search clients, listings, addresses…' : 'Search customers, vehicles, stock numbers…'}</p>
        </div>
      ) : loading ? (
        <div className="text-center py-16 text-muted-foreground text-sm">Searching…</div>
      ) : !hasResults ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-sm">No results for &quot;{query}&quot;</p>
        </div>
      ) : (
        <div className="px-4 space-y-4">
          {customers.length > 0 && (
            <section>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{isRe ? 'Clients' : 'Customers'}</p>
              <div className="space-y-2">
                {customers.map(c => <CustomerCard key={c.id} customer={c} />)}
              </div>
            </section>
          )}
          {vehicles.length > 0 && (
            <section>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{isRe ? 'Listings' : 'Vehicles'}</p>
              <div className="space-y-2">
                {vehicles.map(v => <VehicleCard key={v.id} vehicle={v} />)}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
