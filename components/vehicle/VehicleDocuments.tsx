'use client'

import { useState, useRef, useEffect } from 'react'
import { VehicleDocument } from '@/types'
import { Button } from '@/components/ui/button'
import { FileText, ExternalLink, Trash2, Upload, X, ChevronDown, ChevronRight } from 'lucide-react'
import Link from 'next/link'

const DOC_LABELS = [
  'Carfax',
  'Autocheck',
  'NVMTIS',
  'KBB',
  'Title',
  'Inspection',
  'Window Sticker',
  'Service Records',
  'Other',
]

function formatBytes(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function VehicleDocuments({ vehicleId, vehicleStatus }: { vehicleId: string; vehicleStatus?: string }) {
  const isSold = vehicleStatus === 'sold'
  const [open, setOpen] = useState(false)
  const [docs, setDocs] = useState<(VehicleDocument & { signed_url?: string | null })[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [selectedLabel, setSelectedLabel] = useState<string>(DOC_LABELS[0])
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Compress images client-side before upload (target ~800 KB)
  async function compressImage(file: File): Promise<File> {
    const isPdf = file.type === 'application/pdf'
    if (isPdf) return file // PDFs can't be compressed in-browser meaningfully

    return new Promise<File>((resolve) => {
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
          0.82 // quality — yields ~400–800 KB for typical car photos
        )
      }
      img.onerror = () => { URL.revokeObjectURL(url); resolve(file) }
      img.src = url
    })
  }

  // Load documents when first opened
  useEffect(() => {
    if (!open || loading || docs.length > 0) return
    setLoading(true)
    fetch(`/api/vehicles/${vehicleId}/documents`)
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setDocs(data) })
      .finally(() => setLoading(false))
  }, [open, vehicleId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.files?.[0]
    if (!raw) return
    setUploadError(null)
    setUploading(true)

    const file = await compressImage(raw)
    const form = new FormData()
    form.append('file', file)
    form.append('label', selectedLabel)

    try {
      const res = await fetch(`/api/vehicles/${vehicleId}/documents`, { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) {
        const msg = res.status === 413
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
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleDelete(id: string) {
    // Optimistic remove
    setDocs(prev => prev.filter(d => d.id !== id))
    setConfirmDelete(null)
    await fetch(`/api/vehicles/${vehicleId}/documents/${id}`, { method: 'DELETE' })
  }

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-accent transition-colors"
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          <FileText className="h-4 w-4 text-muted-foreground" />
          Documents
          {docs.length > 0 && (
            <span className="text-xs text-muted-foreground font-normal">({docs.length})</span>
          )}
        </span>
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </button>

      {open && (
        <div className="border-t px-3 pb-3 pt-2 space-y-3">

          {/* Upload row — disabled for sold vehicles */}
          {isSold ? (
            <p className="text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
              Uploads disabled — vehicle is sold. Existing documents are read-only.
            </p>
          ) : (
            <>
              <div className="flex gap-2 items-center flex-wrap">
                <select
                  value={selectedLabel}
                  onChange={e => setSelectedLabel(e.target.value)}
                  className="text-sm rounded-md border border-border bg-background px-2 py-1.5 h-9 flex-shrink-0"
                >
                  {DOC_LABELS.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploading ? (
                    <span className="animate-spin h-3.5 w-3.5 border-2 border-current border-t-transparent rounded-full" />
                  ) : (
                    <Upload className="h-3.5 w-3.5" />
                  )}
                  {uploading ? 'Uploading…' : 'Upload'}
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>
              {uploadError && (
                uploadError === 'storage_full' ? (
                  <div className="text-xs bg-orange-500/10 text-orange-700 dark:text-orange-400 rounded-md px-3 py-2 space-y-1">
                    <p className="font-medium">Storage limit reached</p>
                    <p>Your dealership has used all available document storage (500 MB). Delete unused documents to free up space, then try again.</p>
                    <Link href="/settings" className="underline font-medium">Manage documents in Settings</Link>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 rounded-md px-3 py-2">
                    <X className="h-3.5 w-3.5 flex-shrink-0" />
                    {uploadError}
                  </div>
                )
              )}
            </>
          )}

          {/* Document list */}
          {loading ? (
            <p className="text-xs text-muted-foreground text-center py-3">Loading…</p>
          ) : docs.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-3">No documents yet. Upload a Carfax, KBB, or other file above.</p>
          ) : (
            <div className="space-y-2">
              {docs.map(doc => (
                <div key={doc.id} className="flex items-center gap-2 p-2.5 rounded-lg border bg-background">
                  <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium leading-snug">{doc.label}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {doc.file_name}{doc.file_size ? ` · ${formatBytes(doc.file_size)}` : ''}
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
                      onClick={() => handleDelete(doc.id)}
                          className="text-destructive text-[10px] font-medium px-1.5 py-0.5 rounded border border-destructive/40"
                        >
                          Del
                        </button>
                        <button onClick={() => setConfirmDelete(null)} className="text-muted-foreground p-0.5">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDelete(doc.id)}
                        className="p-1.5 text-muted-foreground hover:text-destructive transition-colors"
                        title="Delete"
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
      )}
    </div>
  )
}
