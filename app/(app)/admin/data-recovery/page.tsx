'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import TopBar from '@/components/layout/TopBar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'

type RecoveryTable =
  | 'deleted_customers'
  | 'deleted_activities'
  | 'deleted_vehicles'
  | 'deleted_ledger_transactions'

type RecoveryRecord = {
  recovery_id: string
  original_id: string
  org_id: string
  deleted_at: string
  expires_at: string
  row_data: Record<string, unknown>
  restored_at: string | null
  purged_at: string | null
}

type DeletedCustomerSearchRow = RecoveryRecord & {
  org_name: string
  customer_name: string
  customer_phone: string
}

const TABLE_LABELS: Record<RecoveryTable, string> = {
  deleted_customers: 'Customers',
  deleted_activities: 'Activities',
  deleted_vehicles: 'Vehicles',
  deleted_ledger_transactions: 'Ledger Transactions',
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 2) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function remaining(iso: string): { text: string; cls: string } {
  const ms = new Date(iso).getTime() - Date.now()
  const hrs = Math.max(0, Math.floor(ms / 3600000))
  const days = Math.floor(hrs / 24)
  const remHrs = hrs % 24
  const text = `${days}d ${remHrs}h`
  const cls =
    hrs < 24 ? 'text-red-600' :
    hrs < 72 ? 'text-yellow-700' :
               'text-green-700'
  return { text, cls }
}

function summarize(table: RecoveryTable, rowData: Record<string, unknown>): string {
  if (table === 'deleted_customers') {
    const name = typeof rowData.name === 'string' ? rowData.name : null
    return name?.trim() || '(customer)'
  }
  if (table === 'deleted_activities') {
    const type = typeof rowData.type === 'string' ? rowData.type : 'activity'
    const due = typeof rowData.due_at === 'string' ? rowData.due_at : null
    return due ? `${type} · ${new Date(due).toLocaleString()}` : type
  }
  if (table === 'deleted_vehicles') {
    const year = rowData.year
    const make = rowData.make
    const model = rowData.model
    return [year, make, model].filter(Boolean).join(' ') || '(vehicle)'
  }
  const vendor = typeof rowData.vendor_norm === 'string' ? rowData.vendor_norm : null
  const amt = typeof rowData.amount_total === 'number' ? rowData.amount_total : null
  return `${vendor ?? '(transaction)'}${amt != null ? ` · $${amt.toFixed(2)}` : ''}`
}

export default function AdminDataRecoveryPage() {
  const searchParams = useSearchParams()
  const initialOrgId = searchParams.get('org_id') ?? ''
  const initialTable = (searchParams.get('table') as RecoveryTable | null) ?? 'deleted_customers'

  const [orgId, setOrgId] = useState(initialOrgId)
  const [table, setTable] = useState<RecoveryTable>(initialTable)
  const [loading, setLoading] = useState(false)
  const [records, setRecords] = useState<RecoveryRecord[]>([])
  const [error, setError] = useState<string | null>(null)

  const [customerQ, setCustomerQ] = useState('')
  const [customerLoading, setCustomerLoading] = useState(false)
  const [customerError, setCustomerError] = useState<string | null>(null)
  const [customerResults, setCustomerResults] = useState<DeletedCustomerSearchRow[]>([])

  const canSearch = useMemo(() => orgId.trim().length > 0, [orgId])
  const canCustomerSearch = useMemo(() => customerQ.trim().length >= 2, [customerQ])

  async function load() {
    if (!canSearch) return
    setLoading(true)
    setError(null)
    try {
      const url = `/api/admin/data-recovery?org_id=${encodeURIComponent(orgId.trim())}&table=${encodeURIComponent(table)}`
      const res = await fetch(url)
      const data = (await res.json().catch(() => ({}))) as { records?: RecoveryRecord[]; error?: string }
      if (!res.ok) {
        setError(data.error ?? 'Failed to load recovery records')
        setRecords([])
        return
      }
      setRecords(Array.isArray(data.records) ? data.records : [])
    } catch {
      setError('Failed to load recovery records')
      setRecords([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (initialOrgId) void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function restore(recoveryId: string) {
    const ok = confirm('Restore this record to the dealer’s account?')
    if (!ok) return
    try {
      const res = await fetch(`/api/admin/data-recovery/${recoveryId}/restore?table=${encodeURIComponent(table)}`, {
        method: 'POST',
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        toast.error(data.error ?? 'Restore failed')
        return
      }
      setRecords(prev => prev.map(r => r.recovery_id === recoveryId ? { ...r, restored_at: new Date().toISOString() } : r))
      toast.success('Restored')
    } catch {
      toast.error('Restore failed')
    }
  }

  async function purge(recoveryId: string) {
    const ok = confirm('Permanently purge this record? This cannot be undone.')
    if (!ok) return
    try {
      const res = await fetch(`/api/admin/data-recovery/${recoveryId}/purge?table=${encodeURIComponent(table)}`, {
        method: 'POST',
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        toast.error(data.error ?? 'Purge failed')
        return
      }
      setRecords(prev => prev.filter(r => r.recovery_id !== recoveryId))
      toast.success('Purged')
    } catch {
      toast.error('Purge failed')
    }
  }

  async function searchDeletedCustomers() {
    if (!canCustomerSearch) return
    setCustomerLoading(true)
    setCustomerError(null)
    try {
      const url = `/api/admin/data-recovery/search?q=${encodeURIComponent(customerQ.trim())}&limit=20`
      const res = await fetch(url)
      const data = (await res.json().catch(() => ({}))) as { results?: DeletedCustomerSearchRow[]; error?: string }
      if (!res.ok) {
        setCustomerError(data.error ?? 'Search failed')
        setCustomerResults([])
        return
      }
      setCustomerResults(Array.isArray(data.results) ? data.results : [])
    } catch {
      setCustomerError('Search failed')
      setCustomerResults([])
    } finally {
      setCustomerLoading(false)
    }
  }

  async function restoreCustomer(recoveryId: string) {
    const ok = confirm('Restore this customer to the dealer’s account?')
    if (!ok) return
    try {
      const res = await fetch(`/api/admin/data-recovery/${recoveryId}/restore?table=deleted_customers`, { method: 'POST' })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        toast.error(data.error ?? 'Restore failed')
        return
      }
      setCustomerResults(prev => prev.map(r => r.recovery_id === recoveryId ? { ...r, restored_at: new Date().toISOString() } : r))
      toast.success('Restored')
    } catch {
      toast.error('Restore failed')
    }
  }

  return (
    <div>
      <TopBar title="Data Recovery" />
      <div className="px-4 py-4 lg:px-6 space-y-4">
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Find Deleted Customer</p>
              <p className="text-xs text-muted-foreground">Search by name or phone across all orgs.</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              value={customerQ}
              onChange={e => setCustomerQ(e.target.value)}
              placeholder="Search by name or phone…"
              onKeyDown={e => {
                if (e.key === 'Enter') void searchDeletedCustomers()
              }}
            />
            <Button
              onClick={searchDeletedCustomers}
              disabled={!canCustomerSearch || customerLoading}
              className="sm:w-32"
            >
              {customerLoading ? 'Searching…' : 'Search'}
            </Button>
          </div>

          {customerError && <div className="text-sm text-red-600">{customerError}</div>}

          <div className="rounded-lg border overflow-hidden">
            <div className="grid grid-cols-12 gap-2 px-3 py-2 border-b text-xs font-semibold text-muted-foreground">
              <div className="col-span-3">Name</div>
              <div className="col-span-2">Phone</div>
              <div className="col-span-3">Dealer</div>
              <div className="col-span-2">Deleted</div>
              <div className="col-span-1">Expires</div>
              <div className="col-span-1 text-right">Action</div>
            </div>
            {customerResults.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                {customerLoading ? 'Searching…' : 'No deleted customers match that search.'}
              </div>
            ) : (
              <div className="divide-y">
                {customerResults.map(r => {
                  const exp = remaining(r.expires_at)
                  const isExpired = new Date(r.expires_at).getTime() <= Date.now()
                  const isRestored = !!r.restored_at
                  return (
                    <div key={r.recovery_id} className="grid grid-cols-12 gap-2 px-3 py-3 items-start">
                      <div className="col-span-3">
                        <p className="text-sm font-medium">{r.customer_name}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{r.original_id}</p>
                      </div>
                      <div className="col-span-2 text-sm">{r.customer_phone}</div>
                      <div className="col-span-3 text-sm">{r.org_name}</div>
                      <div className="col-span-2 text-xs text-muted-foreground">{timeAgo(r.deleted_at)}</div>
                      <div className={`col-span-1 text-xs font-medium ${isExpired ? 'text-gray-500' : exp.cls}`}>
                        {isExpired ? 'Expired' : exp.text}
                      </div>
                      <div className="col-span-1 flex justify-end">
                        {isRestored ? (
                          <span className="text-xs font-semibold text-green-700">Restored ✓</span>
                        ) : isExpired ? (
                          <span className="text-xs font-semibold text-gray-600">Expired</span>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => void restoreCustomer(r.recovery_id)}>
                            Restore
                          </Button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-xl border bg-card p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="sm:col-span-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Org ID</p>
              <Input value={orgId} onChange={e => setOrgId(e.target.value)} placeholder="Paste org UUID…" />
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Table</p>
              <select
                value={table}
                onChange={e => setTable(e.target.value as RecoveryTable)}
                className="h-10 w-full rounded-md border border-border bg-background px-2 text-sm"
              >
                {(Object.keys(TABLE_LABELS) as RecoveryTable[]).map(t => (
                  <option key={t} value={t}>{TABLE_LABELS[t]}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2">
            <Button onClick={load} disabled={!canSearch || loading} variant="outline">
              {loading ? 'Loading…' : 'Search'}
            </Button>
            <Button onClick={load} disabled={!canSearch || loading}>
              Refresh
            </Button>
          </div>
          {error && (
            <div className="text-sm text-red-600">{error}</div>
          )}
        </div>

        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="grid grid-cols-12 gap-2 px-3 py-2 border-b text-xs font-semibold text-muted-foreground">
            <div className="col-span-5">Record</div>
            <div className="col-span-2">Deleted</div>
            <div className="col-span-2">Expires</div>
            <div className="col-span-3 text-right">Actions</div>
          </div>
          {records.length === 0 ? (
            <div className="px-3 py-10 text-center text-sm text-muted-foreground">
              {loading ? 'Loading…' : 'No records found.'}
            </div>
          ) : (
            <div className="divide-y">
              {records.map(r => {
                const exp = remaining(r.expires_at)
                const label = summarize(table, r.row_data)
                const isRestored = !!r.restored_at
                return (
                  <div key={r.recovery_id} className="grid grid-cols-12 gap-2 px-3 py-3 items-start">
                    <div className="col-span-5">
                      <p className="text-sm font-medium">{label}</p>
                      <p className="text-[11px] text-muted-foreground">{table.replace('deleted_', '')}</p>
                    </div>
                    <div className="col-span-2 text-xs text-muted-foreground">{timeAgo(r.deleted_at)}</div>
                    <div className={`col-span-2 text-xs font-medium ${exp.cls}`}>{exp.text} left</div>
                    <div className="col-span-3 flex justify-end gap-2">
                      {isRestored ? (
                        <span className="text-xs font-semibold text-green-700">Restored ✓</span>
                      ) : (
                        <>
                          <Button size="sm" variant="outline" onClick={() => restore(r.recovery_id)}>Restore</Button>
                          <Button size="sm" variant="destructive" onClick={() => purge(r.recovery_id)}>Purge</Button>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

