'use client'

import { useState, useRef, useEffect } from 'react'
import type { VehicleDocument } from '@/types'
import { Button } from '@/components/ui/button'
import { FileText, ExternalLink, Trash2, Upload, X, ChevronDown, ChevronRight, Globe, Lock } from 'lucide-react'
import Link from 'next/link'

/** Shown on the public VDP; summarized for AI overview when uploaded. */
const WEBSITE_LABELS = [
  'Carfax',
  'Autocheck',
  'NVMTIS',
  'KBB',
  'Window sticker',
  'Inspection report',
  'Other (shopper)',
]

/** Dealer-only — never on the website or in AI context. */
const INVENTORY_LABELS = [
  'Bill of sale',
  'Smog certificate',
  'Mechanic / repair receipt',
  'Title paperwork',
  'Auction paperwork',
  'Other (private)',
]

function formatBytes(bytes: number): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function isWebsiteDoc(d: VehicleDocument): boolean {
  return d.document_scope !== 'inventory'
}

type DocumentScopeProp = 'website' | 'inventory' | 'both'

export default function VehicleDocuments({
  vehicleId,
  vehicleStatus,
  documentScope = 'both',
}: {
  vehicleId: string
  vehicleStatus?: string
  /** `website`: shopper-facing only. `inventory`: private dealer files only. `both`: accordion with both panels. */
  documentScope?: DocumentScopeProp
}) {
  const isSold = vehicleStatus === 'sold'
  const [websiteOpen, setWebsiteOpen] = useState(documentScope !== 'inventory')
  const [inventoryOpen, setInventoryOpen] = useState(documentScope === 'inventory')
  const [docs, setDocs] = useState<(VehicleDocument & { signed_url?: string | null })[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadingScope, setUploadingScope] = useState<'website' | 'inventory' | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [selectedWebsiteLabel, setSelectedWebsiteLabel] = useState(WEBSITE_LABELS[0])
  const [selectedInventoryLabel, setSelectedInventoryLabel] = useState(INVENTORY_LABELS[0])
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pendingScope = useRef<'website' | 'inventory'>('website')
  const fetchedRef = useRef(false)

  const websiteDocs = docs.filter(isWebsiteDoc)
  const inventoryDocs = docs.filter(d => d.document_scope === 'inventory')

  async function compressImage(file: File): Promise<File> {
    const isPdf = file.type === 'application/pdf'
    if (isPdf) return file

    return new Promise<File>(resolve => {
      const img = new Image()
      const url = URL.createObjectURL(file)
      img.onload = () => {
        URL.revokeObjectURL(url)
        const MAX_DIM = 2048
        let { width, height } = img
        if (width > MAX_DIM || height > MAX_DIM) {
          const ratio = Math.min(MAX_DIM / width, MAX_DIM / height)
          width = Math.round(width * ratio)
          height = Math.round(height * ratio)
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)
        canvas.toBlob(
          blob => {
            if (blob) resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }))
            else resolve(file)
          },
          'image/jpeg',
          0.82,
        )
      }
      img.onerror = () => {
        URL.revokeObjectURL(url)
        resolve(file)
      }
      img.src = url
    })
  }

  useEffect(() => {
    fetchedRef.current = false
    setDocs([])
  }, [vehicleId])

  useEffect(() => {
    const combined = documentScope
    const eagerOpen = combined === 'website' || combined === 'inventory'
    const shouldFetch =
      eagerOpen || (combined === 'both' && (websiteOpen || inventoryOpen))

    if (!shouldFetch) return
    if (fetchedRef.current) return
    fetchedRef.current = true
    setLoading(true)
    fetch(`/api/vehicles/${vehicleId}/documents`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setDocs(data)
      })
      .finally(() => setLoading(false))
  }, [websiteOpen, inventoryOpen, vehicleId, documentScope])

  function triggerUpload(scope: 'website' | 'inventory') {
    pendingScope.current = scope
    setUploadingScope(scope)
    fileInputRef.current?.click()
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.files?.[0]
    if (!raw) return
    setUploadError(null)
    setUploading(true)

    const scope = pendingScope.current

    const file = await compressImage(raw)
    const form = new FormData()
    form.append('file', file)
    form.append(
      'label',
      scope === 'website' ? selectedWebsiteLabel : selectedInventoryLabel,
    )
    form.append('document_scope', scope)

    try {
      const res = await fetch(`/api/vehicles/${vehicleId}/documents`, { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) {
        const msg =
          res.status === 413
            ? 'storage_full'
            : res.status === 400 && data.error?.includes('5 MB')
              ? 'Your file is too large. Please use a file under 5 MB and try again.'
              : data.error ?? 'Something went wrong. Please try again.'
        setUploadError(msg)
      } else {
        setDocs(prev => [data, ...prev])
      }
    } catch {
      setUploadError('Upload failed')
    } finally {
      setUploading(false)
      setUploadingScope(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleDelete(idDoc: string) {
    setDocs(prev => prev.filter(d => d.id !== idDoc))
    setConfirmDelete(null)
    await fetch(`/api/vehicles/${vehicleId}/documents/${idDoc}`, { method: 'DELETE' })
  }

  function renderDocRow(doc: VehicleDocument & { signed_url?: string | null }) {
    return (
      <div key={doc.id} className="flex items-center gap-2 p-2.5 rounded-lg border bg-background">
        <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium leading-snug">{doc.label}</p>
          <p className="text-xs text-muted-foreground truncate">
            {doc.file_name}
            {doc.file_size ? ` · ${formatBytes(doc.file_size)}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {doc.signed_url && (
            <a
              href={doc.signed_url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
              title="Open document"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
          {confirmDelete === doc.id ? (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => handleDelete(doc.id)}
                className="text-destructive text-[10px] font-medium px-1.5 py-0.5 rounded border border-destructive/40"
              >
                Del
              </button>
              <button type="button" onClick={() => setConfirmDelete(null)} className="text-muted-foreground p-0.5">
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(doc.id)}
              className="p-1.5 text-muted-foreground hover:text-destructive transition-colors"
              title="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    )
  }

  function websiteHeading(collapsible: boolean) {
    const header = (
      <span className="flex items-center gap-2 text-sm font-medium">
        <Globe className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
        Website & shopper documents
        {websiteDocs.length > 0 && (
          <span className="text-xs text-muted-foreground font-normal">({websiteDocs.length})</span>
        )}
      </span>
    )

    if (!collapsible) {
      return (
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          {header}
        </div>
      )
    }

    return (
      <button
        type="button"
        onClick={() => setWebsiteOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-accent transition-colors shrink-0"
      >
        {header}
        {websiteOpen ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
      </button>
    )
  }

  function inventoryHeading(collapsible: boolean) {
    const header = (
      <span className="flex items-center gap-2 text-sm font-medium">
        <Lock className="h-4 w-4 text-amber-600 dark:text-amber-500" />
        Inventory (private)
        {inventoryDocs.length > 0 && (
          <span className="text-xs text-muted-foreground font-normal">({inventoryDocs.length})</span>
        )}
      </span>
    )

    if (!collapsible) {
      return (
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          {header}
        </div>
      )
    }

    return (
      <button
        type="button"
        onClick={() => setInventoryOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-accent transition-colors shrink-0"
      >
        {header}
        {inventoryOpen ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
      </button>
    )
  }

  function websiteBody() {
    return (
      <div className="border-t px-3 pb-3 pt-2 space-y-3">
        <p className="text-xs text-muted-foreground bg-emerald-500/5 dark:bg-emerald-950/20 rounded-md px-3 py-2">
          These files can appear on your public vehicle page for buyers to open. They are also summarized for AI when you
          regenerate the overview. Use for Carfax, Autocheck, KBB exports, etc. Uploads from before this split defaulted
          here — if anything sensitive slipped in, delete it and re-add under Inventory documents.
        </p>
        {isSold ? (
          <p className="text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
            Uploads disabled — vehicle is sold.
          </p>
        ) : (
          <>
            <div className="flex gap-2 items-center flex-wrap">
              <select
                value={selectedWebsiteLabel}
                onChange={e => setSelectedWebsiteLabel(e.target.value)}
                className="text-sm rounded-md border border-border bg-background px-2 py-1.5 h-9 flex-shrink-0 max-w-[min(100%,200px)]"
              >
                {WEBSITE_LABELS.map(l => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                disabled={uploading}
                onClick={() => triggerUpload('website')}
              >
                {uploading && uploadingScope === 'website' ? (
                  <span className="animate-spin h-3.5 w-3.5 border-2 border-current border-t-transparent rounded-full" />
                ) : (
                  <Upload className="h-3.5 w-3.5" />
                )}
                Upload
              </Button>
            </div>
          </>
        )}
        {loading ? (
          <p className="text-xs text-muted-foreground text-center py-3">Loading…</p>
        ) : websiteDocs.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-3">
            No shopper-facing documents yet. Add Carfax, Autocheck, or similar above.
          </p>
        ) : (
          <div className="space-y-2">{websiteDocs.map(renderDocRow)}</div>
        )}
      </div>
    )
  }

  function inventoryBody() {
    return (
      <div className="border-t px-3 pb-3 pt-2 space-y-3">
        <p className="text-xs text-muted-foreground bg-amber-500/5 dark:bg-amber-950/20 rounded-md px-3 py-2">
          Dealer-only. Never shown on your public site and not sent to listing AI. For bills of sale, smog, mechanic receipts,
          and other internal records.
        </p>
        {isSold ? (
          <p className="text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
            Uploads disabled — vehicle is sold.
          </p>
        ) : (
          <div className="flex gap-2 items-center flex-wrap">
            <select
              value={selectedInventoryLabel}
              onChange={e => setSelectedInventoryLabel(e.target.value)}
              className="text-sm rounded-md border border-border bg-background px-2 py-1.5 h-9 flex-shrink-0 max-w-[min(100%,220px)]"
            >
              {INVENTORY_LABELS.map(l => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={uploading}
              onClick={() => triggerUpload('inventory')}
            >
              {uploading && uploadingScope === 'inventory' ? (
                <span className="animate-spin h-3.5 w-3.5 border-2 border-current border-t-transparent rounded-full" />
              ) : (
                <Upload className="h-3.5 w-3.5" />
              )}
              Upload
            </Button>
          </div>
        )}
        {loading ? (
          <p className="text-xs text-muted-foreground text-center py-3">Loading…</p>
        ) : inventoryDocs.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-3">
            No private documents yet. Upload BOS, smog, repairs, etc. here.
          </p>
        ) : (
          <div className="space-y-2">{inventoryDocs.map(renderDocRow)}</div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {uploadError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {uploadError === 'storage_full' ? (
            <div className="space-y-1 text-orange-700 dark:text-orange-400">
              <p className="font-medium">Storage limit reached</p>
              <p>Delete unused files or upgrade in Settings.</p>
              <Link href="/settings" className="underline font-medium">
                Settings
              </Link>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <X className="h-3.5 w-3.5 flex-shrink-0" />
              {uploadError}
            </div>
          )}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.webp"
        className="hidden"
        onChange={handleFileChange}
      />

      {(documentScope === 'website' || documentScope === 'both') && (
        <div
          id={documentScope === 'website' ? 'vehicle-documents-website' : undefined}
          className="rounded-xl border bg-card overflow-hidden scroll-mt-20 border-emerald-500/20 flex flex-col"
        >
          {websiteHeading(documentScope === 'both')}
          {(documentScope === 'website' || websiteOpen) && websiteBody()}
        </div>
      )}

      {(documentScope === 'inventory' || documentScope === 'both') && (
        <div
          id={documentScope === 'inventory' ? 'vehicle-documents-inventory' : undefined}
          className="rounded-xl border bg-card overflow-hidden border-amber-500/15 flex flex-col"
        >
          {inventoryHeading(documentScope === 'both')}
          {(documentScope === 'inventory' || inventoryOpen) && inventoryBody()}
        </div>
      )}
    </div>
  )
}
