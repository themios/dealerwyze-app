'use client'

import { useState, useMemo } from 'react'
import { Download, Search, X, Car, Pencil, Check, Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

interface VehicleJoin {
  stock_no: string
  year: number
  make: string
  model: string
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

interface Transaction {
  id: string
  date: string
  vendor_norm: string | null
  amount_total: number | null
  tax: number | null
  memo: string | null
  tags: string[] | null
  vehicle_id: string | null
  created_at: string
  receipt_categories: { name: string }[] | { name: string } | null
  vehicles: VehicleJoin[] | VehicleJoin | null
}

interface Category {
  id: string
  name: string
}

interface Props {
  transactions: Transaction[]
  categories: Category[]
  lotVehicles: Vehicle[]
  soldVehicles: Vehicle[]
  isAdmin: boolean
}

function getCatName(t: Transaction): string {
  const c = t.receipt_categories
  if (!c) return 'Uncategorized'
  return Array.isArray(c) ? (c[0]?.name ?? 'Uncategorized') : c.name
}

function getVehicle(t: Transaction): VehicleJoin | null {
  if (!t.vehicles) return null
  return Array.isArray(t.vehicles) ? (t.vehicles[0] ?? null) : t.vehicles
}

function vehicleLabel(v: Vehicle) {
  return `${v.year} ${v.make} ${v.model} · ${v.stock_no}`
}

// ─── Edit Sheet ────────────────────────────────────────────────────────────────
function EditSheet({
  tx,
  categories,
  lotVehicles,
  soldVehicles,
  onClose,
  onSaved,
}: {
  tx: Transaction
  categories: Category[]
  lotVehicles: Vehicle[]
  soldVehicles: Vehicle[]
  onClose: () => void
  onSaved: (updated: Transaction) => void
}) {
  const allVehicles = [...lotVehicles, ...soldVehicles]
  const [categoryId, setCategoryId] = useState(
    (() => {
      // Try to find category id by name (we only have name in the join)
      const name = getCatName(tx)
      return categories.find(c => c.name === name)?.id ?? ''
    })()
  )
  const [vehicleId, setVehicleId] = useState<string | null>(tx.vehicle_id)
  const [memo, setMemo] = useState(tx.memo ?? '')
  const [vehSearch, setVehSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const filteredVehicles = (list: Vehicle[]) =>
    vehSearch
      ? list.filter(v => vehicleLabel(v).toLowerCase().includes(vehSearch.toLowerCase()))
      : list

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/receipts/ledger/${tx.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category_id: categoryId || undefined,
          vehicle_id: vehicleId,
          memo: memo.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Save failed')
      onSaved(data.transaction)
      onClose()
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={onClose}>
      <div
        className="bg-background border-t rounded-t-2xl shadow-xl max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-muted-foreground/20" />
        </div>

        <div className="px-4 pb-8 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-base font-semibold">Edit Transaction</p>
            <button onClick={onClose}><X className="h-5 w-5 text-muted-foreground" /></button>
          </div>

          <p className="text-sm text-muted-foreground">
            {tx.vendor_norm ?? 'Unknown vendor'} ·{' '}
            {tx.amount_total != null ? `$${Number(tx.amount_total).toFixed(2)}` : '—'}
          </p>

          {/* Category */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Category</p>
            <div className="rounded-xl border bg-card divide-y overflow-hidden max-h-44 overflow-y-auto">
              {categories.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setCategoryId(cat.id)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/30 transition-colors ${
                    categoryId === cat.id ? 'bg-primary/5' : ''
                  }`}
                >
                  <div className={`flex-shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                    categoryId === cat.id ? 'border-primary' : 'border-muted-foreground/30'
                  }`}>
                    {categoryId === cat.id && <div className="w-2 h-2 rounded-full bg-primary" />}
                  </div>
                  <span className="text-sm">{cat.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Vehicle */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Vehicle</p>
              {vehicleId && (
                <button onClick={() => setVehicleId(null)} className="text-xs text-destructive">
                  Clear
                </button>
              )}
            </div>

            {vehicleId && (
              <p className="flex items-center gap-1.5 text-sm text-primary mb-2 font-medium">
                <Car className="h-3.5 w-3.5" />
                {allVehicles.find(v => v.id === vehicleId)
                  ? vehicleLabel(allVehicles.find(v => v.id === vehicleId)!)
                  : 'Selected'}
              </p>
            )}

            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border bg-background outline-none placeholder:text-muted-foreground"
                placeholder="Search stock# or year/make…"
                value={vehSearch}
                onChange={e => setVehSearch(e.target.value)}
              />
            </div>

            <div className="rounded-xl border bg-card divide-y overflow-hidden max-h-40 overflow-y-auto">
              {filteredVehicles(lotVehicles).length > 0 && (
                <>
                  <p className="px-4 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide bg-muted/30">
                    On Lot
                  </p>
                  {filteredVehicles(lotVehicles).map(v => (
                    <button
                      key={v.id}
                      onClick={() => setVehicleId(v.id === vehicleId ? null : v.id)}
                      className={`w-full flex items-center gap-2 px-4 py-2 text-left hover:bg-muted/30 text-sm ${
                        v.id === vehicleId ? 'bg-primary/5 text-primary' : ''
                      }`}
                    >
                      <span className="truncate">{v.year} {v.make} {v.model} · {v.stock_no}</span>
                    </button>
                  ))}
                </>
              )}
              {filteredVehicles(soldVehicles).length > 0 && (
                <>
                  <p className="px-4 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide bg-muted/30">
                    Recently Sold
                  </p>
                  {filteredVehicles(soldVehicles).map(v => (
                    <button
                      key={v.id}
                      onClick={() => setVehicleId(v.id === vehicleId ? null : v.id)}
                      className={`w-full flex items-center gap-2 px-4 py-2 text-left hover:bg-muted/30 text-sm ${
                        v.id === vehicleId ? 'bg-primary/5 text-primary' : ''
                      }`}
                    >
                      <span className="truncate">{v.year} {v.make} {v.model} · {v.stock_no}</span>
                    </button>
                  ))}
                </>
              )}
              {filteredVehicles(lotVehicles).length === 0 && filteredVehicles(soldVehicles).length === 0 && (
                <p className="px-4 py-3 text-sm text-muted-foreground">No matches</p>
              )}
            </div>
          </div>

          {/* Memo */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Memo</p>
            <Input
              value={memo}
              onChange={e => setMemo(e.target.value)}
              placeholder="Optional note…"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button
            className="w-full h-12 bg-[#F07018] hover:bg-[#d95e10] text-white font-semibold"
            onClick={save}
            disabled={saving}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
            Save Changes
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function LedgerClient({
  transactions: initial,
  categories,
  lotVehicles,
  soldVehicles,
  isAdmin,
}: Props) {
  const [transactions, setTransactions] = useState(initial)
  const [search, setSearch] = useState('')
  const [filterCat, setFilterCat] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [editing, setEditing] = useState<Transaction | null>(null)

  const filtered = useMemo(() => {
    return transactions.filter(t => {
      const vendor = (t.vendor_norm ?? '').toLowerCase()
      const memo = (t.memo ?? '').toLowerCase()
      const veh = getVehicle(t)
      const vehText = veh ? `${veh.year} ${veh.make} ${veh.model} ${veh.stock_no}`.toLowerCase() : ''
      const q = search.toLowerCase()

      if (search && !vendor.includes(q) && !memo.includes(q) && !vehText.includes(q)) return false
      if (filterCat && getCatName(t) !== filterCat) return false
      if (dateFrom && t.date < dateFrom) return false
      if (dateTo && t.date > dateTo) return false
      return true
    })
  }, [transactions, search, filterCat, dateFrom, dateTo])

  const totalAmount = filtered.reduce((sum, t) => sum + (t.amount_total ?? 0), 0)
  const hasFilters = search || filterCat || dateFrom || dateTo

  function handleSaved(updated: Transaction) {
    setTransactions(prev => prev.map(t => t.id === updated.id ? { ...t, ...updated } : t))
  }

  function exportCsv() {
    const params = new URLSearchParams()
    if (dateFrom) params.set('date_from', dateFrom)
    if (dateTo) params.set('date_to', dateTo)
    window.location.href = `/api/receipts/ledger/export?${params}`
  }

  return (
    <div className="px-4 space-y-3">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9 pr-9"
          placeholder="Search vendor, memo, or stock#…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Date filters */}
      <div className="grid grid-cols-2 gap-2">
        <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="text-xs" />
        <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="text-xs" />
      </div>

      {/* Category chips */}
      {categories.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4">
          <button
            onClick={() => setFilterCat('')}
            className={`flex-shrink-0 text-xs px-3 py-1.5 rounded-full border transition-colors ${
              !filterCat ? 'bg-primary text-primary-foreground border-primary' : 'border-border bg-card'
            }`}
          >
            All
          </button>
          {categories.map(c => (
            <button
              key={c.id}
              onClick={() => setFilterCat(filterCat === c.name ? '' : c.name)}
              className={`flex-shrink-0 text-xs px-3 py-1.5 rounded-full border transition-colors whitespace-nowrap ${
                filterCat === c.name ? 'bg-primary text-primary-foreground border-primary' : 'border-border bg-card'
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      {/* Summary bar */}
      <div className="flex items-center justify-between py-2 border-b">
        <div>
          <span className="text-sm font-semibold">{filtered.length} transactions</span>
          {hasFilters && (
            <button
              onClick={() => { setSearch(''); setFilterCat(''); setDateFrom(''); setDateTo('') }}
              className="ml-2 text-xs text-primary"
            >
              Clear
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold">${totalAmount.toFixed(2)}</span>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={exportCsv}>
            <Download className="h-3 w-3" />
            CSV
          </Button>
        </div>
      </div>

      {/* Transaction list */}
      {filtered.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">
          <p className="text-sm">No transactions match your filters</p>
        </div>
      ) : (
        <div className="divide-y rounded-xl border bg-card overflow-hidden">
          {filtered.map(t => {
            const veh = getVehicle(t)
            return (
              <div key={t.id} className="flex items-start gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {t.vendor_norm ?? 'Unknown vendor'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {getCatName(t)}{t.memo ? ` · ${t.memo}` : ''}
                  </p>
                  {veh && (
                    <p className="flex items-center gap-1 text-xs text-primary mt-0.5">
                      <Car className="h-3 w-3" />
                      {veh.year} {veh.make} {veh.model} · {veh.stock_no}
                    </p>
                  )}
                </div>
                <div className="flex items-start gap-2 flex-shrink-0">
                  <div className="text-right">
                    <p className="text-sm font-semibold">
                      {t.amount_total != null ? `$${Number(t.amount_total).toFixed(2)}` : '—'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(t.date + 'T12:00:00').toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric',
                      })}
                    </p>
                  </div>
                  {isAdmin && (
                    <button
                      onClick={() => setEditing(t)}
                      className="mt-0.5 p-1.5 rounded-lg hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Admin edit sheet */}
      {editing && isAdmin && (
        <EditSheet
          tx={editing}
          categories={categories}
          lotVehicles={lotVehicles}
          soldVehicles={soldVehicles}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}
