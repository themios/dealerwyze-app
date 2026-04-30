'use client'

import { useState, useEffect } from 'react'
import { Bell, Plus, X, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'

interface VehicleWant {
  id: string
  year_min: number | null
  year_max: number | null
  make: string | null
  model: string | null
  body_style: string | null
  max_price: number | null
  notes: string | null
  status: string
  created_at: string
}

interface Props {
  customerId: string
  customerName: string
  prefillVehicle?: {
    year?: number | null
    make?: string | null
    model?: string | null
    body_style?: string | null
    price?: number | null
  } | null
}

const BODY_STYLES = [
  { value: '', label: 'Any type' },
  { value: 'pickup', label: 'Pickup truck' },
  { value: 'suv', label: 'SUV' },
  { value: 'sedan', label: 'Sedan' },
  { value: 'coupe', label: 'Coupe' },
  { value: 'van', label: 'Van' },
  { value: 'minivan', label: 'Minivan' },
  { value: 'wagon', label: 'Wagon' },
  { value: 'convertible', label: 'Convertible' },
  { value: 'hatchback', label: 'Hatchback' },
  { value: 'other', label: 'Other' },
]

function formatWantLabel(w: VehicleWant): string {
  const parts: string[] = []
  if (w.year_min && w.year_max) parts.push(`${w.year_min}-${w.year_max}`)
  else if (w.year_min) parts.push(`${w.year_min}+`)
  else if (w.year_max) parts.push(`up to ${w.year_max}`)
  if (w.make) parts.push(w.make)
  if (w.model) parts.push(w.model)
  else if (w.body_style) parts.push(BODY_STYLES.find(b => b.value === w.body_style)?.label ?? w.body_style)
  if (w.max_price) parts.push(`under $${w.max_price.toLocaleString()}`)
  return parts.join(' ') || 'Any vehicle'
}

export default function WantListSheet({ customerId, customerName, prefillVehicle }: Props) {
  const [open, setOpen] = useState(false)
  const [wants, setWants] = useState<VehicleWant[]>([])
  const [loading, setLoading] = useState(false)
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  // Form state
  const [yearMin, setYearMin] = useState('')
  const [yearMax, setYearMax] = useState('')
  const [make, setMake] = useState('')
  const [model, setModel] = useState('')
  const [bodyStyle, setBodyStyle] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (!open) return
    let cancelled = false

    fetch(`/api/vehicle-wants?customer_id=${customerId}`)
      .then(r => r.json())
      .then(data => {
        if (!cancelled) setWants(Array.isArray(data) ? data.filter((w: VehicleWant) => w.status === 'active') : [])
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [open, customerId])

  function openAddForm() {
    // Pre-fill from primary vehicle if available
    if (prefillVehicle) {
      setYearMin(prefillVehicle.year ? String(prefillVehicle.year) : '')
      setYearMax('')
      setMake(prefillVehicle.make ?? '')
      setModel(prefillVehicle.model ?? '')
      setBodyStyle(prefillVehicle.body_style ?? '')
      setMaxPrice(prefillVehicle.price ? String(Math.round(prefillVehicle.price)) : '')
    } else {
      setYearMin(''); setYearMax(''); setMake(''); setModel(''); setBodyStyle(''); setMaxPrice('')
    }
    setNotes('')
    setAdding(true)
  }

  async function handleSave() {
    if (!yearMin && !yearMax && !make && !model && !bodyStyle) return
    setSaving(true)
    const res = await fetch('/api/vehicle-wants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer_id: customerId,
        year_min: yearMin || null,
        year_max: yearMax || null,
        make: make || null,
        model: model || null,
        body_style: bodyStyle || null,
        max_price: maxPrice || null,
        notes: notes || null,
      }),
    })
    if (res.ok) {
      const created = await res.json() as VehicleWant
      setWants(prev => [created, ...prev])
      setAdding(false)
    }
    setSaving(false)
  }

  async function handleCancel(id: string) {
    setDeleting(id)
    await fetch(`/api/vehicle-wants/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'cancelled' }),
    })
    setWants(prev => prev.filter(w => w.id !== id))
    setDeleting(null)
  }

  const hasActive = wants.length > 0

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          setLoading(true)
          setOpen(true)
        }}
        className={`gap-1.5 ${hasActive ? 'text-blue-600' : 'text-muted-foreground'}`}
        title="Want list - keep customer informed when a matching vehicle arrives"
      >
        <Bell className={`h-4 w-4 ${hasActive ? 'fill-blue-100' : ''}`} />
        {hasActive && <span className="text-xs font-medium">{wants.length}</span>}
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="h-[85vh] overflow-y-auto">
          <SheetHeader className="pb-2">
            <SheetTitle className="text-base">
              Want List - {customerName}
            </SheetTitle>
            <p className="text-xs text-muted-foreground">
              Alert you when a matching vehicle arrives so you can reach out.
            </p>
          </SheetHeader>

          <div className="mt-4 space-y-3">
            {loading && <p className="text-sm text-muted-foreground text-center py-4">Loading...</p>}

            {!loading && wants.length === 0 && !adding && (
              <p className="text-sm text-muted-foreground text-center py-6">
                No active entries. Add one to get alerted when a match arrives.
              </p>
            )}

            {/* Existing entries */}
            {wants.map(w => (
              <div key={w.id} className="flex items-start justify-between gap-3 p-3 rounded-lg border bg-blue-50/50 dark:bg-blue-950/10 border-blue-100 dark:border-blue-900">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{formatWantLabel(w)}</p>
                  {w.notes && <p className="text-xs text-muted-foreground mt-0.5 italic">{w.notes}</p>}
                </div>
                <button
                  onClick={() => handleCancel(w.id)}
                  disabled={deleting === w.id}
                  className="text-muted-foreground hover:text-destructive shrink-0 p-1 disabled:opacity-40"
                  title="Remove"
                >
                  {deleting === w.id ? <span className="text-xs">...</span> : <Trash2 className="h-4 w-4" />}
                </button>
              </div>
            ))}

            {/* Add form */}
            {adding ? (
              <div className="rounded-lg border p-4 space-y-3 bg-background">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Add vehicle criteria</p>
                  <button onClick={() => setAdding(false)} title="Cancel">
                    <X className="h-4 w-4 text-muted-foreground" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-muted-foreground">Year from</label>
                    <Input
                      type="number"
                      placeholder="e.g. 2010"
                      value={yearMin}
                      onChange={e => setYearMin(e.target.value)}
                      className="h-9 text-sm mt-0.5"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Year to</label>
                    <Input
                      type="number"
                      placeholder="e.g. 2015"
                      value={yearMax}
                      onChange={e => setYearMax(e.target.value)}
                      className="h-9 text-sm mt-0.5"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs text-muted-foreground">Vehicle type</label>
                  <select
                    value={bodyStyle}
                    onChange={e => setBodyStyle(e.target.value)}
                    className="mt-0.5 w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#F07018]"
                  >
                    {BODY_STYLES.map(b => (
                      <option key={b.value} value={b.value}>{b.label}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-muted-foreground">Make (optional)</label>
                    <Input
                      placeholder="e.g. Ford"
                      value={make}
                      onChange={e => setMake(e.target.value)}
                      className="h-9 text-sm mt-0.5"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Model (optional)</label>
                    <Input
                      placeholder="e.g. F-150"
                      value={model}
                      onChange={e => setModel(e.target.value)}
                      className="h-9 text-sm mt-0.5"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs text-muted-foreground">Max price (optional)</label>
                  <Input
                    type="number"
                    placeholder="e.g. 25000"
                    value={maxPrice}
                    onChange={e => setMaxPrice(e.target.value)}
                    className="h-9 text-sm mt-0.5"
                  />
                </div>

                <div>
                  <label className="text-xs text-muted-foreground">Notes (optional)</label>
                  <Input
                    placeholder="e.g. needs 4WD, low miles preferred"
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    className="h-9 text-sm mt-0.5"
                  />
                </div>

                <Button
                  size="sm"
                  className="w-full bg-[#0D2B55] text-white"
                  onClick={handleSave}
                  disabled={saving || (!yearMin && !yearMax && !make && !model && !bodyStyle)}
                >
                  {saving ? 'Saving...' : 'Save'}
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-1.5"
                onClick={openAddForm}
              >
                <Plus className="h-4 w-4" />
                Add vehicle criteria
              </Button>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
