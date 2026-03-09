'use client'

import { useState, useEffect, useCallback } from 'react'
import { HardDrive, FileText, ExternalLink, Trash2, X, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react'
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

interface StorageData {
  used_bytes: number
  used_mb: number
  limit_mb: number
  pct: number
  doc_count: number
  vehicles: VehicleEntry[]
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

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/settings/storage')
      .then(r => r.json())
      .then(d => setData(d))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  function toggleVehicle(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function handleDelete(vehicleId: string, docId: string) {
    setDeleting(docId)
    const res = await fetch(`/api/vehicles/${vehicleId}/documents/${docId}`, { method: 'DELETE' })
    if (res.ok) {
      setData(prev => {
        if (!prev) return prev
        const vehicles = prev.vehicles
          .map(v => v.vehicle_id !== vehicleId ? v : {
            ...v,
            doc_count: v.doc_count - 1,
            total_bytes: v.total_bytes - (v.docs.find(d => d.id === docId)?.file_size ?? 0),
            docs: v.docs.filter(d => d.id !== docId),
          })
          .filter(v => v.doc_count > 0)
        const removedBytes = prev.vehicles
          .find(v => v.vehicle_id === vehicleId)?.docs.find(d => d.id === docId)?.file_size ?? 0
        const usedBytes = prev.used_bytes - removedBytes
        return {
          ...prev,
          used_bytes: usedBytes,
          used_mb: parseFloat((usedBytes / (1024 * 1024)).toFixed(1)),
          pct: parseFloat(((usedBytes / (prev.limit_mb * 1024 * 1024)) * 100).toFixed(1)),
          doc_count: prev.doc_count - 1,
          vehicles,
        }
      })
    }
    setDeleting(null)
    setConfirmDelete(null)
  }

  if (loading) return <p className="text-xs text-muted-foreground py-2">Loading storage info…</p>
  if (!data) return null

  const { used_mb, limit_mb, pct, doc_count, vehicles } = data
  const barWidth = Math.min(pct, 100)

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
          <div
            className={`h-full rounded-full transition-all ${barColor(pct)}`}
            style={{ width: `${barWidth}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{doc_count} document{doc_count !== 1 ? 's' : ''} across {vehicles.length} vehicle{vehicles.length !== 1 ? 's' : ''}</span>
          <span>{pct}% used</span>
        </div>
        {pct >= 85 && (
          <div className="flex items-start gap-2 text-xs bg-orange-500/10 text-orange-700 dark:text-orange-400 rounded-md px-3 py-2">
            <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
            Storage is nearly full. Delete unused documents to continue uploading.
          </div>
        )}
      </div>

      {/* Document list by vehicle */}
      {vehicles.length > 0 && (
        <div className="rounded-lg border bg-card overflow-hidden divide-y">
          {vehicles.map(v => (
            <div key={v.vehicle_id}>
              <button
                onClick={() => toggleVehicle(v.vehicle_id)}
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
                  {expanded.has(v.vehicle_id)
                    ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                    : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
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
                        <Link
                          href={`/vehicles/${v.vehicle_id}`}
                          className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
                          title="Go to vehicle"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
                        {confirmDelete === doc.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleDelete(v.vehicle_id, doc.id)}
                              disabled={deleting === doc.id}
                              className="text-destructive text-[10px] font-medium px-1.5 py-0.5 rounded border border-destructive/40 disabled:opacity-50"
                            >
                              {deleting === doc.id ? '…' : 'Del'}
                            </button>
                            <button onClick={() => setConfirmDelete(null)} className="text-muted-foreground p-0.5">
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDelete(doc.id)}
                            className="p-1.5 text-muted-foreground hover:text-destructive transition-colors"
                            title="Delete document"
                          >
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
