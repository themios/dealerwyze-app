'use client'

import Image from 'next/image'
import { useState, useMemo } from 'react'
import { toast } from 'sonner'
import { Download, Search, X, Car, Pencil, Check, Loader2, Trash2, ArrowUpDown, Receipt, ExternalLink, TrendingUp, TrendingDown } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

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
  entry_type: 'expense' | 'income'
  vendor_norm: string | null
  payer: string | null
  amount_total: number | null
  tax: number | null
  memo: string | null
  tags: string[] | null
  vehicle_id: string | null
  category_id: string | null
  receipt_id: string | null
  created_at: string
  receipt_categories?: { name: string; category_type?: string }[] | { name: string; category_type?: string } | null
  vehicles?: VehicleJoin[] | VehicleJoin | null
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
  allVehicles: Vehicle[]
  isAdmin: boolean
}

function getCatName(t: Transaction, categories: Category[]): string {
  if (t.category_id && categories.length) {
    const cat = categories.find(c => c.id === t.category_id)
    if (cat) return cat.name
  }
  const c = t.receipt_categories
  if (!c) return 'Uncategorized'
  return Array.isArray(c) ? (c[0]?.name ?? 'Uncategorized') : c.name
}

function getVehicle(t: Transaction, allVehicles: Vehicle[]): VehicleJoin | null {
  if (t.vehicle_id && allVehicles.length) {
    const v = allVehicles.find(v => v.id === t.vehicle_id)
    if (v) return { stock_no: v.stock_no, year: v.year, make: v.make, model: v.model }
  }
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
      if (tx.category_id) return tx.category_id
      const name = getCatName(tx, categories)
      return categories.find(c => c.name === name)?.id ?? ''
    })()
  )
  const [vehicleId, setVehicleId] = useState<string | null>(tx.vehicle_id)
  const [memo, setMemo] = useState(tx.memo ?? '')
  const [vendor, setVendor] = useState(tx.vendor_norm ?? '')
  const [amount, setAmount] = useState(tx.amount_total != null ? String(tx.amount_total) : '')
  const [date, setDate] = useState(tx.date?.slice(0, 10) ?? '')
  const [vehSearch, setVehSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null)
  const [receiptLoading, setReceiptLoading] = useState(false)

  const filteredVehicles = (list: Vehicle[]) =>
    vehSearch
      ? list.filter(v => vehicleLabel(v).toLowerCase().includes(vehSearch.toLowerCase()))
      : list

  async function loadReceipt() {
    if (!tx.receipt_id || receiptUrl) return
    setReceiptLoading(true)
    try {
      const res = await fetch(`/api/receipts/${tx.receipt_id}`)
      if (res.ok) {
        const data = await res.json()
        setReceiptUrl(data.receipt?.signed_url ?? null)
      }
    } finally {
      setReceiptLoading(false)
    }
  }

  async function save() {
    setSaving(true)
    setError(null)
    const parsedAmount = parseFloat(amount)
    if (amount && isNaN(parsedAmount)) {
      setError('Amount must be a valid number')
      setSaving(false)
      return
    }
    try {
      const res = await fetch(`/api/receipts/ledger/${tx.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category_id: categoryId || undefined,
          vehicle_id: vehicleId,
          memo: memo.trim() || null,
          vendor_norm: vendor.trim() || null,
          amount_total: amount ? parsedAmount : undefined,
          date: date || undefined,
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
        className="bg-background border-t rounded-t-2xl shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-muted-foreground/20" />
        </div>

        <div className="px-4 pb-8 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-base font-semibold">Edit Transaction</p>
            <div className="flex items-center gap-2">
              {tx.receipt_id && (
                <button
                  onClick={loadReceipt}
                  className="flex items-center gap-1.5 text-xs text-primary font-medium px-2 py-1 rounded-md hover:bg-primary/10 transition-colors"
                >
                  <Receipt className="h-3.5 w-3.5" />
                  {receiptLoading ? 'Loading…' : 'View Receipt'}
                </button>
              )}
              <button onClick={onClose}><X className="h-5 w-5 text-muted-foreground" /></button>
            </div>
          </div>

          {/* Receipt image */}
          {receiptUrl && (
            <div className="rounded-xl border overflow-hidden bg-muted/20">
              <div className="relative w-full h-64">
                <Image
                  src={receiptUrl}
                  alt="Receipt"
                  fill
                  className="object-contain"
                  unoptimized
                />
              </div>
              <a
                href={receiptUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 py-2 text-xs text-primary hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                Open full size
              </a>
            </div>
          )}

          {/* Vendor */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Vendor</p>
            <Input value={vendor} onChange={e => setVendor(e.target.value)} placeholder="Vendor name…" />
          </div>

          {/* Amount + Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Amount ($)</p>
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Date</p>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
          </div>

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
                <button onClick={() => setVehicleId(null)} className="text-xs text-destructive">Clear</button>
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
                  <p className="px-4 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide bg-muted/30">On Lot</p>
                  {filteredVehicles(lotVehicles).map(v => (
                    <button
                      key={v.id}
                      onClick={() => setVehicleId(v.id === vehicleId ? null : v.id)}
                      className={`w-full flex items-center gap-2 px-4 py-2 text-left hover:bg-muted/30 text-sm ${v.id === vehicleId ? 'bg-primary/5 text-primary' : ''}`}
                    >
                      <span className="truncate">{v.year} {v.make} {v.model} · {v.stock_no}</span>
                    </button>
                  ))}
                </>
              )}
              {filteredVehicles(soldVehicles).length > 0 && (
                <>
                  <p className="px-4 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide bg-muted/30">Recently Sold</p>
                  {filteredVehicles(soldVehicles).map(v => (
                    <button
                      key={v.id}
                      onClick={() => setVehicleId(v.id === vehicleId ? null : v.id)}
                      className={`w-full flex items-center gap-2 px-4 py-2 text-left hover:bg-muted/30 text-sm ${v.id === vehicleId ? 'bg-primary/5 text-primary' : ''}`}
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
            <Input value={memo} onChange={e => setMemo(e.target.value)} placeholder="Optional note…" />
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
  allVehicles,
  isAdmin,
}: Props) {
  const [transactions, setTransactions] = useState(initial)
  const [search, setSearch] = useState('')
  const [filterCat, setFilterCat] = useState('')
  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense'>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [filterMonth, setFilterMonth] = useState('')
  const [sortBy, setSortBy] = useState('date_desc')

  // Unique months from all transactions for the month dropdown
  const availableMonths = useMemo(() => {
    const seen = new Set<string>()
    transactions.forEach(t => {
      const m = (t.date ?? '').slice(0, 7)
      if (m) seen.add(m)
    })
    return Array.from(seen).sort().reverse()
  }, [transactions])

  const filtered = useMemo(() => {
    const result = transactions.filter(t => {
      const vendor = (t.vendor_norm ?? t.payer ?? '').toLowerCase()
      const memo = (t.memo ?? '').toLowerCase()
      const veh = getVehicle(t, allVehicles)
      const vehText = veh ? `${veh.year} ${veh.make} ${veh.model} ${veh.stock_no}`.toLowerCase() : ''
      const q = search.toLowerCase()

      if (search && !vendor.includes(q) && !memo.includes(q) && !vehText.includes(q)) return false
      if (filterType !== 'all' && (t.entry_type ?? 'expense') !== filterType) return false
      if (filterCat && getCatName(t, categories) !== filterCat) return false
      const txDate = (t.date ?? '').slice(0, 10)
      if (filterMonth && !txDate.startsWith(filterMonth)) return false
      if (dateFrom && txDate < dateFrom) return false
      if (dateTo && txDate > dateTo) return false
      return true
    })

    result.sort((a, b) => {
      switch (sortBy) {
        case 'date_asc':  return (a.date ?? '').localeCompare(b.date ?? '')
        case 'date_desc': return (b.date ?? '').localeCompare(a.date ?? '')
        case 'amount_desc': return (b.amount_total ?? 0) - (a.amount_total ?? 0)
        case 'amount_asc':  return (a.amount_total ?? 0) - (b.amount_total ?? 0)
        case 'vendor_az':   return (a.vendor_norm ?? '').localeCompare(b.vendor_norm ?? '')
        default: return 0
      }
    })

    return result
  }, [transactions, search, filterCat, filterMonth, dateFrom, dateTo, sortBy, categories, allVehicles])

  const totalIncome = filtered.filter(t => t.entry_type === 'income').reduce((sum, t) => sum + (t.amount_total ?? 0), 0)
  const totalExpenses = filtered.filter(t => t.entry_type !== 'income').reduce((sum, t) => sum + (t.amount_total ?? 0), 0)
  const netAmount = totalIncome - totalExpenses
  const hasFilters = search || filterCat || dateFrom || dateTo || filterMonth || filterType !== 'all'

  function handleSaved(updated: Transaction) {
    setTransactions(prev => prev.map(t => t.id === updated.id ? { ...t, ...updated } : t))
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this transaction? This cannot be undone.')) return
    setDeleting(id)
    try {
      const res = await fetch(`/api/receipts/ledger/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setTransactions(prev => prev.filter(t => t.id !== id))
        toast.success('Deleted. You can recover this within 7 days from your account admin or by contacting support.')
      }
    } finally {
      setDeleting(null)
    }
  }

  function exportCsv() {
    // Always export full ledger — no date restriction so the CSV is never blank.
    // Filter in Excel/Sheets as needed.
    window.location.href = '/api/receipts/ledger/export'
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

      {/* Income / Expense / All tabs */}
      <div className="grid grid-cols-3 gap-1 bg-muted rounded-lg p-1">
        {(['all', 'income', 'expense'] as const).map(type => (
          <button
            key={type}
            onClick={() => { setFilterType(type); setFilterCat('') }}
            className={`flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
              filterType === type
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {type === 'income' && <TrendingUp className="h-3 w-3 text-green-500" />}
            {type === 'expense' && <TrendingDown className="h-3 w-3 text-red-400" />}
            {type === 'all' ? 'All' : type.charAt(0).toUpperCase() + type.slice(1)}
          </button>
        ))}
      </div>

      {/* Month + Sort row */}
      <div className="grid grid-cols-2 gap-2">
        <Select value={filterMonth || 'all'} onValueChange={v => setFilterMonth(v === 'all' ? '' : v)}>
          <SelectTrigger className="h-9 text-xs">
            <SelectValue placeholder="All months" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All months</SelectItem>
            {availableMonths.map(m => {
              const [yr, mo] = m.split('-')
              const label = new Date(Number(yr), Number(mo) - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
              return <SelectItem key={m} value={m}>{label}</SelectItem>
            })}
          </SelectContent>
        </Select>

        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="h-9 text-xs">
            <ArrowUpDown className="h-3 w-3 mr-1 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="date_desc">Date: Newest first</SelectItem>
            <SelectItem value="date_asc">Date: Oldest first</SelectItem>
            <SelectItem value="amount_desc">Amount: High to low</SelectItem>
            <SelectItem value="amount_asc">Amount: Low to high</SelectItem>
            <SelectItem value="vendor_az">Vendor: A to Z</SelectItem>
          </SelectContent>
        </Select>
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
      <div className="rounded-xl border bg-card px-4 py-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{filtered.length} entries</span>
          {hasFilters && (
            <button
              onClick={() => { setSearch(''); setFilterCat(''); setDateFrom(''); setDateTo(''); setFilterMonth(''); setFilterType('all') }}
              className="text-xs text-primary"
            >
              Clear filters
            </button>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-xs text-muted-foreground">Income</p>
            <p className="text-sm font-bold text-green-600">+${totalIncome.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Expenses</p>
            <p className="text-sm font-bold text-red-500">-${totalExpenses.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Net</p>
            <p className={`text-sm font-bold ${netAmount >= 0 ? 'text-green-600' : 'text-red-500'}`}>
              {netAmount >= 0 ? '+' : ''}{netAmount.toFixed(2)}
            </p>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between py-1">
        <div />
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={exportCsv}>
            <Download className="h-3 w-3" />
            CSV
          </Button>
        </div>
      </div>

      {/* Transaction list */}
      {filtered.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">
          {transactions.length === 0 ? (
            <>
              <p className="text-sm font-medium">No ledger entries yet</p>
              <p className="text-xs mt-1">Post receipts and income documents to see them here.</p>
            </>
          ) : (
            <p className="text-sm">No transactions match your filters</p>
          )}
        </div>
      ) : (
        <div className="divide-y rounded-xl border bg-card overflow-hidden">
          {filtered.map(t => {
            const veh = getVehicle(t, allVehicles)
            const isIncome = t.entry_type === 'income'
            return (
              <div key={t.id} className={`flex items-start gap-3 px-4 py-3 ${isIncome ? 'bg-green-50/30 dark:bg-green-950/10' : ''}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    {isIncome && <TrendingUp className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />}
                    <p className="text-sm font-medium truncate">
                      {isIncome ? (t.payer ?? 'Unknown payer') : (t.vendor_norm ?? 'Unknown vendor')}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {getCatName(t, categories)}{t.memo ? ` · ${t.memo}` : ''}
                  </p>
                  {veh && (
                    <p className="flex items-center gap-1 text-xs text-primary mt-0.5">
                      <Car className="h-3 w-3" />
                      {veh.year} {veh.make} {veh.model} · {veh.stock_no}
                    </p>
                  )}
                </div>
                <div className="flex items-start gap-2 flex-shrink-0">
                  <div className="text-right" suppressHydrationWarning>
                    <p className={`text-sm font-semibold ${isIncome ? 'text-green-600' : ''}`}>
                      {isIncome ? '+' : ''}{t.amount_total != null ? `$${Number(t.amount_total).toFixed(2)}` : '—'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(t.date + 'T12:00:00').toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric',
                      })}
                    </p>
                  </div>
                  {isAdmin && (
                    <>
                      <button
                        onClick={() => setEditing(t)}
                        className="mt-0.5 p-1.5 rounded-lg hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(t.id)}
                        disabled={deleting === t.id}
                        className="mt-0.5 p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                      >
                        {deleting === t.id
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <Trash2 className="h-3.5 w-3.5" />
                        }
                      </button>
                    </>
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
