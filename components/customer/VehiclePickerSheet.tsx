'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Vehicle } from '@/types'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { formatCurrency } from '@/lib/utils'
import { Search, ArrowUpDown } from 'lucide-react'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (vehicleId: string, vehicleName: string) => void
}

type SortKey = 'year' | 'make' | 'price'

export default function VehiclePickerSheet({ open, onOpenChange, onSelect }: Props) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [query, setQuery]       = useState('')
  const [sortKey, setSortKey]   = useState<SortKey>('year')
  const [sortAsc, setSortAsc]   = useState(false)
  const supabase = createClient()

  useEffect(() => {
    if (!open) return
    supabase
      .from('vehicles')
      .select('*')
      .in('status', ['available', 'staging', 'recon'])
      .then(({ data }) => setVehicles(data || []))
  }, [open, supabase])

  const filtered = useMemo(() => {
    const q = query.toLowerCase()
    const list = q
      ? vehicles.filter(v =>
          `${v.year} ${v.make} ${v.model} ${v.trim ?? ''} ${v.stock_no ?? ''} ${v.vin ?? ''}`.toLowerCase().includes(q)
        )
      : vehicles

    return [...list].sort((a, b) => {
      let av: number | string = 0
      let bv: number | string = 0
      if (sortKey === 'year')  { av = a.year ?? 0;  bv = b.year ?? 0 }
      if (sortKey === 'make')  { av = a.make ?? ''; bv = b.make ?? '' }
      if (sortKey === 'price') { av = a.price ?? 0; bv = b.price ?? 0 }
      if (av < bv) return sortAsc ? -1 : 1
      if (av > bv) return sortAsc ? 1 : -1
      return 0
    })
  }, [vehicles, query, sortKey, sortAsc])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(v => !v)
    else { setSortKey(key); setSortAsc(key === 'make') }
  }

  return (
    <Sheet open={open} onOpenChange={v => { onOpenChange(v); if (!v) setQuery('') }}>
      <SheetContent side="bottom" className="h-[85vh] flex flex-col rounded-t-2xl">
        <SheetHeader className="mb-2 shrink-0">
          <SheetTitle>Select a Vehicle</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-2 min-h-0 flex-1">
          <div className="relative shrink-0">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search year, make, model, stock…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="pl-8"
              autoFocus
            />
          </div>

          <div className="flex gap-1.5 shrink-0">
            {(['year', 'make', 'price'] as SortKey[]).map(key => (
              <button
                key={key}
                onClick={() => toggleSort(key)}
                className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border transition-colors ${sortKey === key ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:bg-accent'}`}
              >
                <ArrowUpDown className="h-3 w-3" />
                {key.charAt(0).toUpperCase() + key.slice(1)}
                {sortKey === key && (sortAsc ? ' ↑' : ' ↓')}
              </button>
            ))}
            <span className="ml-auto text-xs text-muted-foreground self-center">{filtered.length} vehicles</span>
          </div>

          <div className="overflow-y-auto flex-1 space-y-1.5 pr-0.5">
            {filtered.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">
                {query ? 'No vehicles match your search' : 'No available vehicles'}
              </p>
            )}
            {filtered.map(v => {
              const name = `${v.year} ${v.make} ${v.model}${v.trim ? ' ' + v.trim : ''}`
              return (
                <button
                  key={v.id}
                  onClick={() => onSelect(v.id, name)}
                  className="w-full text-left p-3 rounded-lg border hover:bg-accent transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{name}</p>
                      <p className="text-xs text-muted-foreground">
                        #{v.stock_no}
                        {v.mileage ? ` · ${v.mileage.toLocaleString()} mi` : ''}
                        {v.status !== 'available' ? ` · ${v.status}` : ''}
                      </p>
                    </div>
                    {v.price && <p className="font-semibold text-sm shrink-0">{formatCurrency(v.price)}</p>}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
