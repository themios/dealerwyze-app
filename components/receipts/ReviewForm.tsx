'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  CheckCircle, ChevronDown, ChevronUp, AlertTriangle,
  Loader2, BookmarkCheck, Car, Search, X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface Category {
  id: string
  name: string
  requires_vehicle: boolean
  sort_order: number
}

interface Vehicle {
  id: string
  stock_no: string
  year: number
  make: string
  model: string
  status: 'available' | 'pending' | 'sold'
  sold_at?: string | null
}

interface Top3Item {
  category_id: string
  category_name: string
  confidence: number
  rationale: string
  requires_vehicle: boolean
}

interface ReceiptData {
  id: string
  vendor_raw: string | null
  vendor_norm: string | null
  receipt_date: string | null
  total: number | null
  tax: number | null
  subtotal: number | null
  location_raw: string | null
  payment_hint: string | null
  ai_json: {
    top3: Top3Item[]
    recommended_category_id: string | null
    requires_vehicle: boolean
    data_quality_flags: string[]
    memo: string
  } | null
  signed_url: string | null
  status: string
}

interface Props {
  receipt: ReceiptData
  categories: Category[]
  lotVehicles: Vehicle[]
  soldVehicles: Vehicle[]
}

function vehicleLabel(v: Vehicle) {
  return `${v.year} ${v.make} ${v.model} · ${v.stock_no}`
}

function VehiclePicker({
  lotVehicles,
  soldVehicles,
  value,
  onChange,
}: {
  lotVehicles: Vehicle[]
  soldVehicles: Vehicle[]
  value: string | null
  onChange: (id: string | null) => void
}) {
  const [query, setQuery] = useState('')

  const filter = (list: Vehicle[]) =>
    query.trim()
      ? list.filter(v =>
          vehicleLabel(v).toLowerCase().includes(query.toLowerCase()) ||
          v.stock_no.toLowerCase().includes(query.toLowerCase())
        )
      : list

  const filteredLot = filter(lotVehicles)
  const filteredSold = filter(soldVehicles)
  const selected = [...lotVehicles, ...soldVehicles].find(v => v.id === value)

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      {/* Search */}
      <div className="relative border-b">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          className="w-full pl-9 pr-9 py-2.5 text-sm bg-transparent outline-none placeholder:text-muted-foreground"
          placeholder="Search stock# or year/make/model…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        {query && (
          <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Clear selection */}
      {value && (
        <button
          onClick={() => onChange(null)}
          className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-muted-foreground hover:bg-muted/30 border-b"
        >
          <X className="h-3.5 w-3.5" />
          Clear — {selected ? vehicleLabel(selected) : 'selected'}
        </button>
      )}

      <div className="max-h-52 overflow-y-auto divide-y">
        {/* On Lot */}
        {filteredLot.length > 0 && (
          <>
            <p className="px-4 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide bg-muted/30">
              On Lot ({filteredLot.length})
            </p>
            {filteredLot.map(v => (
              <button
                key={v.id}
                onClick={() => onChange(v.id === value ? null : v.id)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/30 transition-colors ${
                  v.id === value ? 'bg-primary/5' : ''
                }`}
              >
                <div className={`flex-shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                  v.id === value ? 'border-primary' : 'border-muted-foreground/30'
                }`}>
                  {v.id === value && <div className="w-2 h-2 rounded-full bg-primary" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{v.year} {v.make} {v.model}</p>
                  <p className="text-xs text-muted-foreground">Stock {v.stock_no}</p>
                </div>
                {v.status === 'pending' && (
                  <span className="text-[10px] text-amber-600 bg-amber-50 dark:bg-amber-950/30 px-1.5 py-0.5 rounded-full">Pending</span>
                )}
              </button>
            ))}
          </>
        )}

        {/* Recently Sold */}
        {filteredSold.length > 0 && (
          <>
            <p className="px-4 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide bg-muted/30">
              Recently Sold ({filteredSold.length})
            </p>
            {filteredSold.map(v => (
              <button
                key={v.id}
                onClick={() => onChange(v.id === value ? null : v.id)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/30 transition-colors ${
                  v.id === value ? 'bg-primary/5' : ''
                }`}
              >
                <div className={`flex-shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                  v.id === value ? 'border-primary' : 'border-muted-foreground/30'
                }`}>
                  {v.id === value && <div className="w-2 h-2 rounded-full bg-primary" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{v.year} {v.make} {v.model}</p>
                  <p className="text-xs text-muted-foreground">Stock {v.stock_no}</p>
                </div>
                <span className="text-[10px] text-muted-foreground flex-shrink-0">
                  Sold {v.sold_at ? new Date(v.sold_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
                </span>
              </button>
            ))}
          </>
        )}

        {filteredLot.length === 0 && filteredSold.length === 0 && (
          <p className="px-4 py-4 text-sm text-muted-foreground text-center">No vehicles match</p>
        )}
      </div>
    </div>
  )
}

export default function ReviewForm({ receipt, categories, lotVehicles, soldVehicles }: Props) {
  const router = useRouter()
  const ai = receipt.ai_json

  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(
    ai?.recommended_category_id ?? categories[0]?.id ?? ''
  )
  const [memo, setMemo] = useState(ai?.memo ?? '')
  const [vehicleId, setVehicleId] = useState<string | null>(null)
  const [showVehicle, setShowVehicle] = useState(false)
  const [saveRule, setSaveRule] = useState(false)
  const [showAllCategories, setShowAllCategories] = useState(false)
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [imageExpanded, setImageExpanded] = useState(false)

  const selectedCategory = categories.find(c => c.id === selectedCategoryId)
  const requiresVehicle = selectedCategory?.requires_vehicle ?? false
  const top3 = ai?.top3 ?? []
  const flags = ai?.data_quality_flags ?? []
  const allVehicles = [...lotVehicles, ...soldVehicles]
  const selectedVehicle = allVehicles.find(v => v.id === vehicleId)

  // Auto-expand vehicle picker when category requires it
  const vehiclePickerOpen = requiresVehicle || showVehicle

  async function handlePost() {
    if (!selectedCategoryId) { setError('Please select a category'); return }
    if (requiresVehicle && !vehicleId) { setError('This category requires a vehicle assignment'); return }
    setPosting(true)
    setError(null)
    try {
      const res = await fetch(`/api/receipts/${receipt.id}/post`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category_id: selectedCategoryId,
          memo: memo.trim() || undefined,
          vehicle_id: vehicleId,
          save_vendor_rule: saveRule,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to post')
      router.push('/receipts')
      router.refresh()
    } catch (e) {
      setError(String(e))
      setPosting(false)
    }
  }

  return (
    <div className="px-4 pb-8 space-y-4">

      {/* Receipt image (collapsible) */}
      {receipt.signed_url && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <button
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium"
            onClick={() => setImageExpanded(e => !e)}
          >
            Receipt Image
            {imageExpanded
              ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
              : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </button>
          {imageExpanded && (
            <img
              src={receipt.signed_url}
              alt="Receipt"
              className="w-full max-h-72 object-contain bg-muted"
            />
          )}
        </div>
      )}

      {/* Extracted data */}
      <div className="rounded-xl border bg-card divide-y">
        <div className="px-4 py-3 flex justify-between items-baseline">
          <span className="text-sm text-muted-foreground">Vendor</span>
          <span className="text-sm font-medium text-right max-w-[60%] truncate">
            {receipt.vendor_norm ?? receipt.vendor_raw ?? '—'}
          </span>
        </div>
        <div className="px-4 py-3 flex justify-between items-baseline">
          <span className="text-sm text-muted-foreground">Date</span>
          <span className="text-sm font-medium">
            {receipt.receipt_date
              ? new Date(receipt.receipt_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
              : '—'}
          </span>
        </div>
        {receipt.subtotal != null && (
          <div className="px-4 py-3 flex justify-between items-baseline">
            <span className="text-sm text-muted-foreground">Subtotal</span>
            <span className="text-sm">${Number(receipt.subtotal).toFixed(2)}</span>
          </div>
        )}
        {receipt.tax != null && (
          <div className="px-4 py-3 flex justify-between items-baseline">
            <span className="text-sm text-muted-foreground">Tax</span>
            <span className="text-sm">${Number(receipt.tax).toFixed(2)}</span>
          </div>
        )}
        <div className="px-4 py-3 flex justify-between items-baseline">
          <span className="text-sm text-muted-foreground">Total</span>
          <span className="text-lg font-bold">
            {receipt.total != null ? `$${Number(receipt.total).toFixed(2)}` : '—'}
          </span>
        </div>
      </div>

      {/* Data quality flags */}
      {flags.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-950/20 dark:border-amber-800 px-3 py-2.5">
          <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-medium text-amber-700 dark:text-amber-400">Review needed</p>
            <p className="text-xs text-amber-600 dark:text-amber-500">{flags.join(' · ')}</p>
          </div>
        </div>
      )}

      {/* Category selection */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Category</p>

        {/* Top-3 AI suggestions */}
        {top3.length > 0 && (
          <div className="space-y-2 mb-3">
            {top3.map(item => (
              <button
                key={item.category_id}
                onClick={() => setSelectedCategoryId(item.category_id)}
                className={`w-full flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
                  selectedCategoryId === item.category_id
                    ? 'border-primary bg-primary/5'
                    : 'border-border bg-card hover:bg-muted/30'
                }`}
              >
                <div className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                  selectedCategoryId === item.category_id ? 'border-primary' : 'border-muted-foreground/30'
                }`}>
                  {selectedCategoryId === item.category_id && (
                    <div className="w-2.5 h-2.5 rounded-full bg-primary" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{item.category_name}</p>
                  <p className="text-xs text-muted-foreground">{item.rationale}</p>
                </div>
                <span className={`text-xs font-medium flex-shrink-0 ${
                  item.confidence >= 0.7 ? 'text-green-600' :
                  item.confidence >= 0.4 ? 'text-amber-500' : 'text-muted-foreground'
                }`}>
                  {Math.round(item.confidence * 100)}%
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Show all categories toggle */}
        <button
          onClick={() => setShowAllCategories(s => !s)}
          className="text-xs text-primary flex items-center gap-1 mb-2"
        >
          {showAllCategories ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {showAllCategories ? 'Hide' : 'Show'} all categories
        </button>

        {showAllCategories && (
          <div className="rounded-xl border bg-card divide-y overflow-hidden">
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategoryId(cat.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors ${
                  selectedCategoryId === cat.id ? 'bg-primary/5' : ''
                }`}
              >
                <div className={`flex-shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                  selectedCategoryId === cat.id ? 'border-primary' : 'border-muted-foreground/30'
                }`}>
                  {selectedCategoryId === cat.id && (
                    <div className="w-2 h-2 rounded-full bg-primary" />
                  )}
                </div>
                <span className="text-sm">{cat.name}</span>
                {cat.requires_vehicle && (
                  <span className="ml-auto text-xs text-muted-foreground">needs vehicle</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Vehicle assignment */}
      {(lotVehicles.length > 0 || soldVehicles.length > 0) && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className={`text-xs font-semibold uppercase tracking-wide ${
              requiresVehicle ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'
            }`}>
              Vehicle {requiresVehicle ? '(required)' : '(optional)'}
            </p>
            {!requiresVehicle && (
              <button
                onClick={() => {
                  setShowVehicle(s => !s)
                  if (showVehicle) setVehicleId(null)
                }}
                className="text-xs text-primary flex items-center gap-1"
              >
                <Car className="h-3 w-3" />
                {showVehicle ? 'Remove' : vehicleId ? vehicleLabel(selectedVehicle!) : 'Assign'}
              </button>
            )}
          </div>

          {/* Show selected vehicle summary when picker is closed */}
          {!vehiclePickerOpen && vehicleId && selectedVehicle && (
            <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
              <Car className="h-4 w-4 text-primary flex-shrink-0" />
              <span className="text-sm font-medium">{vehicleLabel(selectedVehicle)}</span>
            </div>
          )}

          {vehiclePickerOpen && (
            <VehiclePicker
              lotVehicles={lotVehicles}
              soldVehicles={soldVehicles}
              value={vehicleId}
              onChange={setVehicleId}
            />
          )}

          {requiresVehicle && !vehicleId && (
            <p className="text-xs text-amber-600 mt-1">
              This category tracks per-vehicle recon spend. Assign a unit.
            </p>
          )}
        </div>
      )}

      {/* Memo */}
      <div>
        <Label htmlFor="memo" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Memo (optional)
        </Label>
        <Input
          id="memo"
          className="mt-1.5"
          placeholder="e.g. Brake pads for Stock C-205"
          value={memo}
          onChange={e => setMemo(e.target.value)}
        />
      </div>

      {/* Save vendor rule */}
      {receipt.vendor_norm && (
        <button
          onClick={() => setSaveRule(s => !s)}
          className={`w-full flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
            saveRule ? 'border-primary bg-primary/5' : 'border-border bg-card'
          }`}
        >
          <BookmarkCheck className={`h-4 w-4 flex-shrink-0 ${saveRule ? 'text-primary' : 'text-muted-foreground'}`} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Remember for {receipt.vendor_norm}</p>
            <p className="text-xs text-muted-foreground">
              Auto-select {selectedCategory?.name ?? 'this category'} next time
            </p>
          </div>
          <div className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center ${
            saveRule ? 'border-primary bg-primary' : 'border-muted-foreground/40'
          }`}>
            {saveRule && <CheckCircle className="h-3 w-3 text-white" />}
          </div>
        </button>
      )}

      {error && (
        <p className="text-sm text-destructive text-center">{error}</p>
      )}

      {/* Post button */}
      <Button
        size="lg"
        className="w-full h-14 text-base font-semibold bg-[#F07018] hover:bg-[#d95e10] text-white"
        onClick={handlePost}
        disabled={posting || !selectedCategoryId}
      >
        {posting ? (
          <><Loader2 className="h-5 w-5 animate-spin mr-2" />Posting…</>
        ) : (
          'Post to Ledger'
        )}
      </Button>
    </div>
  )
}
