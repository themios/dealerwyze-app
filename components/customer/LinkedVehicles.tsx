'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { formatCurrency } from '@/lib/utils'
import { Star } from 'lucide-react'

interface LinkedVehicle {
  id: string
  vehicle_id: string
  interest_level: string
  is_primary?: boolean
  is_preferred?: boolean
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
  const [updating, setUpdating] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    supabase
      .from('customer_vehicles')
      .select('*, vehicle:vehicles(id, year, make, model, trim, price, status, stock_no)')
      .eq('customer_id', customerId)
      .then(({ data }) => setLinks(((data as LinkedVehicle[]) || []).filter(l => l.vehicle != null)))
  }, [customerId, refreshKey, supabase])

  async function togglePrimary(linkId: string, currentPrimary: boolean) {
    if (currentPrimary) return
    setUpdating(linkId)
    try {
      // Clear primary from all vehicles for this customer
      await supabase.from('customer_vehicles').update({ is_primary: false }).eq('customer_id', customerId)
      // Set this one as primary
      await supabase.from('customer_vehicles').update({ is_primary: true }).eq('id', linkId)
      // Refresh list
      const { data } = await supabase
        .from('customer_vehicles')
        .select('*, vehicle:vehicles(id, year, make, model, trim, price, status, stock_no)')
        .eq('customer_id', customerId)
      setLinks(((data as LinkedVehicle[]) || []).filter(l => l.vehicle != null))
    } finally {
      setUpdating(null)
    }
  }

  async function togglePreferred(linkId: string, currentPreferred: boolean) {
    setUpdating(linkId)
    try {
      await supabase
        .from('customer_vehicles')
        .update({ is_preferred: !currentPreferred })
        .eq('id', linkId)
      const { data } = await supabase
        .from('customer_vehicles')
        .select('*, vehicle:vehicles(id, year, make, model, trim, price, status, stock_no)')
        .eq('customer_id', customerId)
      setLinks(((data as LinkedVehicle[]) || []).filter(l => l.vehicle != null))
    } finally {
      setUpdating(null)
    }
  }

  if (links.length === 0) return null

  return (
    <div className="px-4 py-3 border-b">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Vehicles</p>
      <div className="space-y-2">
        {links.map(link => (
          <div
            key={link.id}
            className={`flex items-center justify-between p-2.5 rounded-lg border transition-colors ${link.is_primary ? 'bg-blue-500/5 border-blue-300' : 'hover:bg-accent'}`}
          >
            <Link href={`/vehicles/${link.vehicle_id}`} className="flex-1 min-w-0">
              <div>
                <p className="text-sm font-medium">{link.vehicle.year} {link.vehicle.make} {link.vehicle.model}</p>
                <p className="text-xs text-muted-foreground">
                  #{link.vehicle.stock_no}
                  {link.vehicle.status === 'sold' && <span className="ml-1 text-green-600 font-medium">· Sold</span>}
                  {link.vehicle.status === 'available' && <span className="ml-1">· Available</span>}
                  {link.vehicle.status === 'pending' && <span className="ml-1 text-yellow-600">· Pending</span>}
                </p>
              </div>
            </Link>
            <div className="flex items-center gap-2 ml-2 flex-shrink-0">
              {link.vehicle.price && <p className="text-sm font-semibold">{formatCurrency(link.vehicle.price)}</p>}
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${interestColors[link.interest_level] || ''}`}>
                {link.interest_level}
              </span>
              <button
                onClick={(e) => { e.preventDefault(); togglePrimary(link.id, !!link.is_primary) }}
                disabled={updating === link.id}
                title={link.is_primary ? 'Primary vehicle' : 'Click to make primary'}
                className="p-1 hover:bg-accent rounded transition-colors disabled:opacity-50"
              >
                <Star className={`h-4 w-4 ${link.is_primary ? 'fill-blue-600 text-blue-600' : 'text-muted-foreground'}`} />
              </button>
              <button
                onClick={(e) => { e.preventDefault(); togglePreferred(link.id, !!link.is_preferred) }}
                disabled={updating === link.id}
                title={link.is_preferred ? 'Remove from preferred' : 'Add to preferred'}
                className="px-2 py-0.5 text-xs rounded border transition-colors hover:bg-accent disabled:opacity-50"
              >
                {link.is_preferred ? '✓ Preferred' : 'Add'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
