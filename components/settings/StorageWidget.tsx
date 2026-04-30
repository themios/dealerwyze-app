'use client'

import { useState, useEffect, useCallback } from 'react'
import { HardDrive, FileText, ExternalLink, Trash2, X, ChevronDown, ChevronRight, AlertTriangle, User, Zap } from 'lucide-react'
import Link from 'next/link'

interface DocEntry {
  id: string
  label: string
  file_name: string
  file_size: number | null
  created_at: string
}

interface VehicleEntry {
  vehicle_id: string
  label: string
  status: string
  doc_count: number
  total_bytes: number
  docs: DocEntry[]
}

interface CustomerEntry {
  customer_id: string
  label: string
  doc_count: number
  total_bytes: number
  docs: DocEntry[]
}

interface StorageData {
  used_bytes: number
  used_mb: number
  limit_mb: number
  quota_bytes: number
  pct: number
  doc_count: number
  storage_pack: string
  storage_pack_expires_at: string | null
  months_to_full: number | null
  mb_per_month: number
  vehicles: VehicleEntry[]
  customers: CustomerEntry[]
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return '—'
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function barColor(pct: number): string {
  if (pct >= 100) return 'bg-red-500'
  if (pct >= 85) return 'bg-orange-500'
  if (pct >= 60) return 'bg-yellow-500'
  return 'bg-green-500'
}

function barTextColor(pct: number): string {
  if (pct >= 100) return 'text-red-600 dark:text-red-400'
  if (pct >= 85) return 'text-orange-600 dark:text-orange-400'
  if (pct >= 60) return 'text-yellow-600 dark:text-yellow-500'
  return 'text-green-600 dark:text-green-400'
}

export default function StorageWidget() {
  const [data, setData] = useState<StorageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [upgrading, setUpgrading] = useState<string | null>(null)
  const [upgradeError, setUpgradeError] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/settings/storage')
      .then(r => r.json())
      .then(d => setData(d))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    let cancelled = false

    fetch('/api/settings/storage')
      .then(r => r.json())
      .then(d => {
        if (!cancelled) setData(d)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  function toggle(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function deleteVehicleDoc(vehicleId: string, docId: string) {
    setDeleting(docId)
    const res = await fetch(`/api/vehicles/${vehicleId}/documents/${docId}`, { method: 'DELETE' })
    if (res.ok) {
      setData(prev => {
        if (!prev) return prev
        const removed = prev.vehicles.find(v => v.vehicle_id === vehicleId)?.docs.find(d => d.id === docId)?.file_size ?? 0
        const vehicles = prev.vehicles
          .map(v => v.vehicle_id !== vehicleId ? v : {
            ...v,
            doc_count: v.doc_count - 1,
            total_bytes: v.total_bytes - removed,
            docs: v.docs.filter(d => d.id !== docId),
          })
          .filter(v => v.doc_count > 0)
        const usedBytes = prev.used_bytes - removed
        return { ...prev, used_bytes: usedBytes, used_mb: parseFloat((usedBytes / (1024 * 1024)).toFixed(1)), pct: parseFloat(((usedBytes / (prev.limit_mb * 1024 * 1024)) * 100).toFixed(1)), doc_count: prev.doc_count - 1, vehicles }
      })
    }
    setDeleting(null)
    setConfirmDelete(null)
  }

  async function deleteCustomerDoc(customerId: string, docId: string) {
    setDeleting(docId)
    const res = await fetch(`/api/customers/${customerId}/documents/${docId}`, { method: 'DELETE' })
    if (res.ok) {
      setData(prev => {
        if (!prev) return prev
        const removed = prev.customers.find(c => c.customer_id === customerId)?.docs.find(d => d.id === docId)?.file_size ?? 0
        const customers = prev.customers
          .map(c => c.customer_id !== customerId ? c : {
            ...c,
            doc_count: c.doc_count - 1,
            total_bytes: c.total_bytes - removed,
            docs: c.docs.filter(d => d.id !== docId),
          })
          .filter(c => c.doc_count > 0)
        const usedBytes = prev.used_bytes - removed
        return { ...prev, used_bytes: usedBytes, used_mb: parseFloat((usedBytes / (1024 * 1024)).toFixed(1)), pct: parseFloat(((usedBytes / (prev.limit_mb * 1024 * 1024)) * 100).toFixed(1)), doc_count: prev.doc_count - 1, customers }
      })
    }
    setDeleting(null)
    setConfirmDelete(null)
  }

  async function upgradePack(pack: '10gb' | '25gb') {
    setUpgrading(pack)
    setUpgradeError(null)
    const res = await fetch('/api/stripe/storage-pack', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pack }),
    })
    if (res.ok) {
      load()
    } else {
      const body = await res.json().catch(() => ({}))
      setUpgradeError(body.error ?? 'Could not add storage pack. Please try again.')
    }
    setUpgrading(null)
  }

  if (loading) return <p className="text-xs text-muted-foreground py-2">Loading storage info…</p>
  if (!data) return null

  const { used_mb, limit_mb, pct, doc_count, storage_pack, months_to_full, mb_per_month, vehicles, customers } = data
  const showUpsell = pct >= 60 && storage_pack === 'none'
  const barWidth = Math.min(pct, 100)
  const totalGroups = vehicles.length + customers.length

  return (
    <div className="space-y-3">
      {/* Usage bar */}
      <div className="p-4 rounded-lg border bg-card space-y-2">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-medium">
            <HardDrive className="h-4 w-4 text-muted-foreground" />
            Document Storage
          </span>
          <span className={`text-xs font-semibold ${barTextColor(pct)}`}>
            {used_mb} MB / {limit_mb} MB
          </span>
        </div>
        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
          <div className={`h-full rounded-full transition-all ${barColor(pct)}`} style={{ width: `${barWidth}%` }} />
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {doc_count} document{doc_count !== 1 ? 's' : ''}
            {vehicles.length > 0 && ` · ${vehicles.length} vehicle${vehicles.length !== 1 ? 's' : ''}`}
            {customers.length > 0 && ` · ${customers.length} lead${customers.length !== 1 ? 's' : ''}`}
          </span>
          <span>{pct}% used</span>
        </div>
        {pct >= 85 && (
          <div className="flex items-start gap-2 text-xs bg-orange-500/10 text-orange-700 dark:text-orange-400 rounded-md px-3 py-2">
            <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
            Storage nearly full. Delete unused documents or upgrade your plan below.
          </div>
        )}
      </div>

      {/* Upsell banner — shown at >60% usage when no pack active */}
      {showUpsell && (
        <div className="rounded-lg border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/40 p-4 space-y-3">
          <div className="flex items-start gap-2">
            <Zap className="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-blue-900 dark:text-blue-200">Need more storage?</p>
              <p className="text-xs text-blue-700 dark:text-blue-400 mt-0.5">
                {months_to_full !== null
                  ? `At your current rate (${mb_per_month.toFixed(0)} MB/mo) you'll fill up in ~${months_to_full} month${months_to_full !== 1 ? 's' : ''}.`
                  : 'Upgrade to store contracts, purchase agreements, and more.'}
              </p>
            </div>
          </div>
          {upgradeError && (
            <p className="text-xs text-destructive">{upgradeError}</p>
          )}
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              onClick={() => upgradePack('10gb')}
              disabled={upgrading !== null}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-md bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-semibold px-3 py-2 transition-colors"
            >
              {upgrading === '10gb' ? 'Processing…' : '10 GB — $4.99/mo'}
            </button>
            <button
              onClick={() => upgradePack('25gb')}
              disabled={upgrading !== null}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-md border border-blue-600 text-blue-700 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 disabled:opacity-60 text-xs font-semibold px-3 py-2 transition-colors"
            >
              {upgrading === '25gb' ? 'Processing…' : '25 GB — $9.99/mo'}
            </button>
          </div>
          <p className="text-[10px] text-blue-600/70 dark:text-blue-500/60">
            Added to your existing subscription. Cancel anytime. Files are retained for 90 days after cancellation.
          </p>
        </div>
      )}

      {/* Active pack info */}
      {storage_pack !== 'none' && (
        <div className="rounded-lg border bg-card px-4 py-2.5 flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm">
            <Zap className="h-3.5 w-3.5 text-green-500" />
            <span className="font-medium">Document Vault {storage_pack === '10gb' ? '10 GB' : '25 GB'}</span>
            <span className="text-xs text-muted-foreground">active</span>
          </span>
          {months_to_full !== null && (
            <span className="text-xs text-muted-foreground">~{months_to_full}mo until full</span>
          )}
        </div>
      )}

      {/* Vehicle docs */}
      {vehicles.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 px-1">Vehicles</p>
          <div className="rounded-lg border bg-card overflow-hidden divide-y">
            {vehicles.map(v => (
              <div key={v.vehicle_id}>
                <button
                  onClick={() => toggle(v.vehicle_id)}
                  className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-accent transition-colors text-left"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <FileText className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    <span className="text-sm font-medium truncate">{v.label}</span>
                    {v.status === 'sold' && (
                      <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full flex-shrink-0">Sold</span>
                    )}
                  </span>
                  <span className="flex items-center gap-2 flex-shrink-0 ml-2">
                    <span className="text-xs text-muted-foreground">{v.doc_count} doc{v.doc_count !== 1 ? 's' : ''} · {formatBytes(v.total_bytes)}</span>
                    {expanded.has(v.vehicle_id) ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                  </span>
                </button>
                {expanded.has(v.vehicle_id) && (
                  <div className="bg-muted/30 px-4 py-2 space-y-1.5">
                    {v.docs.map(doc => (
                      <div key={doc.id} className="flex items-center gap-2 py-1">
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium">{doc.label}</span>
                          <span className="text-xs text-muted-foreground ml-2">{formatBytes(doc.file_size)}</span>
                          <p className="text-xs text-muted-foreground truncate">{doc.file_name}</p>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <Link href={`/vehicles/${v.vehicle_id}`} className="p-1.5 text-muted-foreground hover:text-foreground transition-colors" title="Go to vehicle">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Link>
                          {confirmDelete === doc.id ? (
                            <div className="flex items-center gap-1">
                              <button onClick={() => deleteVehicleDoc(v.vehicle_id, doc.id)} disabled={deleting === doc.id} className="text-destructive text-[10px] font-medium px-1.5 py-0.5 rounded border border-destructive/40 disabled:opacity-50">
                                {deleting === doc.id ? '…' : 'Del'}
                              </button>
                              <button onClick={() => setConfirmDelete(null)} className="text-muted-foreground p-0.5"><X className="h-3 w-3" /></button>
                            </div>
                          ) : (
                            <button onClick={() => setConfirmDelete(doc.id)} className="p-1.5 text-muted-foreground hover:text-destructive transition-colors" title="Delete">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Customer docs */}
      {customers.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 px-1">Leads / Customers</p>
          <div className="rounded-lg border bg-card overflow-hidden divide-y">
            {customers.map(c => (
              <div key={c.customer_id}>
                <button
                  onClick={() => toggle(c.customer_id)}
                  className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-accent transition-colors text-left"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <User className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    <span className="text-sm font-medium truncate">{c.label}</span>
                  </span>
                  <span className="flex items-center gap-2 flex-shrink-0 ml-2">
                    <span className="text-xs text-muted-foreground">{c.doc_count} doc{c.doc_count !== 1 ? 's' : ''} · {formatBytes(c.total_bytes)}</span>
                    {expanded.has(c.customer_id) ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                  </span>
                </button>
                {expanded.has(c.customer_id) && (
                  <div className="bg-muted/30 px-4 py-2 space-y-1.5">
                    {c.docs.map(doc => (
                      <div key={doc.id} className="flex items-center gap-2 py-1">
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium">{doc.label}</span>
                          <span className="text-xs text-muted-foreground ml-2">{formatBytes(doc.file_size)}</span>
                          <p className="text-xs text-muted-foreground truncate">{doc.file_name}</p>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <Link href={`/customers/${c.customer_id}`} className="p-1.5 text-muted-foreground hover:text-foreground transition-colors" title="Go to lead">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Link>
                          {confirmDelete === doc.id ? (
                            <div className="flex items-center gap-1">
                              <button onClick={() => deleteCustomerDoc(c.customer_id, doc.id)} disabled={deleting === doc.id} className="text-destructive text-[10px] font-medium px-1.5 py-0.5 rounded border border-destructive/40 disabled:opacity-50">
                                {deleting === doc.id ? '…' : 'Del'}
                              </button>
                              <button onClick={() => setConfirmDelete(null)} className="text-muted-foreground p-0.5"><X className="h-3 w-3" /></button>
                            </div>
                          ) : (
                            <button onClick={() => setConfirmDelete(doc.id)} className="p-1.5 text-muted-foreground hover:text-destructive transition-colors" title="Delete">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {totalGroups === 0 && (
        <p className="text-xs text-muted-foreground text-center py-4">No documents uploaded yet.</p>
      )}

      {/* Disclaimer */}
      <p className="text-[10px] text-muted-foreground leading-relaxed px-1">
        Document storage is provided as a convenience for quick reference only. DealerWyze is not a certified system of record.
        Do not rely on this service as your sole copy of title documents, contracts, or any legally required records.
        Maintain independent backups. See Terms of Service for retention and liability limitations.
      </p>
    </div>
  )
}
