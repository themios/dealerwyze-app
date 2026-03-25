'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  CheckCircle, ChevronDown, ChevronUp, AlertTriangle,
  Loader2, BookmarkCheck, Car, Search, X, ZoomIn,
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
  status: 'staging' | 'available' | 'pending' | 'sold'
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

  const stagingVehicles = lotVehicles.filter(v => v.status === 'staging')
  const activeLotVehicles = lotVehicles.filter(v => v.status !== 'staging')
  const filteredStaging = filter(stagingVehicles)
  const filteredLot = filter(activeLotVehicles)
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
        {/* Staging */}
        {filteredStaging.length > 0 && (
          <>
            <p className="px-4 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide bg-purple-50/50 dark:bg-purple-950/10">
              Staging ({filteredStaging.length})
            </p>
            {filteredStaging.map(v => (
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
                <span className="text-[10px] text-purple-600 bg-purple-50 dark:bg-purple-950/30 px-1.5 py-0.5 rounded-full flex-shrink-0">Staging</span>
              </button>
            ))}
          </>
        )}

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

        {filteredStaging.length === 0 && filteredLot.length === 0 && filteredSold.length === 0 && (
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
  const [imageExpanded, setImageExpanded] = useState(true)
  const [lightboxOpen, setLightboxOpen] = useState(false)

  // Editable receipt fields
  const [vendor, setVendor] = useState(receipt.vendor_norm ?? receipt.vendor_raw ?? '')
  const [receiptDate, setReceiptDate] = useState(receipt.receipt_date ?? '')
  const [total, setTotal] = useState(receipt.total != null ? String(receipt.total) : '')

  async function saveField(field: 'vendor_norm' | 'receipt_date' | 'total', value: string) {
    await fetch(`/api/receipts/${receipt.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value || null }),
    })
  }

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

      {/* Receipt image (collapsible + lightbox) */}
      {receipt.signed_url && (
        <>
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
              <div className="relative bg-muted">
                <img
                  src={receipt.signed_url}
                  alt="Receipt"
                  className="w-full max-h-72 object-contain cursor-zoom-in"
                  onClick={() => setLightboxOpen(true)}
                />
                <button
                  onClick={() => setLightboxOpen(true)}
                  className="absolute top-2 right-2 bg-black/50 hover:bg-black/70 text-white rounded-full p-1.5"
                  title="View full size"
                >
                  <ZoomIn className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>

          {/* Lightbox */}
          {lightboxOpen && (
            <div
              className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
              onClick={() => setLightboxOpen(false)}
            >
              <button
                className="absolute top-4 right-4 text-white bg-black/50 hover:bg-black/70 rounded-full p-2"
                onClick={() => setLightboxOpen(false)}
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
              <img
                src={receipt.signed_url}
                alt="Receipt full size"
                className="max-w-full max-h-full object-contain"
                onClick={e => e.stopPropagation()}
              />
            </div>
          )}
        </>
      )}

      {/* Extracted data — editable */}
      <div className="rounded-xl border bg-card divide-y">
        <div className="px-4 py-2.5 flex items-center gap-3">
          <span className="text-sm text-muted-foreground w-14 shrink-0">Vendor</span>
          <input
            type="text"
            value={vendor}
            onChange={e => setVendor(e.target.value)}
            onBlur={() => saveField('vendor_norm', vendor)}
            placeholder="Enter vendor name"
            className="flex-1 text-sm font-medium bg-transparent outline-none border-b border-transparent focus:border-primary/50 transition-colors placeholder:text-muted-foreground/50 text-right"
          />
        </div>
        <div className="px-4 py-2.5 flex items-center gap-3">
          <span className="text-sm text-muted-foreground w-14 shrink-0">Date</span>
          <input
            type="date"
            value={receiptDate}
            onChange={e => setReceiptDate(e.target.value)}
            onBlur={() => saveField('receipt_date', receiptDate)}
            className="flex-1 text-sm font-medium bg-transparent outline-none border-b border-transparent focus:border-primary/50 transition-colors text-right"
          />
        </div>
        {receipt.subtotal != null && (
          <div className="px-4 py-2.5 flex justify-between items-baseline">
            <span className="text-sm text-muted-foreground">Subtotal</span>
            <span className="text-sm">${Number(receipt.subtotal).toFixed(2)}</span>
          </div>
        )}
        {receipt.tax != null && (
          <div className="px-4 py-2.5 flex justify-between items-baseline">
            <span className="text-sm text-muted-foreground">Tax</span>
            <span className="text-sm">${Number(receipt.tax).toFixed(2)}</span>
          </div>
        )}
        <div className="px-4 py-2.5 flex items-center gap-3">
          <span className="text-sm text-muted-foreground w-14 shrink-0">Total</span>
          <div className="flex-1 flex items-center justify-end gap-1">
            <span className="text-sm text-muted-foreground">$</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={total}
              onChange={e => setTotal(e.target.value)}
              onBlur={() => saveField('total', total)}
              placeholder="0.00"
              className="w-28 text-lg font-bold bg-transparent outline-none border-b border-transparent focus:border-primary/50 transition-colors text-right placeholder:font-normal placeholder:text-base placeholder:text-muted-foreground/50"
            />
          </div>
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
        <div className={`rounded-lg border-2 p-3 ${requiresVehicle ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/20' : 'border-dashed border-muted-foreground/30'}`}>
          <div className="flex items-center justify-between mb-2">
            <p className={`text-sm font-semibold flex items-center gap-1.5 ${
              requiresVehicle ? 'text-amber-700 dark:text-amber-400' : 'text-foreground'
            }`}>
              <Car className="h-4 w-4" />
              Assign to Vehicle
              {requiresVehicle && <span className="text-xs font-normal text-amber-600">(required)</span>}
            </p>
            {!requiresVehicle && (
              <button
                onClick={() => {
                  setShowVehicle(s => !s)
                  if (showVehicle) setVehicleId(null)
                }}
                className="text-sm font-medium text-primary flex items-center gap-1.5 px-3 py-1 rounded-md bg-primary/10 hover:bg-primary/20 transition-colors"
              >
                {showVehicle ? 'Remove' : vehicleId ? vehicleLabel(selectedVehicle!) : '+ Assign'}
              </button>
            )}
          </div>

          {/* Show selected vehicle summary when picker is closed */}
          {!vehiclePickerOpen && vehicleId && selectedVehicle && (
            <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
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
            <p className="text-xs text-amber-600 mt-1.5">
              This category tracks per-vehicle recon spend. Assign a unit to continue.
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
