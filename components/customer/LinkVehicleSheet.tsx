'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Vehicle } from '@/types'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatCurrency } from '@/lib/utils'
import { Link2, Search, ArrowUpDown, Home } from 'lucide-react'
import { useVertical } from '@/hooks/useVertical'

interface LinkVehicleSheetProps {
  customerId: string
  onLinked: () => void
  hasVehicle?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

const INTEREST_LEVELS = [
  { value: 'hot', label: 'Hot', color: 'bg-red-500/10 text-red-600' },
  { value: 'warm', label: 'Warm', color: 'bg-yellow-500/10 text-yellow-600' },
  { value: 'cold', label: 'Cold', color: 'bg-blue-500/10 text-blue-600' },
] as const

type SortKey = 'year' | 'make' | 'price'

export default function LinkVehicleSheet({ customerId, onLinked, hasVehicle, open: controlledOpen, onOpenChange }: LinkVehicleSheetProps) {
  const { vertical } = useVertical()
  const isRe = vertical === 'real_estate'
  const [internalOpen, setInternalOpen] = useState(false)
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen
  const setOpen = (v: boolean) => { setInternalOpen(v); onOpenChange?.(v) }
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [interest, setInterest] = useState<'hot' | 'warm' | 'cold'>('warm')
  const [saving, setSaving] = useState(false)
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('year')
  const [sortAsc, setSortAsc] = useState(false)
  const supabase = createClient()

  const buttonLabel = isRe ? 'Add Property' : 'Add Vehicle'
  const sheetTitle = isRe ? 'Link a Property' : 'Link a Vehicle'
  const linkButtonLabel = isRe ? 'Link Property' : 'Link Vehicle'
  const linkingLabel = isRe ? 'Linking property…' : 'Linking…'
  const ButtonIcon = isRe ? Home : Link2

  useEffect(() => {
    if (!open) return
    supabase.from('vehicles').select('*').in('status', ['available', 'staging', 'recon']).then(({ data }) => setVehicles(data || []))
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
      if (sortKey === 'year')  { av = a.year ?? 0;   bv = b.year ?? 0 }
      if (sortKey === 'make')  { av = a.make ?? '';  bv = b.make ?? '' }
      if (sortKey === 'price') { av = a.price ?? 0;  bv = b.price ?? 0 }
      if (av < bv) return sortAsc ? -1 : 1
      if (av > bv) return sortAsc ? 1 : -1
      return 0
    })
  }, [vehicles, query, sortKey, sortAsc])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(v => !v)
    else { setSortKey(key); setSortAsc(key === 'make') }
  }

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
    setQuery('')
    setOpen(false)
    onLinked()
  }

  const selectedVehicle = vehicles.find(v => v.id === selected)

  return (
    <>
      {controlledOpen === undefined && (
        <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="gap-1.5">
          <ButtonIcon className="h-4 w-4" />
          {hasVehicle ? buttonLabel : (isRe ? 'Link Property' : 'Link Vehicle')}
        </Button>
      )}

      <Sheet open={open} onOpenChange={v => { setOpen(v); if (!v) { setSelected(null); setQuery('') } }}>
        <SheetContent side="bottom" className="h-[85vh] flex flex-col rounded-t-2xl">
          <SheetHeader className="mb-2 shrink-0">
            <SheetTitle>{sheetTitle}</SheetTitle>
          </SheetHeader>

          {selected && selectedVehicle ? (
            <div className="space-y-4">
              <button className="text-sm text-primary" onClick={() => setSelected(null)}>← Back</button>
              <p className="font-medium">{selectedVehicle.year} {selectedVehicle.make} {selectedVehicle.model} {selectedVehicle.trim || ''}</p>
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
                {saving ? linkingLabel : linkButtonLabel}
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-2 min-h-0 flex-1">
              {/* Search */}
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

              {/* Sort buttons */}
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

              {/* List */}
              <div className="overflow-y-auto flex-1 space-y-1.5 pr-0.5">
                {filtered.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    {query ? 'No vehicles match your search' : 'No available vehicles'}
                  </p>
                )}
                {filtered.map(v => (
                  <button
                    key={v.id}
                    onClick={() => setSelected(v.id)}
                    className="w-full text-left p-3 rounded-lg border hover:bg-accent transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{v.year} {v.make} {v.model} {v.trim || ''}</p>
                        <p className="text-xs text-muted-foreground">
                          #{v.stock_no}
                          {v.mileage ? ` · ${v.mileage.toLocaleString()} mi` : ''}
                          {v.status !== 'available' ? ` · ${v.status}` : ''}
                        </p>
                      </div>
                      {v.price && <p className="font-semibold text-sm shrink-0">{formatCurrency(v.price)}</p>}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}
