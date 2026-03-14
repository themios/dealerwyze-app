'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { formatCurrency } from '@/lib/utils'

interface LinkedVehicle {
  id: string
  vehicle_id: string
  interest_level: string
  vehicle: {
    id: string
    year: number
    make: string
    model: string
    trim?: string
    price?: number
    status: string
    stock_no: string
  }
}

interface LinkedVehiclesProps {
  customerId: string
  refreshKey?: number
}

const interestColors: Record<string, string> = {
  hot: 'text-red-600 bg-red-500/10',
  warm: 'text-yellow-600 bg-yellow-500/10',
  cold: 'text-blue-600 bg-blue-500/10',
}

export default function LinkedVehicles({ customerId, refreshKey }: LinkedVehiclesProps) {
  const [links, setLinks] = useState<LinkedVehicle[]>([])
  const supabase = createClient()

  useEffect(() => {
    supabase
      .from('customer_vehicles')
      .select('*, vehicle:vehicles(id, year, make, model, trim, price, status, stock_no)')
      .eq('customer_id', customerId)
      .then(({ data }) => setLinks(((data as LinkedVehicle[]) || []).filter(l => l.vehicle != null)))
  }, [customerId, refreshKey, supabase])

  if (links.length === 0) return null

  return (
    <div className="px-4 py-3 border-b">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Vehicles</p>
      <div className="space-y-2">
        {links.map(link => (
          <Link key={link.id} href={`/vehicles/${link.vehicle_id}`}>
            <div className="flex items-center justify-between p-2.5 rounded-lg border hover:bg-accent transition-colors">
              <div>
                <p className="text-sm font-medium">{link.vehicle.year} {link.vehicle.make} {link.vehicle.model}</p>
                <p className="text-xs text-muted-foreground">
                  #{link.vehicle.stock_no}
                  {link.vehicle.status === 'sold' && <span className="ml-1 text-green-600 font-medium">· Sold</span>}
                  {link.vehicle.status === 'available' && <span className="ml-1">· Available</span>}
                  {link.vehicle.status === 'pending' && <span className="ml-1 text-yellow-600">· Pending</span>}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {link.vehicle.price && <p className="text-sm font-semibold">{formatCurrency(link.vehicle.price)}</p>}
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${interestColors[link.interest_level] || ''}`}>
                  {link.interest_level}
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
