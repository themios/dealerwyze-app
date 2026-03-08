'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Vehicle } from '@/types'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatCurrency } from '@/lib/utils'
import { Link2 } from 'lucide-react'

interface LinkVehicleSheetProps {
  customerId: string
  onLinked: () => void
  hasVehicle?: boolean
}

const INTEREST_LEVELS = [
  { value: 'hot', label: 'Hot', color: 'bg-red-500/10 text-red-600' },
  { value: 'warm', label: 'Warm', color: 'bg-yellow-500/10 text-yellow-600' },
  { value: 'cold', label: 'Cold', color: 'bg-blue-500/10 text-blue-600' },
] as const

export default function LinkVehicleSheet({ customerId, onLinked, hasVehicle }: LinkVehicleSheetProps) {
  const [open, setOpen] = useState(false)
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [interest, setInterest] = useState<'hot' | 'warm' | 'cold'>('warm')
  const [saving, setSaving] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    if (!open) return
    supabase.from('vehicles').select('*').eq('status', 'available').order('created_at', { ascending: false }).then(({ data }) => setVehicles(data || []))
  }, [open, supabase])

  async function handleLink() {
    if (!selected) return
    setSaving(true)
    await supabase.from('customer_vehicles').upsert({
      customer_id: customerId,
      vehicle_id: selected,
      interest_level: interest,
    }, { onConflict: 'customer_id,vehicle_id' })
    setSaving(false)
    setSelected(null)
    setOpen(false)
    onLinked()
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="gap-1.5">
        <Link2 className="h-4 w-4" />
        {hasVehicle ? 'Add Vehicle' : 'Link Vehicle'}
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="h-[80vh] overflow-y-auto rounded-t-2xl">
          <SheetHeader className="mb-4">
            <SheetTitle>Link a Vehicle</SheetTitle>
          </SheetHeader>

          {selected ? (
            <div className="space-y-4">
              <button className="text-sm text-primary" onClick={() => setSelected(null)}>← Back</button>
              <p className="font-medium">{vehicles.find(v => v.id === selected) ? `${vehicles.find(v => v.id === selected)!.year} ${vehicles.find(v => v.id === selected)!.make} ${vehicles.find(v => v.id === selected)!.model}` : ''}</p>
              <div>
                <p className="text-sm font-medium mb-2">Interest level</p>
                <div className="flex gap-2">
                  {INTEREST_LEVELS.map(({ value, label, color }) => (
                    <button
                      key={value}
                      onClick={() => setInterest(value)}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${interest === value ? 'border-primary bg-primary text-primary-foreground' : 'border-border ' + color}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <Button className="w-full h-11" onClick={handleLink} disabled={saving}>
                {saving ? 'Linking…' : 'Link Vehicle'}
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {vehicles.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No available vehicles</p>}
              {vehicles.map(v => (
                <button
                  key={v.id}
                  onClick={() => setSelected(v.id)}
                  className="w-full text-left p-3 rounded-lg border hover:bg-accent transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">{v.year} {v.make} {v.model} {v.trim || ''}</p>
                      <p className="text-xs text-muted-foreground">#{v.stock_no}{v.mileage ? ` · ${v.mileage.toLocaleString()} mi` : ''}</p>
                    </div>
                    {v.price && <p className="font-semibold text-sm">{formatCurrency(v.price)}</p>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}
