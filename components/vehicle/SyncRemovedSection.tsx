'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, RotateCcw, DollarSign, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import MarkSoldSheet from './MarkSoldSheet'

interface Vehicle {
  id: string
  stock_no: string
  year: number
  make: string
  model: string
  trim?: string | null
  price?: number | null
  mileage?: number | null
  sync_removed_at?: string | null
}

interface Props {
  vehicles: Vehicle[]
}

export default function SyncRemovedSection({ vehicles }: Props) {
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)
  const [selling, setSelling] = useState<string | null>(null)
  const [restoring, setRestoring] = useState<Set<string>>(new Set())

  if (vehicles.length === 0) return null

  async function restore(vehicleId: string) {
    setRestoring(prev => new Set(prev).add(vehicleId))
    await fetch(`/api/vehicles/${vehicleId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'available' }),
    })
    router.refresh()
  }

  const soldVehicle = vehicles.find(v => v.id === selling)

  return (
    <div className="mx-3 mb-3">
      {/* Warning banner header */}
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center justify-between px-4 py-3 bg-amber-50 border border-amber-300 rounded-t-xl text-left"
      >
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
          <span className="text-sm font-semibold text-amber-800">
            {vehicles.length} vehicle{vehicles.length > 1 ? 's' : ''} not found in last sync — review required
          </span>
        </div>
        {collapsed
          ? <ChevronDown className="h-4 w-4 text-amber-600" />
          : <ChevronUp className="h-4 w-4 text-amber-600" />
        }
      </button>

      {!collapsed && (
        <div className="border-x border-b border-amber-300 rounded-b-xl overflow-hidden divide-y divide-amber-200">
          {vehicles.filter(Boolean).map(v => {
            const label = `${v.year} ${v.make} ${v.model}${v.trim ? ' ' + v.trim : ''}`
            const isRestoring = restoring.has(v.id)
            return (
              <div key={v.id} className="flex items-center gap-3 px-4 py-3 bg-amber-50/60">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{label}</p>
                  <p className="text-xs text-muted-foreground">
                    #{v.stock_no}
                    {v.price ? ` · $${v.price.toLocaleString()}` : ''}
                    {v.mileage ? ` · ${v.mileage.toLocaleString()} mi` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs border-amber-400 text-amber-800 hover:bg-amber-100"
                    onClick={() => restore(v.id)}
                    disabled={isRestoring}
                  >
                    <RotateCcw className="h-3 w-3 mr-1" />
                    {isRestoring ? 'Restoring…' : 'Still Here'}
                  </Button>
                  <Button
                    size="sm"
                    className="h-8 text-xs bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => setSelling(v.id)}
                  >
                    <DollarSign className="h-3 w-3 mr-1" />
                    Mark Sold
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {soldVehicle && (
        <MarkSoldSheet
          vehicleId={soldVehicle.id}
          vehicleLabel={`${soldVehicle.year} ${soldVehicle.make} ${soldVehicle.model}`}
          open={!!selling}
          onClose={() => setSelling(null)}
        />
      )}
    </div>
  )
}
